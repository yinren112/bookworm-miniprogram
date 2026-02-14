#!/usr/bin/env node

/**
 * Bookworm Course Import Client
 * 
 * 一个独立的客户端脚本，用于将本地课程目录（TSV/GIFT格式）转换为 JSON 格式并调用 API 导入。
 * 
 * Usage:
 *   node import_course_client.js [options] <course_dir>
 * 
 * Options:
 *   --token <token>    API Bearer Token (Required, or set BOOKWORM_TOKEN env)
 *   --api <url>        API Base URL (Default: http://localhost:8080)
 *   --dry-run          Run in validation mode without saving changes
 *   --force            Overwrite existing content
 *   --publish          Publish course immediately after import
 * 
 * Examples:
 *   node import_course_client.js --token "ey..." ./courses/MA101
 *   node import_course_client.js --dry-run ./courses/CS101
 */

let fs;
let path;
let axios;

// Configuration
const CONFIG = {
    apiUrl: 'http://localhost:8080',
    token: process.env.BOOKWORM_TOKEN || '',
    dryRun: false,
    overwrite: false,
    publish: false,
    sourceDir: ''
};

// ============================================
// Argument Parsing
// ============================================

function parseArgs() {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--token') CONFIG.token = args[++i];
        else if (arg === '--api') CONFIG.apiUrl = args[++i];
        else if (arg === '--dry-run') CONFIG.dryRun = true;
        else if (arg === '--force') CONFIG.overwrite = true;
        else if (arg === '--publish') CONFIG.publish = true;
        else if (!arg.startsWith('-')) CONFIG.sourceDir = arg;
    }

    if (!CONFIG.sourceDir) {
        console.error("Error: Course directory required.");
        console.error("Usage: node import_course_client.js [options] <course_dir>");
        process.exit(1);
    }

    if (!CONFIG.token) {
        console.error("Error: Token required. Use --token or set BOOKWORM_TOKEN env var.");
        process.exit(1);
    }
}

// ============================================
// Parsers
// ============================================

function parseCardsTsv(content, unitKey) {
    const lines = content.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    
    const headerLine = lines[0];
    const headers = headerLine.split("\t").map(h => h.trim().toLowerCase());
    
    // Flexible column matching
    const idx = {
        id: headers.indexOf("contentid"),
        front: headers.indexOf("front"),
        back: headers.indexOf("back"),
        tags: headers.indexOf("tags"),
        diff: headers.indexOf("difficulty")
    };

    if (idx.id === -1 || idx.front === -1 || idx.back === -1) {
        throw new Error(`[Unit: ${unitKey}] TSV missing required columns. Found: ${headers.join(', ')}`);
    }

    return lines.slice(1).map((line, _index) => {
        if (!line.trim()) return null;
        const fields = line.split("\t");
        
        return {
            contentId: fields[idx.id]?.trim(),
            front: normalizeEscapedWhitespace(fields[idx.front]?.trim()),
            back: normalizeEscapedWhitespace(fields[idx.back]?.trim()),
            tags: idx.tags > -1 ? fields[idx.tags]?.trim() : undefined,
            difficulty: idx.diff > -1 ? parseInt(fields[idx.diff]) || 1 : 1
        };
    }).filter(x => x);
}

function parseQuestionsGift(content, unitKey) {
    const questions = [];
    const cleanContent = content
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

    const questionIdPattern = /::(\S+)::/g;
    const idMatches = Array.from(cleanContent.matchAll(questionIdPattern));

    const isLikelyAnswerBlock = (block) => {
        const trimmed = block.trim();
        if (!trimmed) return false;
        const upper = trimmed.toUpperCase();
        if (upper === "TRUE" || upper === "FALSE" || upper === "T" || upper === "F") return true;
        if (trimmed.startsWith("=")) return true;
        const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        return lines.some((line) => line.startsWith("=") || line.startsWith("~"));
    };

    const findMatchingBrace = (text, openPos, endPos) => {
        let depth = 0;
        for (let i = openPos; i < endPos; i++) {
            const ch = text[i];
            if (ch === "{") depth++;
            else if (ch === "}") {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    };

    for (let i = 0; i < idMatches.length; i++) {
        const match = idMatches[i];
        const contentId = (match[1] || "").trim();
        const bodyStart = (match.index ?? 0) + match[0].length;
        const bodyEnd = i < idMatches.length - 1 ? (idMatches[i + 1].index ?? cleanContent.length) : cleanContent.length;
        const body = cleanContent.slice(bodyStart, bodyEnd);

        let answerStart = -1;
        let answerEnd = -1;
        for (let j = 0; j < body.length; j++) {
            if (body[j] !== "{") continue;
            const close = findMatchingBrace(body, j, body.length);
            if (close === -1) break;
            const candidate = body.slice(j + 1, close);
            if (isLikelyAnswerBlock(candidate)) {
                answerStart = j;
                answerEnd = close;
                break;
            }
        }

        if (answerStart === -1 || answerEnd === -1) {
            throw new Error(`[Unit: ${unitKey}] invalid GIFT question format near: ${body.trim().substring(0, 50)}...`);
        }

        const stem = normalizeEscapedWhitespace(body.slice(0, answerStart).trim());
        const ansBlock = body.slice(answerStart + 1, answerEnd).trim();
        if (!contentId || !stem) {
            throw new Error(`[Unit: ${unitKey}] invalid question with empty contentId/stem`);
        }

        const q = { contentId, stem, difficulty: 1 };
        const upperAns = ansBlock.toUpperCase();

        if (upperAns === "TRUE" || upperAns === "T" || upperAns === "FALSE" || upperAns === "F") {
            q.questionType = "TRUE_FALSE";
            q.answer = upperAns.startsWith("T") ? "TRUE" : "FALSE";
            questions.push(q);
            continue;
        }

        if (ansBlock.startsWith("=") && !ansBlock.includes("~")) {
            q.questionType = "FILL_BLANK";
            q.answer = normalizeEscapedWhitespace(ansBlock.substring(1).trim());
            questions.push(q);
            continue;
        }

        const lines = ansBlock.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const options = [];
        const corrects = [];
        for (const line of lines) {
            if (line.startsWith("=")) {
                const txt = normalizeEscapedWhitespace(line.substring(1).trim());
                options.push(txt);
                corrects.push(txt);
            } else if (line.startsWith("~")) {
                options.push(normalizeEscapedWhitespace(line.substring(1).trim()));
            }
        }

        if (options.length < 2) {
            throw new Error(`[Unit: ${unitKey}] question ${contentId} must have at least 2 options`);
        }
        if (corrects.length === 0) {
            throw new Error(`[Unit: ${unitKey}] question ${contentId} has no correct answer`);
        }

        q.options = options;
        q.questionType = corrects.length > 1 ? "MULTI_CHOICE" : "SINGLE_CHOICE";
        q.answer = corrects.length > 1 ? corrects.join("|") : corrects[0];
        questions.push(q);
    }

    return questions;
}

function normalizeEscapedWhitespace(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/\\\\r\\\\n/g, '\n')
      .replace(/\\r\\n/g, '\n')
      // Do not damage LaTeX commands such as \\neq / \\nabla.
      .replace(/\\\\n(?![A-Za-z])/g, '\n')
      .replace(/\\n(?![A-Za-z])/g, '\n');
}

// ============================================
// Main
// ============================================

async function main() {
    const fsModule = await import("fs");
    const pathModule = await import("path");
    const axiosModule = await import("axios");
    fs = fsModule;
    path = pathModule;
    axios = axiosModule.default ?? axiosModule;
    parseArgs();
    
    console.log(`📦 Packaging course from: ${path.resolve(CONFIG.sourceDir)}`);
    console.log(`🔧 Mode: ${CONFIG.dryRun ? 'DRY RUN' : 'LIVE IMPORT'}`);
    
    try {
        // 1. Load Metadata
        const manifestPath = path.join(CONFIG.sourceDir, 'manifest.json');
        const unitsPath = path.join(CONFIG.sourceDir, 'units.json');
        
        if (!fs.existsSync(manifestPath)) throw new Error("Missing manifest.json");
        if (!fs.existsSync(unitsPath)) throw new Error("Missing units.json");

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const units = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));
        
        // 2. Load Cheatsheets
        let cheatsheets = [];
        const csPath = path.join(CONFIG.sourceDir, 'cheatsheets.json');
        if (fs.existsSync(csPath)) {
            cheatsheets = JSON.parse(fs.readFileSync(csPath, 'utf8'));
            console.log(`📄 Loaded ${cheatsheets.length} cheatsheets`);
        }

        // 3. Load Content
        const cardsMap = {};
        const questionsMap = {};
        let totalCards = 0;
        let totalQuestions = 0;

        for (const unit of units) {
            // TSV
            const cardPath = path.join(CONFIG.sourceDir, 'cards', `${unit.unitKey}.tsv`);
            if (fs.existsSync(cardPath)) {
                const parsed = parseCardsTsv(fs.readFileSync(cardPath, 'utf8'), unit.unitKey);
                cardsMap[unit.unitKey] = parsed;
                totalCards += parsed.length;
            }

            // GIFT
            const questPath = path.join(CONFIG.sourceDir, 'questions', `${unit.unitKey}.gift`);
            if (fs.existsSync(questPath)) {
                const parsed = parseQuestionsGift(fs.readFileSync(questPath, 'utf8'), unit.unitKey);
                questionsMap[unit.unitKey] = parsed;
                totalQuestions += parsed.length;
            }
        }
        
        console.log(`📚 Found ${units.length} units, ${totalCards} cards, ${totalQuestions} questions`);

        // 4. Construct Payload
        const payload = {
            manifest,
            units,
            cards: cardsMap,
            questions: questionsMap,
            cheatsheets,
            options: {
                dryRun: CONFIG.dryRun,
                overwriteContent: CONFIG.overwrite,
                publishOnImport: CONFIG.publish
            }
        };

        // 5. Submit
        console.log(`🚀 Uploading to ${CONFIG.apiUrl}...`);
        
        const response = await axios.post(
            `${CONFIG.apiUrl}/api/study/admin/import`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.token}`
                },
                timeout: 30000,
                validateStatus: () => true
            }
        );

        const result = response.data;

        if (response.status >= 200 && response.status < 300) {
            if (result.success) {
                console.log("\n✅ IMPORT SUCCESSFUL");
                console.log(`Course ID: ${result.courseId}`);
                console.table(result.stats);
                if (result.warnings.length > 0) {
                    console.warn("\n⚠️ Warnings:");
                    result.warnings.forEach(w => console.warn(` - ${w}`));
                }
            } else {
                console.error("\n❌ IMPORT FAILED (Logic Application Error):");
                result.errors.forEach(e => console.error(` - ${e}`));
            }
        } else {
            console.error(`\n❌ HTTP ERROR ${response.status}: ${result.message || response.statusText}`);
        }

    } catch (e) {
        console.error("\n💥 FATAL ERROR:");
        console.error(e.message);
        process.exit(1);
    }
}

main();

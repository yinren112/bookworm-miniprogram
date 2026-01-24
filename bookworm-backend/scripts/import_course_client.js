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
            front: fields[idx.front]?.trim(),
            back: fields[idx.back]?.trim(),
            tags: idx.tags > -1 ? fields[idx.tags]?.trim() : undefined,
            difficulty: idx.diff > -1 ? parseInt(fields[idx.diff]) || 1 : 1
        };
    }).filter(x => x);
}

function parseQuestionsGift(content, _unitKey) {
    const questions = [];
    // Remove comments
    const cleanContent = content.split(/\r?\n/).filter(l => !l.trim().startsWith("//")).join("\n");
    // Regex: ::ID:: STEM { ANSWER }
    const pattern = /::(\S+)::\s*([\s\S]*?)\s*\{([\s\S]*?)\}/g;
    
    let match;
    while ((match = pattern.exec(cleanContent)) !== null) {
        const [, id, stem, ansBlock] = match;
        const q = { contentId: id.trim(), stem: stem.trim(), difficulty: 1 };
        const upperAns = ansBlock.trim().toUpperCase();

        if (['T', 'F', 'TRUE', 'FALSE'].includes(upperAns)) {
            q.questionType = 'TRUE_FALSE';
            q.answer = upperAns.startsWith('T') ? 'TRUE' : 'FALSE';
        } else if (ansBlock.trim().startsWith('=') && !ansBlock.includes('~')) {
            q.questionType = 'FILL_BLANK';
            q.answer = ansBlock.trim().substring(1).trim();
        } else {
            // Choice Question
            const lines = ansBlock.split(/\r?\n/).map(l => l.trim()).filter(l => l);
            const options = [];
            const corrects = [];
            lines.forEach(l => {
                const cleanL = l.replace(/^\t+/, '').trim(); // Remove leading tabs
                if (cleanL.startsWith('=')) {
                    const txt = cleanL.substring(1).trim();
                    options.push(txt);
                    corrects.push(txt);
                } else if (cleanL.startsWith('~')) {
                    options.push(cleanL.substring(1).trim());
                }
            });
            q.options = options;
            q.questionType = corrects.length > 1 ? 'MULTI_CHOICE' : 'SINGLE_CHOICE';
            
            // Backend expects JSON array for Multi, string for Single
            q.answer = corrects.length > 1 ? JSON.stringify(corrects) : corrects[0];
        }
        questions.push(q);
    }
    return questions;
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

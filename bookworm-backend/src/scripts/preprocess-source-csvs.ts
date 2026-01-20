import * as fs from "fs";
import * as path from "path";
import {
  parseEncodingArgs,
  readFileWithEncoding,
  SupportedEncoding,
} from "./utils/cli";

const SOURCE_FILES = [
  "../../../公共课书�?csv",
  "../../../所有专业都可能需要的公共�?csv",
  "../../../专业课书�?csv",
];

const OUTPUT_DIR = "../../../dist_csv";
const METADATA_OUTPUT_PATH = `${OUTPUT_DIR}/book_metadata.csv`;
const ACQUIRABLE_OUTPUT_PATH = `${OUTPUT_DIR}/acquirable_books.csv`;
const RECOMMENDATIONS_OUTPUT_PATH = `${OUTPUT_DIR}/recommendations.csv`;

interface BookInfo {
  isbn: string;
  edition: string;
}

interface CsvFailure {
  file: string;
  lineNumber: number;
  raw: string;
  reason: string;
}

function normalizeIsbn(isbn: string): string {
  const cleaned = isbn.replace(/[-\s]/g, "");
  if (!/^\d{13}$/.test(cleaned)) {
    throw new Error(`无效 ISBN: ${isbn}，必须为 13 位数字`);
  }
  return cleaned;
}

function normalizeEdition(edition: string | undefined): string {
  if (!edition) return "";

  const trimmed = edition.trim();
  if (/^\d{13}$/.test(trimmed)) {
    console.warn(
      `[WARN] 版次字段看起来像 ISBN (${trimmed})，将其视为未知版次`
    );
    return "";
  }

  return trimmed;
}

function normalizeYear(yearStr: string | undefined): string {
  if (!yearStr) {
    throw new Error("缺少年级字段");
  }

  const match = yearStr.match(/\d{4}/);
  if (match) {
    return match[0];
  }

  throw new Error(`无法解析年级字段: ${yearStr}`);
}

function normalizeMajor(major: string | undefined): string {
  if (!major) {
    throw new Error("缺少专业字段");
  }

  const trimmed = major.trim();
  if (trimmed === "全专�?" || trimmed === "各专�?" || trimmed === "所有专�?") {
    return "*";
  }

  return trimmed;
}

function readSourceCsv(
  filePath: string,
  encoding: SupportedEncoding
): {
  fullRecords: Array<{
    isbn: string;
    edition: string;
    enrollmentYear: string;
    major: string;
    lineNumber: number;
    raw: string;
  }>;
  partialRecords: Array<{
    isbn: string;
    edition: string;
    lineNumber: number;
    raw: string;
  }>;
  failures: CsvFailure[];
} {
  const absolutePath = path.resolve(__dirname, filePath);
  const failures: CsvFailure[] = [];

  if (!fs.existsSync(absolutePath)) {
    failures.push({
      file: filePath,
      lineNumber: 0,
      raw: "",
      reason: `文件不存在: ${absolutePath}`,
    });
    return { fullRecords: [], partialRecords: [], failures };
  }

  let content: string;
  try {
    content = readFileWithEncoding(absolutePath, encoding);
  } catch (error) {
    failures.push({
      file: filePath,
      lineNumber: 0,
      raw: "",
      reason: `读取文件失败: ${(error as Error).message}`,
    });
    return { fullRecords: [], partialRecords: [], failures };
  }

  const rawLines = content.split(/\r?\n/);
  let headerProcessed = false;
  let headerIndices:
    | { isbnIdx: number; majorIdx: number; yearIdx: number; editionIdx: number }
    | null = null;

  const fullRecords: Array<{
    isbn: string;
    edition: string;
    enrollmentYear: string;
    major: string;
    lineNumber: number;
    raw: string;
  }> = [];

  const partialRecords: Array<{
    isbn: string;
    edition: string;
    lineNumber: number;
    raw: string;
  }> = [];

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    if (!rawLine.trim()) {
      continue;
    }

    const lineNumber = i + 1;

    if (!headerProcessed) {
      headerProcessed = true;
      const header = rawLine.split(",").map((h) => h.trim().toLowerCase());

      const isbnIdx = header.findIndex((h) => h === "isbn");
      const majorIdx = header.findIndex((h) => h === "专业");
      const yearIdx = header.findIndex((h) => h === "年级");
      const editionIdx = header.findIndex((h) => h === "版次");

      if (isbnIdx === -1 || majorIdx === -1 || yearIdx === -1 || editionIdx === -1) {
        failures.push({
          file: filePath,
          lineNumber,
          raw: rawLine,
          reason: `CSV 表头必须包含: isbn, 专业, 年级, 版次 (当前: ${header.join(", ")})`,
        });
        return { fullRecords: [], partialRecords: [], failures };
      }

      headerIndices = { isbnIdx, majorIdx, yearIdx, editionIdx };
      continue;
    }

    if (!headerIndices) {
      failures.push({
        file: filePath,
        lineNumber,
        raw: rawLine,
        reason: "解析表头失败，无法读取数据行",
      });
      continue;
    }

    const columns = rawLine.split(",").map((c) => c.trim());
    const neededColumns =
      Math.max(
        headerIndices.isbnIdx,
        headerIndices.majorIdx,
        headerIndices.yearIdx,
        headerIndices.editionIdx
      ) + 1;

    if (columns.length < neededColumns) {
      failures.push({
        file: filePath,
        lineNumber,
        raw: rawLine,
        reason: "列数量不足，无法解析该行",
      });
      continue;
    }

    const isbnRaw = columns[headerIndices.isbnIdx];
    const editionRaw = columns[headerIndices.editionIdx];
    const yearRaw = columns[headerIndices.yearIdx];
    const majorRaw = columns[headerIndices.majorIdx];

    let isbn: string;
    try {
      isbn = normalizeIsbn(isbnRaw);
    } catch (error) {
      failures.push({
        file: filePath,
        lineNumber,
        raw: rawLine,
        reason: (error as Error).message,
      });
      continue;
    }

    let edition = "";
    try {
      edition = normalizeEdition(editionRaw);
    } catch (error) {
      failures.push({
        file: filePath,
        lineNumber,
        raw: rawLine,
        reason: (error as Error).message,
      });
      continue;
    }

    let enrollmentYear: string | null = null;
    try {
      enrollmentYear = normalizeYear(yearRaw);
    } catch {
      enrollmentYear = null;
    }

    let major: string | null = null;
    try {
      major = normalizeMajor(majorRaw);
    } catch {
      major = null;
    }

    if (enrollmentYear && major) {
      fullRecords.push({
        isbn,
        edition,
        enrollmentYear,
        major,
        lineNumber,
        raw: rawLine,
      });
    } else {
      partialRecords.push({
        isbn,
        edition,
        lineNumber,
        raw: rawLine,
      });
    }
  }

  if (!headerProcessed) {
    failures.push({
      file: filePath,
      lineNumber: 0,
      raw: "",
      reason: "CSV 文件缺少表头",
    });
  }

  return { fullRecords, partialRecords, failures };
}

function writeBookInfoCsv(filePath: string, bookMap: Map<string, BookInfo>): void {
  const absolutePath = path.resolve(__dirname, filePath);
  const lines = ["isbn,edition"];

  for (const { isbn, edition } of bookMap.values()) {
    const escapedEdition = edition.includes(",") ? `"${edition}"` : edition;
    lines.push(`${isbn},${escapedEdition}`);
  }

  fs.writeFileSync(absolutePath, lines.join("\n"), "utf-8");
  console.log(`[WRITE] ${absolutePath} (${bookMap.size} rows)`);
}

function writeRecommendationsCsv(filePath: string, recommendations: Set<string>): void {
  const absolutePath = path.resolve(__dirname, filePath);
  const lines = ["enrollment_year,major,isbn"];

  for (const entry of recommendations) {
    const [year, major, isbn] = entry.split("|");
    const escapedMajor = major.includes(",") ? `"${major}"` : major;
    lines.push(`${year},${escapedMajor},${isbn}`);
  }

  fs.writeFileSync(absolutePath, lines.join("\n"), "utf-8");
  console.log(`[WRITE] ${absolutePath} (${recommendations.size} rows)`);
}

async function main() {
  let encoding: SupportedEncoding;
  try {
    const parsed = parseEncodingArgs();
    encoding = parsed.encoding;
    if (parsed.positional.length > 0) {
      console.warn(
        `[WARN] 预处理脚本忽略额外参数: ${parsed.positional.join(" ")}`
      );
    }
  } catch (error) {
    console.error(`[ERROR] ${(error as Error).message}`);
    console.error(
      "用法: ts-node src/scripts/preprocess-source-csvs.ts --encoding <gbk|utf8>"
    );
    process.exit(1);
    return;
  }

  console.log("[START] Preprocessing source CSV files...\n");

  const bookMetadata = new Map<string, BookInfo>();
  const acquirableBooks = new Map<string, BookInfo>();
  const recommendations = new Set<string>();
  const failures: CsvFailure[] = [];
  let totalFullRecords = 0;
  let totalPartialRecords = 0;

  const outputDir = path.resolve(__dirname, OUTPUT_DIR);
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`[INFO] Output directory: ${outputDir}\n`);

  for (const sourceFile of SOURCE_FILES) {
    const absoluteSource = path.resolve(__dirname, sourceFile);
    console.log(`[READ] ${absoluteSource}`);

    const { fullRecords, partialRecords, failures: fileFailures } = readSourceCsv(
      sourceFile,
      encoding
    );

    failures.push(...fileFailures);
    totalFullRecords += fullRecords.length;
    totalPartialRecords += partialRecords.length;

    console.log(
      `  → Parsed ${fullRecords.length} complete records, ${partialRecords.length} partial records`
    );

    for (const record of fullRecords) {
      const { isbn, edition, enrollmentYear, major } = record;
      const bookKey = `${isbn}|${edition}`;
      if (!bookMetadata.has(bookKey)) {
        bookMetadata.set(bookKey, { isbn, edition });
      }
      if (!acquirableBooks.has(bookKey)) {
        acquirableBooks.set(bookKey, { isbn, edition });
      }
      const recommendationKey = `${enrollmentYear}|${major}|${isbn}`;
      recommendations.add(recommendationKey);
    }

    for (const record of partialRecords) {
      const { isbn, edition } = record;
      const bookKey = `${isbn}|${edition}`;
      if (!bookMetadata.has(bookKey)) {
        bookMetadata.set(bookKey, { isbn, edition });
      }
      if (!acquirableBooks.has(bookKey)) {
        acquirableBooks.set(bookKey, { isbn, edition });
      }
    }
  }

  console.log("\n[INFO] Aggregation complete:");
  console.log(`  - Unique books (isbn|edition): ${bookMetadata.size}`);
  console.log(`  - Acquirable books: ${acquirableBooks.size}`);
  console.log(`  - Recommendation entries: ${recommendations.size}\n`);

  console.log("[WRITE] Writing standardized CSV files...\n");
  writeBookInfoCsv(METADATA_OUTPUT_PATH, bookMetadata);
  writeBookInfoCsv(ACQUIRABLE_OUTPUT_PATH, acquirableBooks);
  writeRecommendationsCsv(RECOMMENDATIONS_OUTPUT_PATH, recommendations);

  const failureCount = failures.length;
  const successCount = totalFullRecords + totalPartialRecords;
  console.log("\n[RESULT] Preprocessing summary");
  console.log(`  - Successful rows: ${successCount}`);
  console.log(`  - Failed rows: ${failureCount}`);

  if (failureCount > 0) {
    failures.forEach((failure) => {
      const prefix =
        failure.lineNumber > 0
          ? `    ${failure.file} (line ${failure.lineNumber})`
          : `    ${failure.file}`;
      console.log(`${prefix}: ${failure.reason}`);
      if (failure.raw) {
        console.log(`      Raw: ${failure.raw}`);
      }
    });
  }

  process.exit(failureCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[FATAL]", error);
  process.exit(1);
});

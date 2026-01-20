import { PrismaClient } from "@prisma/client";
import * as path from "path";
import {
  parseEncodingArgs,
  readFileWithEncoding,
  SupportedEncoding,
} from "./utils/cli";

const prisma = new PrismaClient();

interface RecommendationRow {
  lineNumber: number;
  raw: string;
  enrollment_year: number;
  major: string;
  isbn: string;
}

interface RowFailure {
  lineNumber: number;
  raw: string;
  reason: string;
}

type RowStatus = "pending" | "success" | "failure";

interface RowOutcome {
  raw: string;
  status: RowStatus;
  reasons: string[];
}

interface RecommendationGroup {
  enrollment_year: number;
  major: string;
  rows: RecommendationRow[];
}

function readRecommendationCsv(
  filePath: string,
  encoding: SupportedEncoding
): { rows: RecommendationRow[]; failures: RowFailure[] } {
  const failures: RowFailure[] = [];

  try {
    const content = readFileWithEncoding(filePath, encoding);
    const rawLines = content.split(/\r?\n/);

    let headerProcessed = false;
    let headerIndices: { yearIdx: number; majorIdx: number; isbnIdx: number } | null =
      null;
    let headerLineNumber = 0;

    const rows: RecommendationRow[] = [];

    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        continue;
      }

      const lineNumber = i + 1;

      if (!headerProcessed) {
        headerProcessed = true;
        headerLineNumber = lineNumber;
        const header = trimmed.toLowerCase().split(",").map((h) => h.trim());
        const yearIdx = header.indexOf("enrollment_year");
        const majorIdx = header.indexOf("major");
        const isbnIdx = header.indexOf("isbn");

        if (yearIdx === -1 || majorIdx === -1 || isbnIdx === -1) {
          failures.push({
            lineNumber,
            raw: rawLine,
            reason:
              "缺少表头字段，必须包含 enrollment_year, major, isbn (顺序不限)",
          });
          return { rows: [], failures };
        }

        headerIndices = { yearIdx, majorIdx, isbnIdx };
        continue;
      }

      if (!headerIndices) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: "未能识别表头，无法解析数据行",
        });
        continue;
      }

      const cols = rawLine.split(",").map((c) => c.trim());
      if (
        cols.length <= Math.max(
          headerIndices.yearIdx,
          headerIndices.majorIdx,
          headerIndices.isbnIdx
        )
      ) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: "列数量不足，无法解析",
        });
        continue;
      }

      const yearRaw = cols[headerIndices.yearIdx];
      const major = cols[headerIndices.majorIdx];
      const isbnRaw = cols[headerIndices.isbnIdx];

      const year = parseInt(yearRaw, 10);
      const isbn = isbnRaw.replace(/[- ]/g, "");

      if (Number.isNaN(year)) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: `入学年份无效: ${yearRaw}`,
        });
        continue;
      }

      if (!major) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: "专业字段为空",
        });
        continue;
      }

      if (!isbn) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: "ISBN 为空",
        });
        continue;
      }

      if (!/^\d{10}(\d{3})?$/.test(isbn)) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: `ISBN 非法: ${isbn}`,
        });
        continue;
      }

      rows.push({
        lineNumber,
        raw: rawLine,
        enrollment_year: year,
        major,
        isbn,
      });
    }

    if (!headerProcessed) {
      failures.push({
        lineNumber: 0,
        raw: "",
        reason: "CSV 文件缺少表头",
      });
      return { rows: [], failures };
    }

    if (rows.length === 0) {
      failures.push({
        lineNumber: headerLineNumber,
        raw: "",
        reason: "CSV 文件未包含任何有效数据行",
      });
    }

    return { rows, failures };
  } catch (error) {
    failures.push({
      lineNumber: 0,
      raw: "",
      reason: `读取文件失败: ${(error as Error).message}`,
    });
    return { rows: [], failures };
  }
}

function groupByEnrollmentAndMajor(
  rows: RecommendationRow[]
): Map<string, RecommendationGroup> {
  const groups = new Map<string, RecommendationGroup>();

  for (const row of rows) {
    const key = `${row.enrollment_year}|${row.major}`;
    if (!groups.has(key)) {
      groups.set(key, {
        enrollment_year: row.enrollment_year,
        major: row.major,
        rows: [],
      });
    }
    groups.get(key)!.rows.push(row);
  }

  return groups;
}

function ensureOutcome(
  outcomes: Map<number, RowOutcome>,
  lineNumber: number,
  raw: string
): RowOutcome {
  const existing = outcomes.get(lineNumber);
  if (existing) {
    return existing;
  }
  const created: RowOutcome = {
    raw,
    status: "pending",
    reasons: [],
  };
  outcomes.set(lineNumber, created);
  return created;
}

function markFailure(
  outcomes: Map<number, RowOutcome>,
  lineNumber: number,
  raw: string,
  reason: string
): void {
  const outcome = ensureOutcome(outcomes, lineNumber, raw);
  outcome.status = "failure";
  outcome.reasons.push(reason);
}

function markSuccess(
  outcomes: Map<number, RowOutcome>,
  lineNumber: number,
  raw: string
): void {
  const outcome = ensureOutcome(outcomes, lineNumber, raw);
  if (outcome.status === "failure") {
    return;
  }
  outcome.status = "success";
  outcome.reasons = [];
}

async function main() {
  let encoding: SupportedEncoding;
  let filePath: string | undefined;

  try {
    const parsed = parseEncodingArgs();
    encoding = parsed.encoding;
    filePath = parsed.positional[0];
  } catch (error) {
    console.error(`[ERROR] ${(error as Error).message}`);
    console.error(
      "用法: ts-node src/scripts/import-recommendation-list.ts --encoding <gbk|utf8> <path-to-recommendations.csv>"
    );
    await prisma.$disconnect();
    process.exit(1);
    return;
  }

  if (!filePath) {
    console.error(
      "缺少 CSV 文件路径。用法: ts-node src/scripts/import-recommendation-list.ts --encoding <gbk|utf8> <path-to-recommendations.csv>"
    );
    await prisma.$disconnect();
    process.exit(1);
    return;
  }

  const absolutePath = path.resolve(filePath);
  console.log(`[START] Importing recommendation list from: ${absolutePath}`);

  const { rows, failures } = readRecommendationCsv(absolutePath, encoding);

  const outcomes = new Map<number, RowOutcome>();
  for (const failure of failures) {
    markFailure(outcomes, failure.lineNumber, failure.raw, failure.reason);
  }
  for (const row of rows) {
    ensureOutcome(outcomes, row.lineNumber, row.raw);
  }

  if (rows.length === 0) {
    console.warn("[WARN] CSV 文件未产生任何可导入记录。");
  }

  const groups = groupByEnrollmentAndMajor(rows);
  console.log(
    `Found ${groups.size} unique (enrollment_year, major) combinations.`
  );

  let totalListsCreated = 0;
  let totalListsExisting = 0;
  let totalItemsCreated = 0;
  let totalItemsSkipped = 0;
  const notFoundIsbns = new Set<string>();

  for (const group of groups.values()) {
    const uniqueIsbns = Array.from(
      new Set(group.rows.map((row) => row.isbn))
    );

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          let list = await tx.recommendedBookList.findUnique({
            where: {
              enrollment_year_major: {
                enrollment_year: group.enrollment_year,
                major: group.major,
              },
            },
          });

          let listCreated = false;
          if (!list) {
            list = await tx.recommendedBookList.create({
              data: {
                enrollment_year: group.enrollment_year,
                major: group.major,
              },
            });
            listCreated = true;
          }

          const skus = await tx.bookSku.findMany({
            where: {
              bookMaster: {
                isbn13: { in: uniqueIsbns },
              },
            },
            select: {
              id: true,
              bookMaster: {
                select: { isbn13: true },
              },
            },
          });

          const isbnToSkuMap = new Map(
            skus.map((sku) => [sku.bookMaster.isbn13, sku.id])
          );

          const itemsToInsert = uniqueIsbns
            .filter((isbn) => isbnToSkuMap.has(isbn))
            .map((isbn) => ({
              list_id: list!.id,
              sku_id: isbnToSkuMap.get(isbn)!,
            }));

          let createdCount = 0;
          let skippedCount = 0;

          if (itemsToInsert.length > 0) {
            const createResult = await tx.recommendedBookItem.createMany({
              data: itemsToInsert,
              skipDuplicates: true,
            });
            createdCount = createResult.count;
            skippedCount = itemsToInsert.length - createResult.count;
          }

          const missingIsbns = uniqueIsbns.filter(
            (isbn) => !isbnToSkuMap.has(isbn)
          );

          return {
            listCreated,
            createdCount,
            skippedCount,
            missingIsbns,
          };
        },
        { timeout: 60000 }
      );

      if (result.listCreated) {
        totalListsCreated++;
        console.log(
          `  [CREATED] List for ${group.enrollment_year} - ${group.major}`
        );
      } else {
        totalListsExisting++;
        console.log(
          `  [EXISTS] List for ${group.enrollment_year} - ${group.major}`
        );
      }

      totalItemsCreated += result.createdCount;
      totalItemsSkipped += result.skippedCount;

      result.missingIsbns.forEach((isbn) => notFoundIsbns.add(isbn));

      for (const row of group.rows) {
        if (result.missingIsbns.includes(row.isbn)) {
          markFailure(
            outcomes,
            row.lineNumber,
            row.raw,
            `ISBN ${row.isbn} 未在数据库中找到`
          );
        } else {
          markSuccess(outcomes, row.lineNumber, row.raw);
        }
      }
    } catch (error) {
      const reason = `数据库写入失败: ${(error as Error).message}`;
      for (const row of group.rows) {
        markFailure(outcomes, row.lineNumber, row.raw, reason);
      }
    }
  }

  const processedRows = Array.from(outcomes.entries());
  const failuresSummary = processedRows
    .filter(([, outcome]) => outcome.status === "failure")
    .map(([lineNumber, outcome]) => ({
      lineNumber,
      raw: outcome.raw,
      reasons: outcome.reasons,
    }));

  const successCount = processedRows.filter(
    ([, outcome]) => outcome.status === "success"
  ).length;

  console.log("[RESULT] Recommendation import summary");
  console.log(`  - Successful rows: ${successCount}`);
  console.log(`  - Failed rows: ${failuresSummary.length}`);

  failuresSummary.forEach((failure) => {
    const reasons = failure.reasons.join("; ");
    const prefix =
      failure.lineNumber > 0
        ? `    Line ${failure.lineNumber}: `
        : "    General: ";
    console.log(`${prefix}${reasons}`);
    if (failure.raw) {
      console.log(`      Raw: ${failure.raw}`);
    }
  });

  console.log("[RESULT] Database operations");
  console.log(`  - Created lists: ${totalListsCreated}`);
  console.log(`  - Existing lists: ${totalListsExisting}`);
  console.log(`  - Items inserted: ${totalItemsCreated}`);
  console.log(`  - Items skipped (duplicates): ${totalItemsSkipped}`);

  if (notFoundIsbns.size > 0) {
    const sampleIsbns = Array.from(notFoundIsbns).slice(0, 10);
    console.warn(
      `  - Missing ISBNs (${notFoundIsbns.size}): ${sampleIsbns.join(", ")}${
        notFoundIsbns.size > 10 ? "..." : ""
      }`
    );
  }

  await prisma.$disconnect();
  process.exit(failuresSummary.length > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(`[FATAL] Import script crashed: ${(error as Error).message}`);
  await prisma.$disconnect();
  process.exit(1);
});

import { PrismaClient } from "@prisma/client";
import * as path from "path";
import {
  parseEncodingArgs,
  readFileWithEncoding,
  SupportedEncoding,
} from "./utils/cli";

const prisma = new PrismaClient();

interface CsvRecord {
  lineNumber: number;
  raw: string;
  isbn: string;
  edition: string;
}

interface RowFailure {
  lineNumber: number;
  raw: string;
  reason: string;
}

function readBookMetadataCsv(
  filePath: string,
  encoding: SupportedEncoding
): { records: CsvRecord[]; failures: RowFailure[] } {
  const failures: RowFailure[] = [];
  const records: CsvRecord[] = [];

  try {
    const content = readFileWithEncoding(filePath, encoding);
    const rawLines = content.split(/\r?\n/);

    let headerProcessed = false;
    let headerIndices: { isbnIdx: number; editionIdx: number } | null = null;

    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      if (!rawLine.trim()) {
        continue;
      }

      const lineNumber = i + 1;

      if (!headerProcessed) {
        headerProcessed = true;
        const header = rawLine.split(",").map((h) => h.trim().toLowerCase());
        const isbnIdx = header.indexOf("isbn");
        const editionIdx = header.indexOf("edition");

        if (isbnIdx === -1 || editionIdx === -1) {
          failures.push({
            lineNumber,
            raw: rawLine,
            reason: `CSV 表头必须包含: isbn, edition (当前: ${header.join(", ")})`,
          });
          return { records: [], failures };
        }

        headerIndices = { isbnIdx, editionIdx };
        continue;
      }

      if (!headerIndices) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: "解析表头失败，无法读取数据行",
        });
        continue;
      }

      const columns = rawLine.split(",");
      if (
        columns.length <=
        Math.max(headerIndices.isbnIdx, headerIndices.editionIdx)
      ) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: "列数量不足，无法解析该行",
        });
        continue;
      }

      const isbn = columns[headerIndices.isbnIdx].trim();
      let edition = columns.slice(headerIndices.editionIdx).join(",").trim();
      edition = edition.replace(/^"(.*)"$/, "$1");

      if (!isbn) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: "缺少 ISBN 字段",
        });
        continue;
      }

      records.push({
        lineNumber,
        raw: rawLine,
        isbn,
        edition: edition || "",
      });
    }

    if (!headerProcessed) {
      failures.push({
        lineNumber: 0,
        raw: "",
        reason: "CSV 文件缺少表头",
      });
    }
  } catch (error) {
    failures.push({
      lineNumber: 0,
      raw: "",
      reason: `读取文件失败: ${(error as Error).message}`,
    });
  }

  return { records, failures };
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
      "用法: ts-node src/scripts/upsert-books.ts --encoding <gbk|utf8> <path-to-book-metadata.csv>"
    );
    process.exit(1);
    return;
  }

  if (!filePath) {
    console.error(
      "缺少 CSV 文件路径。用法: ts-node src/scripts/upsert-books.ts --encoding <gbk|utf8> <path-to-book-metadata.csv>"
    );
    process.exit(1);
    return;
  }

  const absolutePath = path.resolve(filePath);
  console.log(`[START] Upserting book metadata from: ${absolutePath}`);

  const { records, failures } = readBookMetadataCsv(absolutePath, encoding);

  if (records.length === 0) {
    console.warn("[WARN] 未找到任何有效记录。");
  } else {
    console.log(`Parsed ${records.length} book records from CSV.\n`);
  }

  let mastersCreated = 0;
  let mastersExisting = 0;
  let skusCreated = 0;
  let skusExisting = 0;
  let processedRecords = 0;

  for (const record of records) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingMaster = await tx.bookMaster.findUnique({
          where: { isbn13: record.isbn },
        });

        const master = await tx.bookMaster.upsert({
          where: { isbn13: record.isbn },
          create: {
            isbn13: record.isbn,
            title: "Title pending external API lookup",
            author: "Unknown",
            publisher: "Unknown",
          },
          update: {},
          select: { id: true, isbn13: true },
        });

        const normalizedEdition =
          record.edition && record.edition.trim()
            ? record.edition.trim()
            : "Unknown";

        const existingSku = await tx.bookSku.findUnique({
          where: {
            master_id_edition: {
              master_id: master.id,
              edition: normalizedEdition,
            },
          },
        });

        await tx.bookSku.upsert({
          where: {
            master_id_edition: {
              master_id: master.id,
              edition: normalizedEdition,
            },
          },
          create: {
            master_id: master.id,
            edition: normalizedEdition,
          },
          update: {},
        });

        return {
          masterExisted: Boolean(existingMaster),
          skuExisted: Boolean(existingSku),
        };
      });

      if (result.masterExisted) {
        mastersExisting++;
      } else {
        mastersCreated++;
      }

      if (result.skuExisted) {
        skusExisting++;
      } else {
        skusCreated++;
      }

      processedRecords++;
    } catch (error) {
      failures.push({
        lineNumber: record.lineNumber,
        raw: record.raw,
        reason: `数据库写入失败: ${(error as Error).message}`,
      });
    }
  }

  await prisma.$disconnect();

  const failureCount = failures.length;

  console.log("[RESULT] Book metadata upsert summary");
  console.log(`  - Records processed: ${processedRecords}`);
  console.log(`  - Failed rows: ${failureCount}`);
  console.log(`  - BookMaster created: ${mastersCreated}`);
  console.log(`  - BookMaster existing: ${mastersExisting}`);
  console.log(`  - BookSku created: ${skusCreated}`);
  console.log(`  - BookSku existing: ${skusExisting}`);

  failures.forEach((failure) => {
    const prefix =
      failure.lineNumber > 0
        ? `    Line ${failure.lineNumber}: `
        : "    General: ";
    console.log(`${prefix}${failure.reason}`);
    if (failure.raw) {
      console.log(`      Raw: ${failure.raw}`);
    }
  });

  process.exit(failureCount > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(`[FATAL] ${(error as Error).message}`);
  await prisma.$disconnect();
  process.exit(1);
});

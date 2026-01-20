import { PrismaClient } from "@prisma/client";
import * as path from "path";
import {
  parseEncodingArgs,
  readFileWithEncoding,
  SupportedEncoding,
} from "./utils/cli";

const prisma = new PrismaClient();

interface RowFailure {
  lineNumber: number;
  raw: string;
  reason: string;
}

function readIsbnCsv(
  filePath: string,
  encoding: SupportedEncoding
): { isbns: Set<string>; failures: RowFailure[] } {
  const failures: RowFailure[] = [];
  const isbns = new Set<string>();

  try {
    const content = readFileWithEncoding(filePath, encoding);
    const rawLines = content.split(/\r?\n/);

    let headerSkipped = false;

    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      const trimmed = rawLine.trim();
      if (!trimmed) {
        continue;
      }

      const lineNumber = i + 1;

      if (!headerSkipped) {
        headerSkipped = trimmed.toLowerCase().includes("isbn");
        if (headerSkipped) {
          continue;
        }
      }

      const parts = rawLine.split(",");
      const isbnRaw = parts[0]?.trim();

      if (!isbnRaw) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: "缺少 ISBN 字段",
        });
        continue;
      }

      const normalized = isbnRaw.replace(/[- ]/g, "");
      if (!/^\d{10}(\d{3})?$/.test(normalized)) {
        failures.push({
          lineNumber,
          raw: rawLine,
          reason: `ISBN 非法: ${isbnRaw}`,
        });
        continue;
      }

      isbns.add(normalized);
    }
  } catch (error) {
    failures.push({
      lineNumber: 0,
      raw: "",
      reason: `读取文件失败: ${(error as Error).message}`,
    });
  }

  return { isbns, failures };
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
      "用法: ts-node src/scripts/update-acquirable-list.ts --encoding <gbk|utf8> <path-to-isbn.csv>"
    );
    process.exit(1);
    return;
  }

  if (!filePath) {
    console.error(
      "缺少 CSV 文件路径。用法: ts-node src/scripts/update-acquirable-list.ts --encoding <gbk|utf8> <path-to-isbn.csv>"
    );
    process.exit(1);
    return;
  }

  const absolutePath = path.resolve(filePath);
  console.log(`[START] Processing ISBN allowlist from: ${absolutePath}`);

  const { isbns, failures } = readIsbnCsv(absolutePath, encoding);

  if (isbns.size === 0) {
    console.warn(
      "[WARN] 未找到任何合法 ISBN，跳过数据库更新。"
    );
  } else {
    console.log(`Found ${isbns.size} unique and valid ISBNs to process.`);
  }

  let updatedSkus = 0;
  let matchedIsbnsCount = 0;
  const notFoundIsbns: string[] = [];

  if (isbns.size > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        const masters = await tx.bookMaster.findMany({
          where: { isbn13: { in: Array.from(isbns) } },
          select: { id: true, isbn13: true },
        });

        if (masters.length === 0) {
          console.warn(
            "[WARN] CSV 中的 ISBN 在数据库中均不存在，未执行更新。"
          );
          return;
        }

        const masterIds = masters.map((m) => m.id);
        const matchedIsbns = new Set(masters.map((m) => m.isbn13));
        matchedIsbnsCount = matchedIsbns.size;

        const updateResult = await tx.bookSku.updateMany({
          where: { master_id: { in: masterIds } },
          data: { is_acquirable: true },
        });

        updatedSkus = updateResult.count;
        notFoundIsbns.push(
          ...Array.from(isbns).filter((isbn) => !matchedIsbns.has(isbn))
        );
      });
    } catch (error) {
      failures.push({
        lineNumber: 0,
        raw: "",
        reason: `数据库更新失败: ${(error as Error).message}`,
      });
    }
  }

  await prisma.$disconnect();

  const failureCount = failures.length;

  console.log("\n[RESULT] Update summary");
  console.log(`  - Valid ISBN rows: ${isbns.size}`);
  console.log(`  - Failed rows: ${failureCount}`);
  console.log(`  - Matched ISBNs in DB: ${matchedIsbnsCount}`);
  console.log(`  - Book SKUs updated: ${updatedSkus}`);

  if (notFoundIsbns.length > 0) {
    console.warn(
      `  - ISBNs not found in database (${notFoundIsbns.length}): ${notFoundIsbns
        .slice(0, 10)
        .join(", ")}${notFoundIsbns.length > 10 ? "..." : ""}`
    );
  }

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

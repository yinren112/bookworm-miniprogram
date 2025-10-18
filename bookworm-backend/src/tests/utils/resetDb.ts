import { PrismaClient } from "@prisma/client";

interface TableRow {
  schemaname: string;
  tablename: string;
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (!tables.length) {
    return;
  }

  const identifiers = tables
    .map(({ schemaname, tablename }) => `"${schemaname}"."${tablename}"`)
    .join(", ");

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE;`
  );
}

import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}

const result = spawnSync(
  process.execPath,
  ["./node_modules/prisma/build/index.js", "generate"],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);

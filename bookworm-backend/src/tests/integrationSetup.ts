import { beforeEach, afterEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getPrismaClientForWorker } from "./globalSetup";
import { resetDatabase } from "./utils/resetDb";

const RESET_MODE = process.env.TEST_DB_RESET ?? "strict";

let prismaClient: PrismaClient | null = null;

declare global {
  // eslint-disable-next-line no-interface-overtype
  interface Number {
    toNumber: () => number;
  }
}

if (typeof Number.prototype.toNumber !== "function") {
  Number.prototype.toNumber = function toNumber() {
    return Number(this.valueOf());
  };
}

function getPrisma(): PrismaClient {
  if (!prismaClient) {
    prismaClient = getPrismaClientForWorker();
  }
  return prismaClient;
}

async function maybeResetDatabase() {
  if (RESET_MODE !== "strict") {
    return;
  }
  await resetDatabase(getPrisma());
}

beforeEach(async () => {
  await maybeResetDatabase();
});

afterEach(async () => {
  await maybeResetDatabase();
});

afterAll(async () => {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
  }
});

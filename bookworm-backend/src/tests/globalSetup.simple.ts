import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { resetDatabase } from "./utils/resetDb";

const execAsync = promisify(exec);
const prismaBinary = path.join(__dirname, "..", "..", "node_modules", ".bin", "prisma");

const prismaClients: Record<number, PrismaClient> = {};
let globalDatabaseUrl = "";

declare global {
  var __BOOKWORM_TRUNCATE__: ((workerId?: number) => Promise<void>) | undefined;
}

export async function setup(_config: any) {
  console.log("[Simple Setup] Using existing DATABASE_URL from .env.test");

  const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL must be set in .env.test");
  }

  globalDatabaseUrl = databaseUrl;

  console.log("[Simple Setup] Database URL configured");
  console.log("[Simple Setup] Applying migrations...");

  try {
    await execAsync(`${prismaBinary} migrate deploy`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    console.log("[Simple Setup] Migrations applied successfully");
  } catch (error) {
    console.error("[Simple Setup] Migration failed:", error);
    throw error;
  }

  const workerId = 1;
  prismaClients[workerId] = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  console.log("[Simple Setup] Resetting database...");
  await resetDatabase(prismaClients[workerId]);
  console.log("[Simple Setup] Database reset complete");

  (global as any).TEST_DATABASE_URL = databaseUrl;

  global.__BOOKWORM_TRUNCATE__ = async (workerId: number = 1) => {
    const client = prismaClients[workerId] ?? getPrismaClientForWorker();
    await resetDatabase(client);
  };

  console.log("[Simple Setup] Setup complete");
}

export async function teardown() {
  console.log("[Simple Setup] Tearing down...");

  for (const client of Object.values(prismaClients)) {
    await client.$disconnect();
  }

  console.log("[Simple Setup] Teardown complete");
}

export function getPrismaClientForWorker(): PrismaClient {
  const workerId = parseInt(process.env.VITEST_WORKER_ID || "1", 10);

  let client = prismaClients[workerId];

  if (!client) {
    const databaseUrl = globalDatabaseUrl || process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

    if (databaseUrl) {
      console.log(`[Simple Setup] Creating new Prisma client for worker ${workerId}`);
      client = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl,
          },
        },
      });

      prismaClients[workerId] = client;
    }
  }

  if (!client) {
    throw new Error(
      `No Prisma client available for worker ${workerId}. Available workers: ${Object.keys(prismaClients).join(", ")}`,
    );
  }
  return client;
}

export async function createTestUser(
  role: "USER" | "STAFF" = "USER",
): Promise<{ userId: number; token: string }> {
  const prisma = getPrismaClientForWorker();
  const { createSigner } = await import("fast-jwt");
  const config = await import("../config").then((m) => m.default);

  const openid = `test-${role.toLowerCase()}-${Date.now()}-${Math.random()}`;

  const user = await prisma.user.create({
    data: {
      openid,
      nickname: `Test ${role} User`,
      role,
    },
  });

  const signer = createSigner({
    key: config.JWT_SECRET,
    expiresIn: "1h",
  });

  const userPayload = {
    userId: user.id,
    openid,
    role,
  };
  const token = await signer(userPayload);

  return { userId: user.id, token };
}

let testBookCounter = 0;

export async function createTestInventoryItems(count: number): Promise<number[]> {
  const prisma = getPrismaClientForWorker();

  const workerId = parseInt(process.env.VITEST_WORKER_ID || "1", 10);
  testBookCounter++;
  const uniqueIsbn = `978${workerId}${String(testBookCounter).padStart(9, "0")}`.slice(0, 13);

  const bookMaster = await prisma.bookMaster.upsert({
    where: { isbn13: uniqueIsbn },
    update: {},
    create: {
      isbn13: uniqueIsbn,
      title: `Test Book ${workerId}-${testBookCounter}`,
      author: "Test Author",
      publisher: "Test Publisher",
      original_price: 10000,
    },
  });

  const bookSku = await prisma.bookSku.create({
    data: {
      master_id: bookMaster.id,
      edition: "1st Edition",
      cover_image_url: "https://example.com/cover.jpg",
    },
  });

  const inventoryItems = [];
  for (let i = 0; i < count; i++) {
    const item = await prisma.inventoryItem.create({
      data: {
        sku_id: bookSku.id,
        condition: "GOOD",
        cost: 6000,
        selling_price: 8000,
        status: "in_stock",
      },
    });
    inventoryItems.push(item.id);
  }

  return inventoryItems;
}

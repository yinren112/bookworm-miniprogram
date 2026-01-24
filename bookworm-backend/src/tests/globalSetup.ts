// Simple global setup that uses existing docker-compose postgres container
// instead of Testcontainers (for environments where Testcontainers doesn't work)

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { resetDatabase } from './utils/resetDb';

const execAsync = promisify(exec);
const prismaBinary = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'prisma');

const prismaClients: Record<number, PrismaClient> = {};
let globalDatabaseUrl: string = '';

declare global {
  var __BOOKWORM_TRUNCATE__: ((workerId?: number) => Promise<void>) | undefined;
}

export async function setup(config: any) {
  console.log('[Simple Setup] Using existing DATABASE_URL from .env.test');

  // Get DATABASE_URL from environment (set by dotenv in package.json script)
  const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set in .env.test');
  }

  globalDatabaseUrl = databaseUrl;

  console.log('[Simple Setup] Database URL configured');
  console.log('[Simple Setup] Applying migrations...');

  // Apply migrations to the test database
  try {
    await execAsync(`${prismaBinary} migrate deploy`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    console.log('[Simple Setup] Migrations applied successfully');
  } catch (error) {
    console.error('[Simple Setup] Migration failed:', error);
    throw error;
  }

  // Create Prisma Client for worker 1 (single worker mode)
  const workerId = 1;
  prismaClients[workerId] = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  // Reset database to clean state
  console.log('[Simple Setup] Resetting database...');
  await resetDatabase(prismaClients[workerId]);
  console.log('[Simple Setup] Database reset complete');

  // Store connection URL in global scope
  (global as any).TEST_DATABASE_URL = databaseUrl;

  // Provide a truncate function for tests
  global.__BOOKWORM_TRUNCATE__ = async (workerId: number = 1) => {
    const client = prismaClients[workerId] ?? getPrismaClientForWorker();
    await resetDatabase(client);
  };

  console.log('[Simple Setup] Setup complete');
}

export async function teardown() {
  console.log('[Simple Setup] Tearing down...');

  // Disconnect all Prisma clients
  for (const client of Object.values(prismaClients)) {
    await client.$disconnect();
  }

  console.log('[Simple Setup] Teardown complete');
}

// Helper to get the Prisma Client for the current worker
export function getPrismaClientForWorker(): PrismaClient {
  const workerId = parseInt(process.env.VITEST_WORKER_ID || '1', 10);

  // Try to get the stored client first
  let client = prismaClients[workerId];

  // If not found, create a new client using the global database URL
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

      // Store it for future use
      prismaClients[workerId] = client;
    }
  }

  if (!client) {
    throw new Error(`No Prisma client available for worker ${workerId}. Available workers: ${Object.keys(prismaClients).join(', ')}`);
  }
  return client;
}

// Helper functions that use the worker's Prisma client
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

  // Create JWT token
  const signer = createSigner({
    key: config.JWT_SECRET,
    expiresIn: "1h",
  });

  const userPayload = {
    userId: user.id,
    openid,
    role, // Include role in JWT payload for proper authorization
  };
  const token = await signer(userPayload);

  return { userId: user.id, token };
}

let testBookCounter = 0;

export async function createTestInventoryItems(
  count: number,
): Promise<number[]> {
  const prisma = getPrismaClientForWorker();

  // Generate a stable, deterministic ISBN for contract tests
  const workerId = parseInt(process.env.VITEST_WORKER_ID || '1', 10);
  testBookCounter++;

  // Use deterministic ISBN based on worker ID and counter only (no timestamp/random)
  const uniqueIsbn = `978${workerId}${String(testBookCounter).padStart(9, '0')}`.slice(0, 13);

  const bookMaster = await prisma.bookMaster.upsert({
    where: { isbn13: uniqueIsbn },
    update: {},
    create: {
      isbn13: uniqueIsbn,
      title: `Test Book ${workerId}-${testBookCounter}`,
      author: "Test Author",
      publisher: "Test Publisher",
      original_price: 10000, // 100 yuan = 10000 cents
    },
  });

  // Create a test book SKU
  const bookSku = await prisma.bookSku.create({
    data: {
      master_id: bookMaster.id,
      edition: "1st Edition",
      cover_image_url: "https://example.com/cover.jpg",
    },
  });

  // Create multiple inventory items
  const inventoryItems = [];
  for (let i = 0; i < count; i++) {
    const item = await prisma.inventoryItem.create({
      data: {
        sku_id: bookSku.id,
        condition: "GOOD",
        cost: 6000, // 60 yuan = 6000 cents
        selling_price: 8000, // 80 yuan = 8000 cents
        status: "in_stock",
      },
    });
    inventoryItems.push(item.id);
  }

  return inventoryItems;
}

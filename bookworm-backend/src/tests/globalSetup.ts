import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const execAsync = promisify(exec);

const prismaBinary = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'prisma');

// This object will hold a mapping from worker ID to its dedicated container instance.
const containers: Record<number, StartedPostgreSqlContainer> = {};
const prismaClients: Record<number, PrismaClient> = {};
const connectionUrls: Record<number, string> = {};

declare global {
  // eslint-disable-next-line no-var
  var __BOOKWORM_TRUNCATE__: ((workerId?: number) => Promise<void>) | undefined;
}

export async function setup(config: any) {
  const workers = config.workers || 1; // Get the number of parallel workers, default to 1

  for (let i = 1; i <= workers; i++) {
    console.log(`[Worker ${i}] Starting a dedicated PostgreSQL container...`);
    const container = await new PostgreSqlContainer('postgres:15').start();
    containers[i] = container;

    const databaseUrl = container.getConnectionUri();
    connectionUrls[i] = databaseUrl;
    console.log(`[Worker ${i}] Container started. Applying migrations...`);

    await execAsync(`${prismaBinary} migrate deploy`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    console.log(`[Worker ${i}] Migrations applied.`);

    // Store a Prisma Client instance for this worker
    prismaClients[i] = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    await truncateAllTables(prismaClients[i]);
  }

  // Pass the container details to the test environment
  process.env.TEST_CONTAINERS = JSON.stringify(connectionUrls);

  globalThis.__BOOKWORM_TRUNCATE__ = async (workerId?: number) => {
    const resolvedWorkerId = workerId ?? parseInt(process.env.VITEST_WORKER_ID || '1', 10);
    const client = prismaClients[resolvedWorkerId] ?? getPrismaClientForWorker();
    await truncateAllTables(client);
  };
}

export async function teardown() {
  console.log('Tearing down all test containers...');
  await Promise.all(
    Object.values(containers).map(async (container) => {
      try {
        await container.stop();
      } catch (error) {
        console.warn('Failed to stop test container cleanly:', error);
      }
    })
  );
  console.log('All containers stopped.');
}

// Helper to get the Prisma Client for the current worker
export function getPrismaClientForWorker(): PrismaClient {
  const workerId = parseInt(process.env.VITEST_WORKER_ID || '1', 10);

  // Try to get the stored client first
  let client = prismaClients[workerId];

  // If not found, try to create a new client using the container URL from environment
  if (!client) {
    const testContainers = process.env.TEST_CONTAINERS;
    if (testContainers) {
      const containers = JSON.parse(testContainers);
      const databaseUrl = containers[workerId] || containers['1']; // Fallback to worker 1 if current worker not found

      if (databaseUrl) {
        console.log(`Creating new Prisma client for worker ${workerId} with URL: ${databaseUrl.substring(0, 30)}...`);
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
  }

  if (!client) {
    throw new Error(`No Prisma client available for worker ${workerId}. Available workers: ${Object.keys(prismaClients).join(', ')}, TEST_CONTAINERS: ${process.env.TEST_CONTAINERS}`);
  }
  return client;
}

async function truncateAllTables(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "RecommendedBookItem",
      "RecommendedBookList",
      "UserProfile",
      "PaymentRecord",
      "orderitem",
      "inventory_reservation",
      "inventoryitem",
      "pending_payment_order",
      "Order",
      "Acquisition",
      "booksku",
      "bookmaster",
      "Content",
      "User"
    RESTART IDENTITY CASCADE;
  `);
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
  };
  const token = await signer(userPayload);

  return { userId: user.id, token };
}

let testBookCounter = 0;

export async function createTestInventoryItems(
  count: number,
): Promise<number[]> {
  const prisma = getPrismaClientForWorker();

  // Generate a truly unique ISBN using multiple entropy sources
  const workerId = parseInt(process.env.VITEST_WORKER_ID || '1', 10);
  const timestamp = Date.now();
  const randomNum = Math.floor(Math.random() * 100000);
  testBookCounter++;

  // Use upsert to handle potential conflicts gracefully
  const uniqueIsbn = `978${workerId}${testBookCounter}${randomNum}`.slice(0, 13).padEnd(13, '0');

  const bookMaster = await prisma.bookMaster.upsert({
    where: { isbn13: uniqueIsbn },
    update: {},
    create: {
      isbn13: uniqueIsbn,
      title: `Test Book ${timestamp}-${testBookCounter}`,
      author: "Test Author",
      publisher: "Test Publisher",
      original_price: 100.0,
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
        cost: 60.0,
        selling_price: 80.0,
        status: "in_stock",
      },
    });
    inventoryItems.push(item.id);
  }

  return inventoryItems;
}

import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import net from "node:net";
import { PrismaClient } from "@prisma/client";
import { resetDatabase } from "./utils/resetDb";

const execAsync = promisify(exec);
const prismaBinary = path.join(__dirname, "..", "..", "node_modules", ".bin", "prisma");

const containers: Record<number, { name: string; port: number }> = {};
const prismaClients: Record<number, PrismaClient> = {};
const connectionUrls: Record<number, string> = {};

declare global {
  var __BOOKWORM_TRUNCATE__: ((workerId?: number) => Promise<void>) | undefined;
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Failed to allocate a free port"));
      });
    });
  });
}

async function waitForPostgres(containerName: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await execAsync(`docker exec ${containerName} pg_isready -U postgres`, {
        timeout: 5000,
        env: {
          ...process.env,
          ...(process.platform === "win32"
            ? { DOCKER_HOST: "npipe:////./pipe/dockerDesktopLinuxEngine" }
            : {}),
        },
      });
      return;
    } catch (error) {
      void error;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("PostgreSQL container did not become ready in time");
}

export async function setup(config: any) {
  const workers = config.workers || 1;

  for (let i = 1; i <= workers; i++) {
    const port = await getFreePort();
    const name = `bookworm-test-pg-${process.pid}-${i}-${Date.now()}`;
    containers[i] = { name, port };

    await execAsync(
      `docker run -d --name ${name} -e POSTGRES_PASSWORD=password -e POSTGRES_DB=bookworm_test -p ${port}:5432 postgres:15`,
      {
        timeout: 60000,
        env: {
          ...process.env,
          ...(process.platform === "win32"
            ? { DOCKER_HOST: "npipe:////./pipe/dockerDesktopLinuxEngine" }
            : {}),
        },
      },
    );

    await waitForPostgres(name, 60000);

    const databaseUrl = `postgresql://postgres:password@localhost:${port}/bookworm_test`;
    connectionUrls[i] = databaseUrl;

    await execAsync(`${prismaBinary} migrate deploy`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      timeout: 600000,
    });

    prismaClients[i] = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    await resetDatabase(prismaClients[i]);
  }

  process.env.TEST_CONTAINERS = JSON.stringify(connectionUrls);

  globalThis.__BOOKWORM_TRUNCATE__ = async (workerId?: number) => {
    const resolvedWorkerId = workerId ?? parseInt(process.env.VITEST_WORKER_ID || "1", 10);
    const client = prismaClients[resolvedWorkerId] ?? getPrismaClientForWorker();
    await resetDatabase(client);
  };
}

export async function teardown() {
  for (const client of Object.values(prismaClients)) {
    await client.$disconnect();
  }
  for (const entry of Object.values(containers)) {
    try {
      await execAsync(`docker rm -f ${entry.name}`, {
        timeout: 30000,
        env: {
          ...process.env,
          ...(process.platform === "win32"
            ? { DOCKER_HOST: "npipe:////./pipe/dockerDesktopLinuxEngine" }
            : {}),
        },
      });
    } catch (error) {
      void error;
    }
  }
}

export function getPrismaClientForWorker(): PrismaClient {
  const workerId = parseInt(process.env.VITEST_WORKER_ID || "1", 10);
  let client = prismaClients[workerId];
  if (client) return client;

  const testContainers = process.env.TEST_CONTAINERS;
  if (!testContainers) {
    throw new Error(`No Prisma client available for worker ${workerId}`);
  }

  const urls = JSON.parse(testContainers);
  const databaseUrl = urls[workerId] || urls["1"];
  if (!databaseUrl) {
    throw new Error(`No Prisma client available for worker ${workerId}`);
  }

  client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  prismaClients[workerId] = client;
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

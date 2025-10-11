// src/tests/database-integration-setup.ts
// Setup for tests that need real database connections (like order expiration tests)
import "dotenv/config";
import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { buildApp } from "../index";
import * as dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: ".env.test" });

let prisma: PrismaClient;

beforeAll(async () => {
  console.log("Setting up database integration test environment...");

  // Ensure DATABASE_URL is set by globalSetup (Testcontainers)
  const testDatabaseUrl = process.env.DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Integration tests require PostgreSQL via Testcontainers."
    );
  }

  // Create a fresh Prisma client for testing
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: testDatabaseUrl,
      },
    },
  });

  // Connect to test database
  await prisma.$connect();
  console.log(`Connected to PostgreSQL test database: ${testDatabaseUrl}`);

  // Basic connectivity test
  try {
    await prisma.$executeRaw`SELECT 1`;
  } catch (error) {
    console.error("Database connection failed:", error);
    throw new Error("Test database is not accessible");
  }
});

afterAll(async () => {
  console.log("Cleaning up database integration test environment...");

  if (prisma) {
    await prisma.$disconnect();
  }
});

// Export helper functions for use in individual tests
export async function setupTestEnv() {
  // Clean all test data at the start of each test
  await cleanupTestData();
}

export async function cleanupTestEnv() {
  // Clean all test data at the end of each test
  await cleanupTestData();
}

async function cleanupTestData() {
  if (!prisma) return;

  try {
    // Use TRUNCATE to efficiently delete all data from tables and reset sequences,
    // respecting foreign key dependencies via CASCADE.
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "PaymentRecord",
        "orderitem",
        "inventory_reservation",
        "inventoryitem",
        "pending_payment_order",
        "Order",
        "booksku",
        "bookmaster",
        "Content",
        "User"
      RESTART IDENTITY CASCADE;
    `);
  } catch (error) {
    console.warn("Cleanup error (may be expected):", error);
  }
}

export async function createTestUser(
  role: "USER" | "STAFF" = "USER",
): Promise<{ userId: number; token: string }> {
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

export async function createTestInventoryItems(
  count: number,
): Promise<number[]> {
  // Create a test book master with unique ISBN using timestamp + random
  const uniqueIsbn =
    `978${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 13);
  const bookMaster = await prisma.bookMaster.create({
    data: {
      isbn13: uniqueIsbn,
      title: "Test Book",
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

export function setupIsolatedTestEnvironment() {
  let app: FastifyInstance;

  // This will run before all tests in a file that uses this setup.
  beforeAll(async () => {
    // 1. Build a fresh, new Fastify app instance.
    app = await buildApp();
    await app.ready(); // Ensure all plugins are loaded
  });

  // This will run after all tests in the file.
  afterAll(async () => {
    // 2. Close the app instance to release resources.
    await app.close();
  });

  // This will run after each individual test.
  afterEach(async () => {
    // 3. Clean the database to ensure the next test starts with a clean slate.
    await cleanupTestEnv(); // Assuming cleanupTestEnv is your robust cleanup function
  });

  // Return the app instance so tests can use it.
  return {
    getApp: () => app,
  };
}

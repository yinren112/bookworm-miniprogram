// src/tests/setup.ts
import { vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Create a mock Prisma client
const prismaMock = {
  bookMaster: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  bookSku: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  inventoryItem: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  user: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  order: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  orderItem: {
    create: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  paymentRecord: {
    create: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
  $queryRawUnsafe: vi.fn(),
} as unknown as PrismaClient;

vi.mock("../db", () => ({
  __esModule: true,
  default: prismaMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.$transaction as unknown as any).mockImplementation(async (fn: any) => fn(prismaMock));
});

export { prismaMock };

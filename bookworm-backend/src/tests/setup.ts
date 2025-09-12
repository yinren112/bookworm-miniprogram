// src/tests/setup.ts
import { vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Create a mock Prisma client
const prismaMock = {
  bookmaster: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  booksku: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  inventoryitem: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
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
  orderitem: {
    create: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  paymentRecord: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
} as unknown as PrismaClient;

vi.mock('../db', () => ({
  __esModule: true,
  default: prismaMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

export { prismaMock };
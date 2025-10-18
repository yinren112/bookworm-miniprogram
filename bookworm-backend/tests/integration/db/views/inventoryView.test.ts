import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestInventoryItems,
  getPrismaClientForWorker,
} from "../../../../src/tests/globalSetup";
import {
  inventorySelectBasic,
  inventorySelectPublic,
} from "../../../../src/db/views/inventoryView";

describe("db/views/inventoryView", () => {
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    await globalThis.__BOOKWORM_TRUNCATE__?.();
  });

beforeEach(async () => {
  await globalThis.__BOOKWORM_TRUNCATE__?.();
});

afterEach(async () => {
  await globalThis.__BOOKWORM_TRUNCATE__?.();
});

  it("returns public inventory shape without internal fields", async () => {
    const [inventoryItemId] = await createTestInventoryItems(1);

    const item = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: inventorySelectPublic,
    });

    expect(item).not.toBeNull();
    expect(item).toHaveProperty("id", inventoryItemId);
    expect(item).toHaveProperty("selling_price");
    expect(item).not.toHaveProperty("status");
    expect(item!.bookSku.bookMaster).toMatchObject({
      id: expect.any(Number),
      title: expect.any(String),
    });
  });

  it("includes status for internal consumers via the basic selector", async () => {
    const [inventoryItemId] = await createTestInventoryItems(1);

    const item = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: inventorySelectBasic,
    });

    expect(item).not.toBeNull();
    expect(item).toHaveProperty("status", "in_stock");
    expect(item).toHaveProperty("bookSku");
    expect(item!.bookSku.bookMaster).toHaveProperty("isbn13");
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp } from "../app-factory";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";

const SELL_ENDPOINT = "/api/sell-orders";

describe("Sell Orders API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await getPrismaClientForWorker(); // ensure prisma client and schema ready
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows staff to create and complete a sell order", async () => {
    const { token: staffToken } = await createTestUser("STAFF");
    const customerPhone = "13900139000";

    const response = await app.inject({
      method: "POST",
      url: SELL_ENDPOINT,
      headers: {
        authorization: `Bearer ${staffToken}`,
      },
      payload: {
        customerPhoneNumber: customerPhone,
        totalWeightKg: 3.2,
        unitPrice: 250,  // 2.50 yuan/kg = 250 cents/kg
        settlementType: "CASH",
        notes: "Incoming bulk purchase",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);

    expect(body).toHaveProperty("order");
    expect(body).toHaveProperty("inventoryItem");

    const { order, inventoryItem } = body;
    // 3.2kg * 250 cents/kg = 800 cents
    expect(order.status).toBe("COMPLETED");
    expect(order.type).toBe("SELL");
    expect(order.total_amount).toBe(800);
    expect(order.settlementType).toBe("CASH");
    expect(order.totalWeightKg).toBeCloseTo(3.2);
    expect(order.unitPrice).toBe(250);

    expect(inventoryItem.status).toBe("BULK_ACQUISITION");
    expect(inventoryItem.sourceOrderId).toBe(order.id);
    // cost和selling_price在数据库中以Integer存储（cents为单位）
    // 800 cents
    expect(Number(inventoryItem.cost)).toBe(800);
    expect(Number(inventoryItem.selling_price)).toBe(0);
  });

  it("rejects non-staff callers", async () => {
    const { token } = await createTestUser("USER");
    const customerPhone = "13900139001";

    const response = await app.inject({
      method: "POST",
      url: SELL_ENDPOINT,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        customerPhoneNumber: customerPhone,
        totalWeightKg: 1.5,
        unitPrice: 200,
        settlementType: "CASH",
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.payload);
    expect(body.code).toBe("FORBIDDEN");
  });

  it("should be rejected by database if a BULK_ACQUISITION item is created without a sourceOrderId", async () => {
    await createTestUser("STAFF");
    const prisma = getPrismaClientForWorker();

    let bulkSku = await prisma.bookSku.findFirst({ where: { edition: "批量" } });

    if (!bulkSku) {
      const master = await prisma.bookMaster.create({
        data: {
          isbn13: "0000000000000",
          title: "批量",
        },
      });

      bulkSku = await prisma.bookSku.create({
        data: {
          master_id: master.id,
          edition: "批量",
        },
      });
    }

    if (!bulkSku) {
      throw new Error("expected bulk SKU to exist for defensive constraint test");
    }

    await expect(
      prisma.inventoryItem.create({
        data: {
          sku_id: bulkSku.id,
          condition: "ACCEPTABLE",
          cost: 1000, // 10 yuan = 1000 cents
          selling_price: 0, // Not for sale
          status: "BULK_ACQUISITION",
          sourceOrderId: null,
        },
      }),
    ).rejects.toThrow(/chk_source_order_id_for_bulk_acquisition/i);
  });
});

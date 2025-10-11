import { describe, it, expect, beforeAll, vi } from "vitest";
import { getPrismaClientForWorker, createTestUser, createTestInventoryItems } from "./globalSetup";

process.env.WX_APP_ID ??= "test-app-id";
process.env.WX_APP_SECRET ??= "test-app-secret";
process.env.WXPAY_MCHID ??= "test-mch-id";
process.env.WXPAY_NOTIFY_URL ??= "https://example.com/pay-notify";
process.env.WXPAY_PRIVATE_KEY_PATH ??= "test-private-key-path";
process.env.WXPAY_CERT_SERIAL_NO ??= "test-cert-serial";
process.env.WXPAY_API_V3_KEY ??= "test-api-key";
process.env.JWT_SECRET ??= "test-jwt-secret";

const { generatePaymentParams, createOrder } = await import("../services/orderService");

// 验证生成支付参数前的金额篡改防护

describe("order payment amount integrity", () => {
  let prisma: ReturnType<typeof getPrismaClientForWorker>;

  beforeAll(() => {
    prisma = getPrismaClientForWorker();
  });

  it("rejects payment params when stored total diverges from recalculated sum", async () => {
    const { userId } = await createTestUser("USER");
    const inventoryItemIds = await createTestInventoryItems(1);
    const order = await createOrder(prisma, { userId, inventoryItemIds });

    await prisma.$executeRaw`UPDATE "Order" SET total_amount = total_amount + 1 WHERE id = ${order.id}`;

    const mockAdapter = {
      createPaymentOrder: vi.fn(),
      generateSignature: vi.fn(),
    } as any;

    await expect(
      generatePaymentParams(prisma, mockAdapter, order.id, userId),
    ).rejects.toMatchObject({ code: "AMOUNT_MISMATCH_FATAL" });

    expect(mockAdapter.createPaymentOrder).not.toHaveBeenCalled();
  });
});

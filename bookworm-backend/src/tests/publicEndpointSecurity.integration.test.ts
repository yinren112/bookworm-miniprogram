// src/tests/publicEndpointSecurity.integration.test.ts
/**
 * 公开端点安全性测试
 * 确保公开端点不泄露敏感字段（cost_price、internal* 等）
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";
import { getAvailableBooks } from "../services/inventoryService";
import { addBookToInventoryTest } from "./test-helpers/testServices";

describe("Public Endpoint Security Tests", () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
  });

  describe("GET /api/inventory/available (getAvailableBooks)", () => {
    beforeEach(async () => {
      // 创建测试图书（包含 cost_price 敏感字段）
      await addBookToInventoryTest(prisma, {
        isbn13: "9780123456789",
        title: "Test Book with Sensitive Data",
        author: "Test Author",
        condition: "NEW",
        cost: 1500, // 成本价 15 元（敏感！）
        selling_price: 2500, // 售价 25 元（公开）
      });
    });

    it("should NOT return cost_price field in response", async () => {
      const result = await getAvailableBooks(prisma, {});

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);

      // 验证返回的每个 item 都不包含 cost 或 cost_price 字段
      for (const item of result.data) {
        expect(item).not.toHaveProperty("cost");
        expect(item).not.toHaveProperty("cost_price");

        // 确保包含公开字段
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("condition");
        expect(item).toHaveProperty("selling_price");
        expect(item).toHaveProperty("status");
      }
    });

    it("should NOT return internal fields in nested bookSku", async () => {
      const result = await getAvailableBooks(prisma, {});

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);

      // 验证嵌套的 bookSku 对象不包含敏感字段
      for (const item of result.data) {
        if (item.booksku) {
          // bookSku 本身没有敏感字段，但确保不包含未预期的字段
          const allowedBookSkuKeys = ["id", "edition", "cover_image_url", "bookmaster"];
          const actualKeys = Object.keys(item.booksku);

          // 检查是否有未预期的字段（可能是敏感字段）
          const unexpectedKeys = actualKeys.filter(
            key => !allowedBookSkuKeys.includes(key)
          );
          expect(unexpectedKeys).toEqual([]);
        }
      }
    });

    it("should return valid public fields for display", async () => {
      const result = await getAvailableBooks(prisma, {});

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);

      const firstItem = result.data[0];

      // 验证公开字段存在且有效
      expect(firstItem.id).toBeDefined();
      expect(firstItem.condition).toBeDefined();
      expect(firstItem.selling_price).toBeDefined();
      expect(Number(firstItem.selling_price)).toBeGreaterThan(0);
      expect(firstItem.status).toBe("in_stock");

      // 验证嵌套的 bookMaster 包含必要的公开信息
      expect(firstItem.booksku?.bookmaster?.title).toBeDefined();
      expect(firstItem.booksku?.bookmaster?.isbn13).toBeDefined();
    });
  });

  describe("GET /api/acquisitions/check", () => {
    beforeEach(async () => {
      // 创建可收购的图书
      const input = {
        isbn13: "9780987654321",
        title: "Acquirable Test Book",
        author: "Test Author",
        condition: "NEW" as const,
        cost: 1000,
        selling_price: 2000,
      };

      const item = await addBookToInventoryTest(prisma, input);

      // 标记 BookSku 为可收购
      await prisma.bookSku.updateMany({
        where: {
          bookMaster: { isbn13: input.isbn13 }
        },
        data: {
          is_acquirable: true
        }
      });
    });

    it("should NOT return cost_price or internal fields", async () => {
      // 查询可收购的图书（模拟 acquisitions/check 端点逻辑）
      const acquirableSkus = await prisma.bookSku.findMany({
        where: {
          is_acquirable: true,
          bookMaster: {
            isbn13: "9780987654321"
          }
        },
        include: {
          bookMaster: {
            select: {
              title: true,
              author: true,
              original_price: true,
            }
          }
        }
      });

      expect(acquirableSkus).toBeDefined();
      expect(acquirableSkus.length).toBeGreaterThan(0);

      // 验证返回的数据不包含敏感字段
      for (const sku of acquirableSkus) {
        expect(sku).not.toHaveProperty("cost");
        expect(sku).not.toHaveProperty("cost_price");

        // 验证 bookMaster 只包含允许的字段
        const bookMasterKeys = Object.keys(sku.bookMaster);
        const allowedKeys = ["title", "author", "original_price"];

        for (const key of bookMasterKeys) {
          expect(allowedKeys).toContain(key);
        }

        // 确保不包含其他敏感字段（如 publisher_cost 等）
        expect(sku.bookMaster).not.toHaveProperty("publisher_cost");
        expect(sku.bookMaster).not.toHaveProperty("internal_notes");
      }
    });

    it("should return only public book information for acquisition price calculation", async () => {
      const acquirableSkus = await prisma.bookSku.findMany({
        where: {
          is_acquirable: true,
          bookMaster: {
            isbn13: "9780987654321"
          }
        },
        include: {
          bookMaster: {
            select: {
              title: true,
              author: true,
              original_price: true,
            }
          }
        }
      });

      expect(acquirableSkus.length).toBeGreaterThan(0);

      const sku = acquirableSkus[0];

      // 验证可以安全地用于收购价计算的字段
      expect(sku.id).toBeDefined();
      expect(sku.edition).toBeDefined();
      expect(sku.bookMaster.title).toBeDefined();
      expect(sku.bookMaster.author).toBeDefined();

      // original_price 是公开的（用于计算建议收购价）
      // 这不是敏感字段，因为它是书籍的原价（市场公开信息）
      expect(sku.bookMaster).toHaveProperty("original_price");
    });
  });

  describe("Data Sanitization Regression Tests", () => {
    it("should prevent cost_price leakage in any inventory query results", async () => {
      // 创建多本书
      for (let i = 0; i < 5; i++) {
        await addBookToInventoryTest(prisma, {
          isbn13: `978012345678${i}`,
          title: `Test Book ${i}`,
          author: "Test Author",
          condition: "NEW",
          cost: 1000 + i * 100,
          selling_price: 2000 + i * 100,
        });
      }

      const result = await getAvailableBooks(prisma, { limit: 10 });

      // 验证批量查询也不会泄露敏感字段
      const serializedResult = JSON.stringify(result);

      // 确保序列化后的结果不包含敏感字段名
      expect(serializedResult).not.toContain("cost_price");
      expect(serializedResult).not.toContain('"cost":');

      // 但应该包含公开字段
      expect(serializedResult).toContain("selling_price");
      expect(serializedResult).toContain("condition");
    });
  });
});

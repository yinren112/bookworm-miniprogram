/**
 * API Contract Tests
 *
 * 目标：冻结公共 API 的 JSON 响应结构，防止意外的破坏性变更
 *
 * 策略：
 * - 黑箱测试：仅验证 HTTP 响应的 JSON 结构
 * - 快照测试：使用 Jest snapshots 冻结响应格式
 * - Normalize：去除动态字段（timestamp, token, ID等）
 *
 * 重要：
 * - CI 中禁止自动更新快照 (--updateSnapshot)
 * - 快照变更需要 Code Review 并附上破坏性/兼容性说明
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp } from "../../app-factory";
import { FastifyInstance } from "fastify";
import { getPrismaClientForWorker, createTestUser, createTestInventoryItems } from '../globalSetup';
import { PrismaClient } from "@prisma/client";

/**
 * 规范化函数：去除动态字段
 *
 * 动态字段包括：
 * - 时间戳: createdAt, updatedAt, paymentExpiresAt, paid_at, cancelled_at, etc.
 * - 令牌: token, access_token, refresh_token
 * - 动态ID: 某些情况下的 ID（如果测试之间不稳定）
 * - 签名: signature, nonce
 * - 取货码: pickupCode（每次生成不同）
 */
function normalize(input: any): any {
  if (input == null) return input;

  if (Array.isArray(input)) return input.map(normalize);

  if (typeof input === 'object') {
    const out: any = {};
    for (const [key, value] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();

      // 动态 ID/令牌/签名类
      if (/(^|_)(id|token|nonce|signature|sign)$/.test(lowerKey) && typeof value === 'string') {
        out[key] = '[DYNAMIC]';
        continue;
      }

      // 时间戳类
      if (/(^|_)(created|updated|paid|refunded)at$/.test(lowerKey)) {
        out[key] = '[DYNAMIC_TIMESTAMP]';
        continue;
      }

      // 业务敏感动态字段
      if (lowerKey === 'pickupcode' || lowerKey === 'pickup_code') { out[key] = '[DYNAMIC_PICKUP_CODE]'; continue; }
      if (lowerKey === 'openid') { out[key] = '[DYNAMIC_OPENID]'; continue; }
      if (lowerKey === 'phonenumber' || lowerKey === 'phone' || lowerKey === 'phone_number') { out[key] = '[DYNAMIC_PHONE]'; continue; }

      // slug：包含时间戳/递增后缀的场景，如 test-content-1697... 或 ...-123
      if (lowerKey === 'slug' && typeof value === 'string') {
        if (/-\d+($|[^a-zA-Z])/.test(value) || /\d{6,}/.test(value)) {
          out[key] = '[DYNAMIC_SLUG]';
          continue;
        }
      }

      out[key] = normalize(value);
    }
    return out;
  }

  // ISO 时间字符串兜底
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(input)) return '[DYNAMIC_TIMESTAMP]';
  return input;
}

describe("API Contract Tests", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let staffToken: string;
  let userToken: string;
  let testUserId: number;
  let staffUserId: number;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const staffUser = await createTestUser("STAFF");
    const regularUser = await createTestUser("USER");

    staffToken = staffUser.token;
    userToken = regularUser.token;
    testUserId = regularUser.userId;
    staffUserId = staffUser.userId;
  });

  describe("Authentication APIs", () => {
    it("POST /api/auth/login - 登录成功返回token和userId", async () => {
      // 测试目标：验证登录响应结构
      const mockOpenid = `test-openid-${Date.now()}`;

      // 创建mock用户
      await prisma.user.create({
        data: {
          openid: mockOpenid,
          role: "USER",
          status: "REGISTERED",
        }
      });

      const res = await request(app.server)
        .post("/api/auth/login")
        .send({ code: `test-code-${Date.now()}` });

      expect(res.status).toBe(200);
      expect(normalize(res.body)).toMatchSnapshot();
    });
  });

  describe("Inventory APIs", () => {
    it("GET /api/inventory/available - 获取可用库存列表", async () => {
      // 前置：创建一些库存
      await createTestInventoryItems(3);

      const res = await request(app.server)
        .get("/api/inventory/available")
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);

      // 验证基本结构
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);

      // 快照测试（去除动态字段和ID）
      const normalizedBody = {
        ...normalize(res.body),
        // 进一步规范化：去除 ID，因为它们在不同测试运行中可能不同
        data: res.body.data.map((item: any) => ({
          ...normalize(item),
          id: '[DYNAMIC_ID]',
          booksku: {
            ...normalize(item.booksku),
            id: '[DYNAMIC_ID]',
            bookmaster: {
              ...normalize(item.booksku?.bookmaster),
              id: '[DYNAMIC_ID]'
            }
          }
        }))
      };

      expect(normalizedBody).toMatchSnapshot();
    });

    it("GET /api/inventory/item/:id - 获取单个库存详情", async () => {
      const [itemId] = await createTestInventoryItems(1);

      const res = await request(app.server)
        .get(`/api/inventory/item/${itemId}`);

      expect(res.status).toBe(200);

      // 规范化ID
      const normalizedBody = {
        ...normalize(res.body),
        id: '[DYNAMIC_ID]',
        sku_id: '[DYNAMIC_ID]',
        booksku: res.body.booksku ? {
          ...normalize(res.body.booksku),
          id: '[DYNAMIC_ID]',
          master_id: '[DYNAMIC_ID]',
          bookmaster: res.body.booksku.bookmaster ? {
            ...normalize(res.body.booksku.bookmaster),
            id: '[DYNAMIC_ID]'
          } : undefined
        } : undefined
      };

      expect(normalizedBody).toMatchSnapshot();
    });
  });

  describe("Order APIs", () => {
    it("POST /api/orders/create - 创建订单", async () => {
      const inventoryItemIds = await createTestInventoryItems(2);

      const res = await request(app.server)
        .post("/api/orders/create")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ inventoryItemIds });

      expect(res.status).toBe(201);

      // 规范化
      const normalizedBody = {
        ...normalize(res.body),
        id: '[DYNAMIC_ID]',
        userId: '[DYNAMIC_USER_ID]'
      };

      expect(normalizedBody).toMatchSnapshot();
    });

    it("GET /api/orders/:id - 获取订单详情", async () => {
      // 前置：创建一个订单
      const inventoryItemIds = await createTestInventoryItems(1);
      const createRes = await request(app.server)
        .post("/api/orders/create")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ inventoryItemIds });

      const orderId = createRes.body.id;

      const res = await request(app.server)
        .get(`/api/orders/${orderId}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);

      // 规范化
      const normalizedBody = {
        ...normalize(res.body),
        id: '[DYNAMIC_ID]',
        user_id: '[DYNAMIC_USER_ID]',
        items: res.body.items?.map((item: any) => ({
          ...normalize(item),
          id: '[DYNAMIC_ID]',
          order_id: '[DYNAMIC_ORDER_ID]',
          inventory_item_id: '[DYNAMIC_ITEM_ID]',
          inventory_item: item.inventory_item ? {
            ...normalize(item.inventory_item),
            id: '[DYNAMIC_ID]',
            sku_id: '[DYNAMIC_SKU_ID]'
          } : undefined
        }))
      };

      expect(normalizedBody).toMatchSnapshot();
    });

    it("GET /api/orders/my - 获取用户订单列表", async () => {
      // 前置：创建几个订单
      const inventoryItemIds1 = await createTestInventoryItems(1);
      const inventoryItemIds2 = await createTestInventoryItems(1);

      await request(app.server)
        .post("/api/orders/create")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ inventoryItemIds: inventoryItemIds1 });

      await request(app.server)
        .post("/api/orders/create")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ inventoryItemIds: inventoryItemIds2 });

      const res = await request(app.server)
        .get("/api/orders/my")
        .set("Authorization", `Bearer ${userToken}`)
        .query({ limit: 10 });

      expect(res.status).toBe(200);

      // 验证基本结构
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('meta');

      // 规范化
      const normalizedBody = {
        data: res.body.data.map((order: any) => ({
          ...normalize(order),
          id: '[DYNAMIC_ID]',
          user_id: '[DYNAMIC_USER_ID]'
        })),
        meta: {
          nextCursor: res.body.meta.nextCursor ? '[DYNAMIC_CURSOR]' : null
        }
      };

      expect(normalizedBody).toMatchSnapshot();
    });
  });

  describe("Books Recommendation APIs", () => {
    it("GET /api/books/recommendations - 获取推荐书籍（无用户资料）", async () => {
      const res = await request(app.server)
        .get("/api/books/recommendations")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);

      // 快照测试
      expect(normalize(res.body)).toMatchSnapshot();
    });

    it("GET /api/books/recommendations - 获取推荐书籍（有用户资料）", async () => {
      // 前置：创建用户资料
      await prisma.userProfile.create({
        data: {
          user_id: testUserId,
          enrollment_year: 2023,
          major: "计算机科学",
          class_name: "1班"
        }
      });

      const res = await request(app.server)
        .get("/api/books/recommendations")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);

      // 快照测试
      const normalizedBody = {
        ...normalize(res.body),
        items: res.body.items?.map((item: any) => ({
          ...normalize(item),
          id: '[DYNAMIC_ID]',
          list_id: '[DYNAMIC_LIST_ID]',
          sku_id: '[DYNAMIC_SKU_ID]'
        }))
      };

      expect(normalizedBody).toMatchSnapshot();
    });
  });

  describe("Content APIs", () => {
    it("GET /api/content/:slug - 获取静态内容", async () => {
      // 前置：创建一个内容
      const testSlug = `test-content-${Date.now()}`;
      await prisma.content.create({
        data: {
          slug: testSlug,
          title: "测试内容",
          body: "这是测试内容的正文",
        }
      });

      const res = await request(app.server)
        .get(`/api/content/${testSlug}`);

      expect(res.status).toBe(200);

      // 快照测试
      const normalizedBody = {
        ...normalize(res.body),
        id: '[DYNAMIC_ID]'
      };

      expect(normalizedBody).toMatchSnapshot();
    });
  });

  describe("User APIs", () => {
    it("GET /api/users/me - 获取当前用户信息", async () => {
      const res = await request(app.server)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);

      // 快照测试
      const normalizedBody = {
        ...normalize(res.body),
        id: '[DYNAMIC_ID]'
      };

      expect(normalizedBody).toMatchSnapshot();
    });
  });

  describe("Error Response Contracts", () => {
    it("401 Unauthorized - 缺少认证令牌", async () => {
      const res = await request(app.server)
        .get("/api/orders/my");

      expect(res.status).toBe(401);
      expect(normalize(res.body)).toMatchSnapshot();
    });

    it("403 Forbidden - 权限不足", async () => {
      const res = await request(app.server)
        .get("/api/orders/pending-pickup")
        .set("Authorization", `Bearer ${userToken}`); // 普通用户访问员工接口

      expect(res.status).toBe(403);
      expect(normalize(res.body)).toMatchSnapshot();
    });

    it("404 Not Found - 资源不存在", async () => {
      const res = await request(app.server)
        .get("/api/orders/99999")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(404);
      expect(normalize(res.body)).toMatchSnapshot();
    });

    it("400 Bad Request - 验证错误", async () => {
      const res = await request(app.server)
        .post("/api/orders/create")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ inventoryItemIds: "not-an-array" }); // 类型错误

      expect(res.status).toBe(400);
      expect(normalize(res.body)).toMatchSnapshot();
    });

    it("409 Conflict - 业务冲突", async () => {
      // 前置：创建一个订单（PENDING_PAYMENT）
      const inventoryItemIds1 = await createTestInventoryItems(1);
      await request(app.server)
        .post("/api/orders/create")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ inventoryItemIds: inventoryItemIds1 });

      // 尝试创建第二个订单（应该冲突）
      const inventoryItemIds2 = await createTestInventoryItems(1);
      const res = await request(app.server)
        .post("/api/orders/create")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ inventoryItemIds: inventoryItemIds2 });

      expect(res.status).toBe(409);
      expect(normalize(res.body)).toMatchSnapshot();
    });
  });
});

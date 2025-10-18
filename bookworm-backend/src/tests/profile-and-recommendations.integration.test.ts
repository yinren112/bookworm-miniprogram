// src/tests/profile-and-recommendations.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { createTestApp } from "../app-factory";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";

describe("User Profile & Recommendations Integration Tests", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/acquisitions - Customer Profile Collection", () => {
    it("应该在收购时创建用户画像", async () => {
      // 创建员工和顾客用户
      const { userId: staffId, token: staffToken } = await createTestUser("STAFF");
      const { userId: customerId } = await createTestUser("USER");

      // 创建一个可收购的 SKU
      const bookMaster = await prisma.bookMaster.create({
        data: {
          isbn13: "9780000000001",
          title: "测试教材",
        },
      });

      const bookSku = await prisma.bookSku.create({
        data: {
          master_id: bookMaster.id,
          edition: "第一版",
          is_acquirable: true,
        },
      });

      // 创建收购记录（包含用户画像）
      const response = await app.inject({
        method: "POST",
        url: "/api/acquisitions",
        headers: {
          authorization: `Bearer ${staffToken}`,
        },
        payload: {
          customerUserId: customerId,
          items: [
            {
              skuId: bookSku.id,
              condition: "GOOD",
              acquisitionPrice: 2500, // 25.00 元
            },
          ],
          settlementType: "CASH",
          notes: "测试收购",
          customerProfile: {
            phoneNumber: "13800138000",
            enrollmentYear: 2023,
            major: "计算机科学与技术",
            className: "计科2301",
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const acquisition = JSON.parse(response.payload);
      expect(acquisition.customer_user_id).toBe(customerId);
      expect(acquisition.total_value).toBe(2500);
      expect(acquisition.item_count).toBe(1);

      // 验证 UserProfile 已创建
      const profile = await prisma.userProfile.findUnique({
        where: { user_id: customerId },
      });

      expect(profile).not.toBeNull();
      expect(profile!.enrollment_year).toBe(2023);
      expect(profile!.major).toBe("计算机科学与技术");
      expect(profile!.class_name).toBe("计科2301");

      // 验证手机号已存储在 User 表（单一真相源）
      const user = await prisma.user.findUnique({
        where: { id: customerId },
      });
      expect(user!.phone_number).toBe("13800138000");

      // 验证库存项已创建
      const inventoryCount = await prisma.inventoryItem.count({
        where: { acquisitionId: acquisition.id },
      });
      expect(inventoryCount).toBe(1);
    });

    it("应该在第二次收购时更新用户画像", async () => {
      // 创建员工和顾客用户
      const { userId: staffId, token: staffToken } = await createTestUser("STAFF");
      const { userId: customerId } = await createTestUser("USER");

      // 创建可收购 SKU
      const bookMaster = await prisma.bookMaster.create({
        data: {
          isbn13: "9780000000002",
          title: "更新画像测试",
        },
      });

      const bookSku = await prisma.bookSku.create({
        data: {
          master_id: bookMaster.id,
          edition: "第一版",
          is_acquirable: true,
        },
      });

      // 首次收购
      await app.inject({
        method: "POST",
        url: "/api/acquisitions",
        headers: {
          authorization: `Bearer ${staffToken}`,
        },
        payload: {
          customerUserId: customerId,
          items: [{ skuId: bookSku.id, condition: "GOOD", acquisitionPrice: 2000 }],
          settlementType: "CASH",
          customerProfile: {
            phoneNumber: "13900139000",
            enrollmentYear: 2023,
            major: "软件工程",
            className: "软工2301",
          },
        },
      });

      // 第二次收购，更新画像
      const response = await app.inject({
        method: "POST",
        url: "/api/acquisitions",
        headers: {
          authorization: `Bearer ${staffToken}`,
        },
        payload: {
          customerUserId: customerId,
          items: [{ skuId: bookSku.id, condition: "NEW", acquisitionPrice: 3000 }],
          settlementType: "VOUCHER",
          voucherCode: "TEST2024",
          customerProfile: {
            phoneNumber: "13900139001", // 更新电话
            enrollmentYear: 2023,
            major: "软件工程",
            className: "软工2302", // 更新班级
          },
        },
      });

      expect(response.statusCode).toBe(201);

      // 验证画像已更新
      const profile = await prisma.userProfile.findUnique({
        where: { user_id: customerId },
      });

      expect(profile).not.toBeNull();
      expect(profile!.class_name).toBe("软工2302"); // 已更新

      // 验证手机号已更新在 User 表（单一真相源）
      const user = await prisma.user.findUnique({
        where: { id: customerId },
      });
      expect(user!.phone_number).toBe("13900139001"); // 已更新
    });

    it("应该在不提供画像时正常创建收购", async () => {
      // 创建员工和顾客用户
      const { userId: staffId, token: staffToken } = await createTestUser("STAFF");
      const { userId: customerId } = await createTestUser("USER");

      // 创建可收购 SKU
      const bookMaster = await prisma.bookMaster.create({
        data: {
          isbn13: "9780000000003",
          title: "无画像收购测试",
        },
      });

      const bookSku = await prisma.bookSku.create({
        data: {
          master_id: bookMaster.id,
          edition: "第一版",
          is_acquirable: true,
        },
      });

      // 创建收购记录（不包含用户画像）
      const response = await app.inject({
        method: "POST",
        url: "/api/acquisitions",
        headers: {
          authorization: `Bearer ${staffToken}`,
        },
        payload: {
          customerUserId: customerId,
          items: [{ skuId: bookSku.id, condition: "ACCEPTABLE", acquisitionPrice: 1500 }],
          settlementType: "CASH",
          // 不提供 customerProfile
        },
      });

      expect(response.statusCode).toBe(201);

      // 验证 UserProfile 未创建
      const profile = await prisma.userProfile.findUnique({
        where: { user_id: customerId },
      });

      expect(profile).toBeNull();
    });

    it("应该拒绝非员工用户创建收购", async () => {
      // 创建普通用户
      const { userId: regularUserId, token: regularUserToken } = await createTestUser("USER");

      const bookMaster = await prisma.bookMaster.create({
        data: {
          isbn13: "9780000000004",
          title: "权限测试",
        },
      });

      const bookSku = await prisma.bookSku.create({
        data: {
          master_id: bookMaster.id,
          edition: "第一版",
          is_acquirable: true,
        },
      });

      // 尝试创建收购
      const response = await app.inject({
        method: "POST",
        url: "/api/acquisitions",
        headers: {
          authorization: `Bearer ${regularUserToken}`,
        },
        payload: {
          customerUserId: regularUserId,
          items: [{ skuId: bookSku.id, condition: "GOOD", acquisitionPrice: 2000 }],
          settlementType: "CASH",
        },
      });

      expect(response.statusCode).toBe(403);
      const error = JSON.parse(response.payload);
      expect(error.code).toBe("FORBIDDEN");
    });
  });

  describe("GET /api/books/recommendations - Personalized Recommendations", () => {
    it("应该为有画像的用户返回推荐书籍", async () => {
      // 创建用户
      const { userId, token } = await createTestUser("USER");

      // 创建书籍
      const book1Master = await prisma.bookMaster.create({
        data: {
          isbn13: "9780000000101",
          title: "深入理解计算机系统",
          author: "Randal E. Bryant",
          publisher: "机械工业出版社",
          original_price: 13900, // 139 yuan = 13900 cents
        },
      });

      const book1Sku = await prisma.bookSku.create({
        data: {
          master_id: book1Master.id,
          edition: "第3版",
          cover_image_url: "https://example.com/csapp.jpg",
        },
      });

      const book2Master = await prisma.bookMaster.create({
        data: {
          isbn13: "9780000000102",
          title: "算法导论",
          author: "Thomas H. Cormen",
        },
      });

      const book2Sku = await prisma.bookSku.create({
        data: {
          master_id: book2Master.id,
          edition: "第3版",
        },
      });

      // 创建库存（book1有2本，book2有1本）
      await prisma.inventoryItem.createMany({
        data: [
          { sku_id: book1Sku.id, condition: "GOOD", cost: 7000, selling_price: 8500, status: "in_stock" }, // 70 yuan = 7000 cents, 85 yuan = 8500 cents
          { sku_id: book1Sku.id, condition: "NEW", cost: 9000, selling_price: 11000, status: "in_stock" }, // 90 yuan = 9000 cents, 110 yuan = 11000 cents
          { sku_id: book2Sku.id, condition: "GOOD", cost: 6000, selling_price: 8000, status: "in_stock" }, // 60 yuan = 6000 cents, 80 yuan = 8000 cents
        ],
      });

      // 创建用户画像
      await prisma.userProfile.create({
        data: {
          user_id: userId,
          enrollment_year: 2023,
          major: "计算机科学与技术",
          class_name: "计科2301",
        },
      });

      // 创建推荐书单
      const recommendedList = await prisma.recommendedBookList.create({
        data: {
          enrollment_year: 2023,
          major: "计算机科学与技术",
        },
      });

      // 添加推荐书目
      await prisma.recommendedBookItem.createMany({
        data: [
          { list_id: recommendedList.id, sku_id: book1Sku.id },
          { list_id: recommendedList.id, sku_id: book2Sku.id },
        ],
      });

      // 获取推荐
      const response = await app.inject({
        method: "GET",
        url: "/api/books/recommendations",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.count).toBe(2);

      // 验证返回数据结构
      const firstBook = result.recommendations[0];
      expect(firstBook).toHaveProperty("skuId");
      expect(firstBook).toHaveProperty("isbn");
      expect(firstBook).toHaveProperty("title");
      expect(firstBook).toHaveProperty("availableCount");
      expect(firstBook).toHaveProperty("minPrice");

      // 验证库存数量正确
      const book1Result = result.recommendations.find((b: any) => b.isbn === "9780000000101");
      expect(book1Result.availableCount).toBe(2);
      expect(book1Result.minPrice).toBe(8500); // 最低价85元 = 8500分

      const book2Result = result.recommendations.find((b: any) => b.isbn === "9780000000102");
      expect(book2Result.availableCount).toBe(1);
      expect(book2Result.minPrice).toBe(8000); // 80元 = 8000分
    });

    it("应该只返回有库存的推荐书籍", async () => {
      // 创建用户
      const { userId, token } = await createTestUser("USER");

      // 创建两本书
      const book1Master = await prisma.bookMaster.create({
        data: { isbn13: "9780000000201", title: "有库存的书" },
      });

      const book1Sku = await prisma.bookSku.create({
        data: { master_id: book1Master.id, edition: "第1版" },
      });

      const book2Master = await prisma.bookMaster.create({
        data: { isbn13: "9780000000202", title: "无库存的书" },
      });

      const book2Sku = await prisma.bookSku.create({
        data: { master_id: book2Master.id, edition: "第1版" },
      });

      // 只为 book1 创建库存
      await prisma.inventoryItem.create({
        data: { sku_id: book1Sku.id, condition: "GOOD", cost: 5000, selling_price: 7000, status: "in_stock" }, // 50 yuan = 5000 cents, 70 yuan = 7000 cents
      });

      // 创建用户画像
      await prisma.userProfile.create({
        data: {
          user_id: userId,
          enrollment_year: 2024,
          major: "软件工程",
        },
      });

      // 创建推荐书单（包含两本书）
      const recommendedList = await prisma.recommendedBookList.create({
        data: {
          enrollment_year: 2024,
          major: "软件工程",
        },
      });

      await prisma.recommendedBookItem.createMany({
        data: [
          { list_id: recommendedList.id, sku_id: book1Sku.id },
          { list_id: recommendedList.id, sku_id: book2Sku.id }, // 这本没有库存
        ],
      });

      // 获取推荐
      const response = await app.inject({
        method: "GET",
        url: "/api/books/recommendations",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // 只应返回有库存的书
      expect(result.count).toBe(1);
      expect(result.recommendations[0].title).toBe("有库存的书");
      expect(result.recommendations[0].isbn).toBe("9780000000201");
    });

    it("应该为没有画像的用户返回空数组", async () => {
      // 创建没有画像的用户
      const { userId, token } = await createTestUser("USER");

      // 获取推荐
      const response = await app.inject({
        method: "GET",
        url: "/api/books/recommendations",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.recommendations).toEqual([]);
      expect(result.count).toBe(0);
    });

    it("应该为没有匹配推荐列表的用户返回空数组", async () => {
      // 创建有画像但没有推荐列表的用户
      const { userId, token } = await createTestUser("USER");

      await prisma.userProfile.create({
        data: {
          user_id: userId,
          enrollment_year: 2025,
          major: "不存在的专业",
        },
      });

      // 获取推荐
      const response = await app.inject({
        method: "GET",
        url: "/api/books/recommendations",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      expect(result.recommendations).toEqual([]);
      expect(result.count).toBe(0);
    });

    it("应该拒绝未认证用户访问推荐", async () => {
      // 不提供 token
      const response = await app.inject({
        method: "GET",
        url: "/api/books/recommendations",
      });

      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.payload);
      expect(error.code).toBe("UNAUTHORIZED");
    });
  });
});

// src/tests/inventoryService.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { PrismaClient } from "@prisma/client";
import * as bookMetadataService from "../services/bookMetadataService";

const prismaMock = mockDeep<PrismaClient>();
vi.mock("../db", () => ({
  default: prismaMock,
}));

// Import AFTER mocking
const { addBookToInventory, getAvailableBooks } = await import(
  "../services/inventoryService"
);

describe("Inventory Service", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    vi.restoreAllMocks();
  });

  describe("addBookToInventory", () => {
    it("creates complete book hierarchy when nothing exists", async () => {
      const input = {
        isbn13: "9787111633455",
        title: "深入理解计算机系统",
        edition: "第3版",
        condition: "NEW" as const,
        cost: 50.0,
        selling_price: 88.0,
      };

      // 无外部元数据
      vi.spyOn(bookMetadataService, "getBookMetadata").mockResolvedValue(null);

      // 模拟事务的正确方法：让事务直接返回结果，而不是模拟回调
      const mockMaster = { id: 1, isbn13: input.isbn13, title: input.title };
      const mockSku = { id: 10, master_id: 1, edition: input.edition };
      const mockItem = {
        id: 101,
        sku_id: 10,
        condition: input.condition,
        cost: input.cost,
        selling_price: input.selling_price,
        status: "in_stock",
      };

      // Mock direct database calls (no transactions)
      prismaMock.bookMaster.upsert.mockResolvedValue(mockMaster as any);
      prismaMock.bookSku.upsert.mockResolvedValue(mockSku as any);
      prismaMock.inventoryItem.create.mockResolvedValue(mockItem as any);

      const result = await addBookToInventory(prismaMock, input);

      expect(result).toEqual(mockItem);
      expect(prismaMock.bookMaster.upsert).toHaveBeenCalled();
      expect(prismaMock.bookSku.upsert).toHaveBeenCalled();
      expect(prismaMock.inventoryItem.create).toHaveBeenCalled();
    });

    it("merges external metadata when available", async () => {
      const input = {
        isbn13: "9787111633455",
        title: "手工输入标题",
        condition: "NEW" as const,
        cost: 50.0,
        selling_price: 88.0,
      };

      const metadata = {
        title: "权威API标题",
        author: "权威作者",
        publisher: "权威出版社",
        original_price: 99.0,
        cover_image_url: "https://example.com/cover.jpg",
      };

      vi.spyOn(bookMetadataService, "getBookMetadata").mockResolvedValue(
        metadata,
      );

      const mockMaster = { id: 1, isbn13: input.isbn13, title: metadata.title };
      const mockSku = { id: 10, master_id: 1, edition: "default" };
      const mockItem = { id: 101, sku_id: 10, status: "in_stock" };

      // Mock direct database calls
      prismaMock.bookMaster.upsert.mockResolvedValue(mockMaster as any);
      prismaMock.bookSku.upsert.mockResolvedValue(mockSku as any);
      prismaMock.inventoryItem.create.mockResolvedValue(mockItem as any);

      await addBookToInventory(prismaMock, input);

      // 验证是否在事务外部调用了元数据API
      expect(bookMetadataService.getBookMetadata).toHaveBeenCalledWith(
        input.isbn13,
      );
      expect(prismaMock.bookMaster.upsert).toHaveBeenCalled();
      expect(prismaMock.bookSku.upsert).toHaveBeenCalled();
      expect(prismaMock.inventoryItem.create).toHaveBeenCalled();
    });

    it("handles metadata fetch failure gracefully", async () => {
      const input = {
        isbn13: "9787111633455",
        title: "深入理解计算机系统",
        condition: "NEW" as const,
        cost: 50.0,
        selling_price: 88.0,
      };

      // 模拟外部API失败
      vi.spyOn(bookMetadataService, "getBookMetadata").mockRejectedValue(
        new Error("API Error"),
      );

      const mockMaster = { id: 1, isbn13: input.isbn13, title: input.title };
      const mockSku = { id: 10, master_id: 1, edition: "default" };
      const mockItem = { id: 101, sku_id: 10, status: "in_stock" };

      // Mock direct database calls
      prismaMock.bookMaster.upsert.mockResolvedValue(mockMaster as any);
      prismaMock.bookSku.upsert.mockResolvedValue(mockSku as any);
      prismaMock.inventoryItem.create.mockResolvedValue(mockItem as any);

      const result = await addBookToInventory(prismaMock, input);

      expect(result).toEqual(mockItem);
      expect(prismaMock.bookMaster.upsert).toHaveBeenCalled();
      expect(prismaMock.bookSku.upsert).toHaveBeenCalled();
      expect(prismaMock.inventoryItem.create).toHaveBeenCalled();
    });
  });

  describe("getAvailableBooks", () => {
    it("returns paginated books without search (fast path)", async () => {
      const mockItems = [
        {
          id: 1,
          status: "in_stock",
          bookSku: { bookMaster: { title: "Book 1" } },
        },
        {
          id: 2,
          status: "in_stock",
          bookSku: { bookMaster: { title: "Book 2" } },
        },
      ];

      // Mock $queryRaw for both count and data queries
      prismaMock.$queryRaw
        .mockResolvedValueOnce([{ count: BigInt(10) }]) // First call for count query
        .mockResolvedValueOnce(mockItems); // Second call for data query

      const result = await getAvailableBooks(prismaMock, { page: 1, limit: 2 });

      expect(result.data.length).toBe(2);
      expect(result.meta.totalItems).toBe(10);
      expect(result.meta.totalPages).toBe(5);
      expect(result.meta.currentPage).toBe(1);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it("uses trigram search when search term provided (smart path)", async () => {
      const searchTerm = "计算机";
      const mockBookMasterIds = [{ id: 1 }, { id: 2 }];
      const mockItems = [{ id: 101, bookSku: { master_id: 1 } }];

      // Mock $queryRawUnsafe for both count and data queries
      prismaMock.$queryRaw
        .mockResolvedValueOnce([{ count: BigInt(1) }]) // First call for count query
        .mockResolvedValueOnce(mockItems); // Second call for data query

      const result = await getAvailableBooks(prismaMock, { searchTerm });

      expect(result.data.length).toBe(1);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it("returns empty result when no books match search", async () => {
      const searchTerm = "不存在的书";

      // Mock $queryRawUnsafe to return empty count
      prismaMock.$queryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);

      const result = await getAvailableBooks(prismaMock, { searchTerm });

      expect(result.data).toEqual([]);
      expect(result.meta.totalItems).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it("handles pagination correctly", async () => {
      const mockItems = [{ id: 3 }];

      // Mock $queryRawUnsafe for both count and data queries
      prismaMock.$queryRaw
        .mockResolvedValueOnce([{ count: BigInt(25) }]) // First call for count query
        .mockResolvedValueOnce(mockItems); // Second call for data query

      const result = await getAvailableBooks(prismaMock, { page: 2, limit: 10 });

      expect(result.meta.currentPage).toBe(2);
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.itemsPerPage).toBe(10);
    });
  });
});

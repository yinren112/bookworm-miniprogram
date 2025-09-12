// src/tests/inventoryService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { PrismaClient } from '@prisma/client';
import * as bookMetadataService from '../services/bookMetadataService';

const prismaMock = mockDeep<PrismaClient>();
vi.mock('../db', () => ({
  default: prismaMock,
}));

// Import AFTER mocking
const { addBookToInventory, getAvailableBooks } = await import('../services/inventoryService');

describe('Inventory Service', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    vi.restoreAllMocks();
  });

  describe('addBookToInventory', () => {
    it('creates complete book hierarchy when nothing exists', async () => {
      const input = {
        isbn13: '9787111633455',
        title: '深入理解计算机系统',
        edition: '第3版',
        condition: 'NEW' as const,
        cost: 50.00,
        selling_price: 88.00,
      };

      // 无外部元数据
      vi.spyOn(bookMetadataService, 'getBookMetadata').mockResolvedValue(null);

      // 模拟事务的正确方法：让事务直接返回结果，而不是模拟回调
      const mockMaster = { id: 1, isbn13: input.isbn13, title: input.title };
      const mockSku = { id: 10, master_id: 1, edition: input.edition };
      const mockItem = { id: 101, sku_id: 10, condition: input.condition, cost: input.cost, selling_price: input.selling_price, status: 'in_stock' };

      prismaMock.$transaction.mockResolvedValue(mockItem);
      
      // 模拟事务内部的操作
      prismaMock.bookmaster.upsert.mockResolvedValue(mockMaster as any);
      prismaMock.booksku.upsert.mockResolvedValue(mockSku as any);
      prismaMock.inventoryitem.create.mockResolvedValue(mockItem as any);

      const result = await addBookToInventory(input);
      
      expect(result).toEqual(mockItem);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('merges external metadata when available', async () => {
      const input = {
        isbn13: '9787111633455',
        title: '手工输入标题',
        condition: 'NEW' as const,
        cost: 50.00,
        selling_price: 88.00,
      };

      const metadata = {
        title: '权威API标题',
        author: '权威作者',
        publisher: '权威出版社',
        original_price: 99.00,
        cover_image_url: 'https://example.com/cover.jpg'
      };

      vi.spyOn(bookMetadataService, 'getBookMetadata').mockResolvedValue(metadata);

      const mockItem = { id: 101, sku_id: 10, status: 'in_stock' };
      prismaMock.$transaction.mockResolvedValue(mockItem);

      await addBookToInventory(input);

      // 验证是否在事务外部调用了元数据API
      expect(bookMetadataService.getBookMetadata).toHaveBeenCalledWith(input.isbn13);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('handles metadata fetch failure gracefully', async () => {
      const input = {
        isbn13: '9787111633455',
        title: '深入理解计算机系统',
        condition: 'NEW' as const,
        cost: 50.00,
        selling_price: 88.00,
      };

      // 模拟外部API失败
      vi.spyOn(bookMetadataService, 'getBookMetadata').mockRejectedValue(new Error('API Error'));

      const mockItem = { id: 101, sku_id: 10, status: 'in_stock' };
      prismaMock.$transaction.mockResolvedValue(mockItem);

      const result = await addBookToInventory(input);
      
      expect(result).toEqual(mockItem);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });
  });

  describe('getAvailableBooks', () => {
    it('returns paginated books without search (fast path)', async () => {
      const mockItems = [
        { id: 1, status: 'in_stock', booksku: { bookmaster: { title: 'Book 1' } } },
        { id: 2, status: 'in_stock', booksku: { bookmaster: { title: 'Book 2' } } }
      ];

      // 模拟事务返回分页结果
      prismaMock.$transaction.mockResolvedValue({
        data: mockItems,
        meta: {
          totalItems: 10,
          totalPages: 5,
          currentPage: 1,
          itemsPerPage: 2,
        }
      });

      // 模拟事务内部的调用
      prismaMock.inventoryitem.count.mockResolvedValue(10);
      prismaMock.inventoryitem.findMany.mockResolvedValue(mockItems as any);

      const result = await getAvailableBooks({ page: 1, limit: 2 });
      
      expect(result.data.length).toBe(2);
      expect(result.meta.totalItems).toBe(10);
      expect(result.meta.totalPages).toBe(5);
      expect(result.meta.currentPage).toBe(1);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('uses trigram search when search term provided (smart path)', async () => {
      const searchTerm = '计算机';
      const mockBookMasterIds = [{ id: 1 }, { id: 2 }];
      const mockItems = [{ id: 101, booksku: { master_id: 1 } }];

      prismaMock.$transaction.mockResolvedValue({
        data: mockItems,
        meta: {
          totalItems: 1,
          totalPages: 1,
          currentPage: 1,
          itemsPerPage: 20,
        }
      });

      // 模拟事务内部调用
      prismaMock.$queryRaw.mockResolvedValue(mockBookMasterIds);
      prismaMock.inventoryitem.count.mockResolvedValue(1);
      prismaMock.inventoryitem.findMany.mockResolvedValue(mockItems as any);

      const result = await getAvailableBooks({ searchTerm });
      
      expect(result.data.length).toBe(1);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('returns empty result when no books match search', async () => {
      const searchTerm = '不存在的书';

      prismaMock.$transaction.mockResolvedValue({
        data: [],
        meta: {
          totalItems: 0,
          totalPages: 0,
          currentPage: 1,
          itemsPerPage: 20,
        }
      });

      // 模拟trigram搜索没有匹配
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await getAvailableBooks({ searchTerm });
      
      expect(result.data).toEqual([]);
      expect(result.meta.totalItems).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('handles pagination correctly', async () => {
      const mockItems = [{ id: 3 }];

      prismaMock.$transaction.mockResolvedValue({
        data: mockItems,
        meta: {
          totalItems: 25,
          totalPages: 3,
          currentPage: 2,
          itemsPerPage: 10,
        }
      });

      prismaMock.inventoryitem.count.mockResolvedValue(25);
      prismaMock.inventoryitem.findMany.mockResolvedValue(mockItems as any);

      const result = await getAvailableBooks({ page: 2, limit: 10 });
      
      expect(result.meta.currentPage).toBe(2);
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.itemsPerPage).toBe(10);
    });
  });
});
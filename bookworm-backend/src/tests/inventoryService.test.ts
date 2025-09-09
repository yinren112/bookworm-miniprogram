// src/tests/inventoryService.test.ts
import { describe, it, expect } from 'vitest';
import { addBookToInventory, getAvailableBooks, getBookById, getBookMetadata } from '../services/inventoryService';
import { prismaMock } from './setup';

describe('Inventory Service', () => {
  describe('addBookToInventory', () => {
    it('should add a new book to inventory, creating master and sku records', async () => {
      const input = {
        isbn13: '1234567890123',
        title: 'Test Book',
        author: 'Test Author',
        condition: 'A' as const,
        cost: 10,
        selling_price: 20,
      };

      // Mock the database responses
      const mockBookMaster = { 
        id: 1, 
        isbn13: input.isbn13, 
        title: input.title, 
        author: input.author,
        publisher: null,
        original_price: null,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const mockBookSku = { 
        id: 1, 
        master_id: 1, 
        edition: 'default',
        description: null,
        cover_image_url: null,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const mockInventoryItem = { 
        id: 1, 
        sku_id: 1, 
        condition: input.condition, 
        cost: input.cost,
        selling_price: input.selling_price,
        status: 'in_stock' as const,
        created_at: new Date(),
        updated_at: new Date()
      };

      // Mock the transaction
      const mockTransaction = {
        bookmaster: {
          upsert: vi.fn().mockResolvedValue(mockBookMaster),
        },
        booksku: {
          upsert: vi.fn().mockResolvedValue(mockBookSku),
        },
        inventoryitem: {
          create: vi.fn().mockResolvedValue(mockInventoryItem),
        },
      };

      prismaMock.$transaction.mockImplementation((fn) => fn(mockTransaction as any));

      const result = await addBookToInventory(input);

      // Assert that the correct functions were called
      expect(mockTransaction.bookmaster.upsert).toHaveBeenCalledWith({
        where: { isbn13: input.isbn13 },
        update: {},
        create: {
          isbn13: input.isbn13,
          title: input.title,
          author: input.author,
        },
      });

      expect(mockTransaction.booksku.upsert).toHaveBeenCalledWith({
        where: { master_id_edition: { master_id: 1, edition: 'default' } },
        update: {},
        create: { master_id: 1, edition: 'default' },
      });

      expect(mockTransaction.inventoryitem.create).toHaveBeenCalledWith({
        data: {
          sku_id: 1,
          condition: input.condition,
          cost: input.cost,
          selling_price: input.selling_price,
          status: 'in_stock',
        },
      });

      expect(result).toEqual(mockInventoryItem);
    });
  });

  describe('getAvailableBooks', () => {
    it('should get all available books when no search term provided', async () => {
      const mockBook = {
        id: 1,
        sku_id: 1,
        condition: 'A' as const,
        cost: 10,
        selling_price: 20,
        status: 'in_stock' as const,
        created_at: new Date(),
        updated_at: new Date(),
        booksku: {
          id: 1,
          master_id: 1,
          edition: 'default',
          description: null,
          cover_image_url: null,
          created_at: new Date(),
          updated_at: new Date(),
          bookmaster: {
            id: 1,
            isbn13: '1234567890123',
            title: 'Test Book',
            author: 'Test Author',
            publisher: null,
            original_price: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        },
      };

      prismaMock.inventoryitem.findMany.mockResolvedValue([mockBook]);

      const books = await getAvailableBooks();

      expect(prismaMock.inventoryitem.findMany).toHaveBeenCalledWith({
        where: { status: 'in_stock' },
        include: {
          booksku: {
            include: {
              bookmaster: true,
            },
          },
        },
      });
      expect(books).toHaveLength(1);
      expect(books[0]).toEqual(mockBook);
    });

    it('should filter books by search term', async () => {
      const mockBook = {
        id: 1,
        sku_id: 1,
        condition: 'A' as const,
        cost: 10,
        selling_price: 20,
        status: 'in_stock' as const,
        created_at: new Date(),
        updated_at: new Date(),
        booksku: {
          id: 1,
          master_id: 1,
          edition: 'default',
          description: null,
          cover_image_url: null,
          created_at: new Date(),
          updated_at: new Date(),
          bookmaster: {
            id: 1,
            isbn13: '1234567890123',
            title: 'Test Book',
            author: 'Test Author',
            publisher: null,
            original_price: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        },
      };

      prismaMock.inventoryitem.findMany.mockResolvedValue([mockBook]);

      const books = await getAvailableBooks('Test');

      expect(prismaMock.inventoryitem.findMany).toHaveBeenCalledWith({
        where: {
          status: 'in_stock',
          booksku: {
            bookmaster: {
              OR: [
                { title: { contains: 'Test', mode: 'insensitive' } },
                { author: { contains: 'Test', mode: 'insensitive' } },
                { isbn13: { contains: 'Test' } },
              ],
            },
          },
        },
        include: {
          booksku: {
            include: {
              bookmaster: true,
            },
          },
        },
      });
      expect(books).toHaveLength(1);
    });
  });

  describe('getBookById', () => {
    it('should get a book by its inventory item ID', async () => {
      const mockBook = {
        id: 1,
        sku_id: 1,
        condition: 'A' as const,
        cost: 10,
        selling_price: 20,
        status: 'in_stock' as const,
        created_at: new Date(),
        updated_at: new Date(),
        booksku: {
          id: 1,
          master_id: 1,
          edition: 'default',
          description: null,
          cover_image_url: null,
          created_at: new Date(),
          updated_at: new Date(),
          bookmaster: {
            id: 1,
            isbn13: '1234567890123',
            title: 'Test Book',
            author: 'Test Author',
            publisher: null,
            original_price: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        },
      };

      prismaMock.inventoryitem.findUnique.mockResolvedValue(mockBook);

      const book = await getBookById(1);

      expect(prismaMock.inventoryitem.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          booksku: {
            include: {
              bookmaster: true,
            },
          },
        },
      });
      expect(book).toEqual(mockBook);
    });

    it('should return null when book not found', async () => {
      prismaMock.inventoryitem.findUnique.mockResolvedValue(null);

      const book = await getBookById(999);

      expect(book).toBeNull();
    });
  });

  describe('getBookMetadata', () => {
    it('should return metadata for existing book', async () => {
      const mockBookMaster = {
        id: 1,
        isbn13: '1234567890123',
        title: 'Test Book',
        author: 'Test Author',
        publisher: 'Test Publisher',
        original_price: 25.99,
        created_at: new Date(),
        updated_at: new Date(),
        booksku: [{
          id: 1,
          master_id: 1,
          edition: 'default',
          description: null,
          cover_image_url: 'http://example.com/cover.jpg',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      };

      prismaMock.bookmaster.findUnique.mockResolvedValue(mockBookMaster);

      const metadata = await getBookMetadata('1234567890123');

      expect(prismaMock.bookmaster.findUnique).toHaveBeenCalledWith({
        where: { isbn13: '1234567890123' },
        include: { booksku: true },
      });

      expect(metadata).toEqual({
        isbn13: '1234567890123',
        title: 'Test Book',
        author: 'Test Author',
        publisher: 'Test Publisher',
        original_price: 25.99,
        cover_image_url: 'http://example.com/cover.jpg',
      });
    });

    it('should return null for non-existing book', async () => {
      prismaMock.bookmaster.findUnique.mockResolvedValue(null);

      const metadata = await getBookMetadata('9999999999999');

      expect(metadata).toBeNull();
    });
  });
});
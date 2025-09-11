// src/services/inventoryService.ts (fully replaced)
import { Prisma, book_condition } from '@prisma/client';
import prisma from '../db';
import { getBookMetadata } from './bookMetadataService';

interface AddBookInput {
  isbn13: string;
  title: string;
  author?: string;
  edition?: string;
  condition: book_condition;
  cost: number;
  selling_price: number;
}

export async function addBookToInventory(input: AddBookInput) {
  // Fetch external metadata BEFORE the transaction to avoid locking the database
  const metadata = await getBookMetadata(input.isbn13).catch(() => null);
  
  return prisma.$transaction(async (tx) => {
    // Step 1: Find or create the master book record (based on ISBN).
    // Use metadata if available, otherwise use input data (manual entry)
    const bookMaster = await tx.bookmaster.upsert({
      where: { isbn13: input.isbn13 },
      update: {
        // If metadata is available, update title/author/publisher
        ...(metadata && {
          title: metadata.title,
          author: metadata.author,
          publisher: metadata.publisher,
          original_price: metadata.original_price,
        }),
      }, 
      create: {
        isbn13: input.isbn13,
        // Use metadata or fall back to input
        title: metadata?.title || input.title, 
        author: metadata?.author || input.author,
        publisher: metadata?.publisher,
        original_price: metadata?.original_price,
      },
    });

    // Step 2: Find or create the specific SKU (e.g., '2nd Edition').
    // This represents a specific version of the master book.
    const bookSku = await tx.booksku.upsert({
      where: {
        master_id_edition: {
          master_id: bookMaster.id,
          edition: input.edition || "default",
        },
      },
      update: {
        // If metadata is available, update cover image URL
        ...(metadata && {
          cover_image_url: metadata.cover_image_url,
        }),
      },
      create: {
        master_id: bookMaster.id,
        edition: input.edition || "default",
        cover_image_url: metadata?.cover_image_url, // Use metadata cover image
      },
    });

    // Step 3: Create the actual inventory item.
    // This represents the physical copy we have in stock.
    const inventoryItem = await tx.inventoryitem.create({
      data: {
        sku_id: bookSku.id,
        condition: input.condition,
        cost: input.cost,
        selling_price: input.selling_price,
        status: "in_stock",
      },
    });

    return inventoryItem;
  });
}

// OPTIMIZED: getAvailableBooks with pg_trgm-powered search
export async function getAvailableBooks(options: { searchTerm?: string; page?: number; limit?: number } = {}) {
  const { searchTerm, page = 1, limit = 20 } = options;
  
  // Calculate pagination parameters
  const take = limit;
  const skip = (page - 1) * limit;
  
  return prisma.$transaction(async (tx) => {
    let whereCondition: Prisma.inventoryitemWhereInput = {
      status: 'in_stock',
    };
    
    // Linus式分离：搜索和非搜索是两个完全不同的数据流
    if (!searchTerm) {
      // 快路径：无搜索，直接使用高效索引查询
      const totalCount = await tx.inventoryitem.count({
        where: whereCondition,
      });

      const inventoryItems = await tx.inventoryitem.findMany({
        where: whereCondition,
        include: {
          booksku: {
            include: {
              bookmaster: true,
            },
          },
        },
        skip,
        take,
      });

      return {
        data: inventoryItems,
        meta: {
          totalItems: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: page,
          itemsPerPage: limit,
        },
      };
    }
    
    // 智能路径：使用pg_trgm进行高质量搜索
    
    // 第一步：用trigram索引快速找到相关的bookmaster ID
    // 使用更低的阈值以支持中文搜索 (中文trigram相似度通常较低)
    const similarBookMasterIds = await tx.$queryRaw<[{ id: number }]>`
      SELECT id FROM "bookmaster"
      WHERE similarity((title || ' ' || COALESCE(author, '')), ${searchTerm}) > 0.05
      ORDER BY similarity((title || ' ' || COALESCE(author, '')), ${searchTerm}) DESC
      LIMIT 100
    `;
    
    const bookMasterIds = similarBookMasterIds.map(b => b.id);
    
    // 如果没找到匹配的书籍，返回空结果
    if (bookMasterIds.length === 0) {
      return {
        data: [],
        meta: {
          totalItems: 0,
          totalPages: 0,
          currentPage: page,
          itemsPerPage: limit,
        },
      };
    }
    
    // 第二步：基于找到的bookmaster ID进行库存查询
    whereCondition.booksku = {
      master_id: { in: bookMasterIds },
    };
    
    const totalCount = await tx.inventoryitem.count({
      where: whereCondition,
    });

    const inventoryItems = await tx.inventoryitem.findMany({
      where: whereCondition,
      include: {
        booksku: {
          include: {
            bookmaster: true,
          },
        },
      },
      skip,
      take,
    });

    return {
      data: inventoryItems,
      meta: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    };
  });
}

// NEW: Function to get a single book by its inventory item ID
export async function getBookById(id: number) {
  return prisma.inventoryitem.findUnique({
    where: { id },
    include: {
      booksku: {
        include: {
          bookmaster: true,
        },
      },
    },
  });
}


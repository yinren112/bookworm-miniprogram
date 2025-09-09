// src/services/inventoryService.ts (fully replaced)
import { Prisma, book_condition } from '@prisma/client';
import prisma from '../db';

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
  return prisma.$transaction(async (tx) => {
    // Step 1: Find or create the master book record (based on ISBN).
    // This represents the abstract concept of the book.
    const bookMaster = await tx.bookmaster.upsert({
      where: { isbn13: input.isbn13 },
      update: {}, // No updates needed if it exists
      create: {
        isbn13: input.isbn13,
        title: input.title,
        author: input.author,
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
      update: {}, // No updates needed if it exists
      create: {
        master_id: bookMaster.id,
        edition: input.edition || "default",
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

// MODIFIED: getAvailableBooks now accepts an optional search term
export async function getAvailableBooks(searchTerm?: string) {
  const whereCondition: Prisma.inventoryitemWhereInput = {
    status: 'in_stock',
  };

  if (searchTerm) {
    whereCondition.booksku = {
      bookmaster: {
        OR: [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { author: { contains: searchTerm, mode: 'insensitive' } },
          { isbn13: { contains: searchTerm } },
        ],
      },
    };
  }

  return prisma.inventoryitem.findMany({
    where: whereCondition,
    include: {
      booksku: {
        include: {
          bookmaster: true,
        },
      },
    },
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

// NEW: Function to get book metadata by ISBN
export async function getBookMetadata(isbn: string) {
  // First check if we have the book in our database
  const existingBook = await prisma.bookmaster.findUnique({
    where: { isbn13: isbn },
    include: {
      booksku: true,
    },
  });

  if (existingBook) {
    return {
      isbn13: existingBook.isbn13,
      title: existingBook.title,
      author: existingBook.author,
      publisher: existingBook.publisher,
      original_price: existingBook.original_price ? Number(existingBook.original_price) : null,
      cover_image_url: existingBook.booksku[0]?.cover_image_url || null,
    };
  }

  // If not found locally, we could integrate with external APIs here
  // For now, return null to indicate not found
  return null;
}
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


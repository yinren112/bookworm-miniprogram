// src/services/inventoryService.ts (fully replaced)
import { Prisma, book_condition } from '@prisma/client';
import prisma from '../db';

// ... (addBookToInventory function is unchanged)
interface AddBookInput { isbn13: string; title: string; author?: string; edition?: string; condition: book_condition; cost: number; selling_price: number; }
export async function addBookToInventory(input: AddBookInput) { /* ... same as before ... */ return prisma.$transaction(async(tx)=>{let a=await tx.bookmaster.upsert({where:{isbn13:input.isbn13},update:{},create:{isbn13:input.isbn13,title:input.title,author:input.author}});let b=await tx.booksku.upsert({where:{master_id_edition:{master_id:a.id,edition:input.edition||"default"}},update:{},create:{master_id:a.id,edition:input.edition||"default"}});const c=await tx.inventoryitem.create({data:{sku_id:b.id,condition:input.condition,cost:input.cost,selling_price:input.selling_price,status:"in_stock"}});return c})}

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
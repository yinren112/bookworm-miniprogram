// src/services/inventoryService.ts (fully replaced)
import { Prisma, PrismaClient, book_condition } from "@prisma/client";
import { getBookMetadata } from "./bookMetadataService";
import { DEFAULT_VALUES, INVENTORY_STATUS } from "../constants";

type DbCtx = PrismaClient | Prisma.TransactionClient;
type BookMetadata = Awaited<ReturnType<typeof getBookMetadata>>;

interface AddBookInput {
  isbn13: string;
  title: string;
  author?: string;
  edition?: string;
  condition: book_condition;
  cost: number;
  selling_price: number;
}

/**
 * Escapes special LIKE wildcard characters (%, _) in user input to treat them literally.
 * @param searchTerm - The user input to escape
 * @param escapeChar - The escape character to use (default: backslash)
 * @returns The escaped string safe for use in ILIKE patterns
 */
function escapeLike(searchTerm: string, escapeChar = '\\'): string {
  return searchTerm.replace(new RegExp(`[${escapeChar}%_]`, 'g'), (char) => escapeChar + char);
}

export async function persistInventoryItem(dbCtx: DbCtx, input: AddBookInput, metadata: BookMetadata | null) {
  const bookMaster = await dbCtx.bookMaster.upsert({
    where: { isbn13: input.isbn13 },
    update: {
      ...(metadata && {
        title: metadata.title,
        author: metadata.author,
        publisher: metadata.publisher,
        original_price: metadata.original_price,
      }),
    },
    create: {
      isbn13: input.isbn13,
      title: metadata?.title || input.title,
      author: metadata?.author || input.author,
      publisher: metadata?.publisher,
      original_price: metadata?.original_price,
    },
  });

  const bookSku = await dbCtx.bookSku.upsert({
    where: {
      master_id_edition: {
        master_id: bookMaster.id,
        edition: input.edition || DEFAULT_VALUES.EDITION,
      },
    },
    update: {
      ...(metadata && {
        cover_image_url: metadata.cover_image_url,
      }),
    },
    create: {
      master_id: bookMaster.id,
      edition: input.edition || DEFAULT_VALUES.EDITION,
      cover_image_url: metadata?.cover_image_url,
    },
  });

  return dbCtx.inventoryItem.create({
    data: {
      sku_id: bookSku.id,
      condition: input.condition,
      cost: input.cost,
      selling_price: input.selling_price,
      status: INVENTORY_STATUS.IN_STOCK,
    },
  });
}

export async function addBookToInventory(prisma: PrismaClient, input: AddBookInput, metadata?: BookMetadata | null) {
  let resolvedMetadata: BookMetadata | null = null;
  if (metadata !== undefined) {
    resolvedMetadata = metadata;
  } else {
    resolvedMetadata = await getBookMetadata(input.isbn13).catch(() => null);
  }

  return prisma.$transaction((tx) => persistInventoryItem(tx, input, resolvedMetadata));
}

// FIXED: getAvailableBooks using Prisma.sql template tags for safe parameterization
export async function getAvailableBooks(
  prisma: PrismaClient,
  options: { searchTerm?: string; page?: number; limit?: number } = {},
) {
  const { searchTerm, page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  // --- Base query parts, safe from injection ---
  const selectClause = Prisma.sql`
    SELECT
      i.id, i.condition, i.selling_price, i.status,
      json_build_object(
        'id', s.id,
        'edition', s.edition,
        'cover_image_url', s.cover_image_url,
        'bookmaster', json_build_object(
          'id', m.id,
          'isbn13', m.isbn13,
          'title', m.title,
          'author', m.author,
          'publisher', m.publisher,
          'original_price', m.original_price
        )
      ) as booksku
    FROM "inventoryitem" i
    JOIN "booksku" s ON i.sku_id = s.id
    JOIN "bookmaster" m ON s.master_id = m.id
  `;
  const fromAndJoinClause = Prisma.sql`
    FROM "inventoryitem" i
    JOIN "booksku" s ON i.sku_id = s.id
    JOIN "bookmaster" m ON s.master_id = m.id
  `;

  // --- Dynamic WHERE and ORDER BY clauses ---
  const whereConditions: Prisma.Sql[] = [Prisma.sql`i.status = 'in_stock'`];
  let orderByClause = Prisma.sql`ORDER BY i.created_at DESC`;

  if (searchTerm && searchTerm.trim()) {
    const trimmedSearchTerm = searchTerm.trim();
    // Escape special LIKE characters to treat them literally
    const escapedSearchTerm = escapeLike(trimmedSearchTerm);
    // Prisma.sql automatically handles parameterization, and we add ESCAPE clause
    whereConditions.push(Prisma.sql`(m.title ILIKE ${'%' + escapedSearchTerm + '%'} ESCAPE '\\' OR m.author ILIKE ${'%' + escapedSearchTerm + '%'} ESCAPE '\\')`);
    orderByClause = Prisma.sql`ORDER BY i.created_at DESC`;
  }

  const whereClause = Prisma.join(whereConditions, ' AND ');

  // --- Build and execute the queries ---
  const countQuery = Prisma.sql`SELECT COUNT(i.id) as "count" ${fromAndJoinClause} WHERE ${whereClause}`;
  const dataQuery = Prisma.sql`${selectClause} WHERE ${whereClause} ${orderByClause} LIMIT ${limit} OFFSET ${skip}`;

  const [totalResult, items] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>(countQuery),
    prisma.$queryRaw<any[]>(dataQuery),
  ]);

  const totalItems = (totalResult && totalResult.length > 0) ? Number(totalResult[0].count) : 0;

  return {
    data: items || [],
    meta: {
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
      itemsPerPage: limit,
    },
  };
}

// NEW: Function to get a single book by its inventory item ID
export async function getBookById(prisma: PrismaClient | Prisma.TransactionClient, id: number) {
  return prisma.inventoryItem.findUnique({
    where: { id },
    select: {
      id: true,
      condition: true,
      selling_price: true,
      status: true,
      bookSku: {
        select: {
          id: true,
          edition: true,
          cover_image_url: true,
          bookMaster: {
            select: {
              id: true,
              isbn13: true,
              title: true,
              author: true,
              publisher: true,
              original_price: true,
            },
          },
        },
      },
    },
  });
}

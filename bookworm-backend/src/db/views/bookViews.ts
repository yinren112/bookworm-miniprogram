// src/db/views/bookViews.ts
// Centralized Book model data access selectors

import type { Prisma } from '@prisma/client';

/**
 * Book metadata for listings
 * Used by: book search, inventory displays
 */
export const bookMasterView = {
  title: true,
  author: true,
  isbn13: true,
  publisher: true,
  original_price: true,
} as const satisfies Prisma.BookMasterSelect;

/**
 * Book SKU with master info
 * Used by: acquisition checks, SKU management
 */
export const bookSkuWithMasterInclude = {
  bookMaster: {
    select: {
      title: true,
      author: true,
      original_price: true,
    },
  },
} as const satisfies Prisma.BookSkuInclude;

/**
 * Full book detail for search results
 * Used by: GET /api/books/search
 */
export const bookDetailView = {
  id: true,
  edition: true,
  description: true,
  cover_image_url: true,
  is_acquirable: true,
  master_id: true,
} as const satisfies Prisma.BookSkuSelect;

/**
 * BookSku with master and inventory for recommendations
 * Used by: getRecommendedBooks
 */
export const bookSkuRecommendationInclude = {
  bookMaster: {
    select: {
      isbn13: true,
      title: true,
      author: true,
      publisher: true,
      original_price: true,
    },
  },
  inventoryItems: {
    where: { status: 'in_stock' },
    select: {
      id: true,
      condition: true,
      selling_price: true,
    },
  },
} as const satisfies Prisma.BookSkuInclude;

/**
 * UserProfile for recommendation matching
 * Used by: getRecommendedBooks
 */
export const userProfileRecommendationView = {
  enrollment_year: true,
  major: true,
} as const satisfies Prisma.UserProfileSelect;

/**
 * RecommendedBookList with SKU IDs
 * Used by: getRecommendedBooks
 */
export const recommendedBookListView = {
  id: true,
  items: {
    select: {
      sku_id: true,
    },
  },
} as const satisfies Prisma.RecommendedBookListSelect;

import { PrismaClient } from "@prisma/client";

export interface RecommendedBookResult {
  skuId: number;
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  originalPrice: number | null; // 单位：分
  edition: string | null;
  coverImageUrl: string | null;
  availableCount: number; // 当前有库存的数量
  minPrice: number; // 最低售价，单位：分
}

/**
 * 根据用户画像获取推荐书籍列表
 *
 * 性能优化：使用单个查询获取所有数据，包含 JOIN
 *
 * @param dbCtx - Prisma client
 * @param userId - 用户ID
 * @returns 推荐书籍列表，按书名排序
 */
export async function getRecommendedBooks(
  dbCtx: PrismaClient,
  userId: number
): Promise<RecommendedBookResult[]> {
  // Step 1: 获取用户画像
  const userProfile = await dbCtx.userProfile.findUnique({
    where: { user_id: userId },
    select: {
      enrollment_year: true,
      major: true,
    },
  });

  // 如果用户没有画像信息，返回空数组
  if (!userProfile || !userProfile.enrollment_year || !userProfile.major) {
    return [];
  }

  // Step 2: 查找推荐书单
  const recommendedList = await dbCtx.recommendedBookList.findUnique({
    where: {
      enrollment_year_major: {
        enrollment_year: userProfile.enrollment_year,
        major: userProfile.major,
      },
    },
    select: {
      id: true,
      items: {
        select: {
          sku_id: true,
        },
      },
    },
  });

  // 如果没有找到对应的推荐列表，返回空数组
  if (!recommendedList || recommendedList.items.length === 0) {
    return [];
  }

  const skuIds = recommendedList.items.map((item) => item.sku_id);

  // Step 3: 获取每个 SKU 的库存和书籍信息
  // 使用单个查询获取所有数据，包含 JOIN
  const skusWithInventory = await dbCtx.bookSku.findMany({
    where: {
      id: { in: skuIds },
    },
    include: {
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
        where: {
          status: "in_stock",
        },
        select: {
          id: true,
          selling_price: true,
        },
      },
    },
    orderBy: {
      bookMaster: {
        title: "asc",
      },
    },
  });

  // Step 4: 转换为返回格式
  const results: RecommendedBookResult[] = [];

  for (const sku of skusWithInventory) {
    // 只返回有库存的书籍
    if (sku.inventoryItems.length === 0) {
      continue;
    }

    // 计算最低售价（单位：分）
    // selling_price 已经是整数"分"，不需要转换
    const minPriceInCents = Math.min(...sku.inventoryItems.map((item) => Number(item.selling_price)));

    results.push({
      skuId: sku.id,
      isbn: sku.bookMaster.isbn13,
      title: sku.bookMaster.title,
      author: sku.bookMaster.author,
      publisher: sku.bookMaster.publisher,
      originalPrice: sku.bookMaster.original_price ? Number(sku.bookMaster.original_price) : null, // 已经是分
      edition: sku.edition,
      coverImageUrl: sku.cover_image_url,
      availableCount: sku.inventoryItems.length,
      minPrice: minPriceInCents,
    });
  }

  return results;
}

/**
 * 获取用户画像信息
 *
 * @param dbCtx - Prisma client
 * @param userId - 用户ID
 * @returns 用户画像，如果不存在返回 null
 */
export async function getUserProfile(dbCtx: PrismaClient, userId: number) {
  return dbCtx.userProfile.findUnique({
    where: { user_id: userId },
  });
}

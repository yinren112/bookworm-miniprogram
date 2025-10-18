import { Prisma } from "@prisma/client";

const bookMasterSelectPublic = Prisma.validator<Prisma.BookMasterSelect>()({
  id: true,
  isbn13: true,
  title: true,
  author: true,
  publisher: true,
  original_price: true,
});

const bookSkuSelectPublic = Prisma.validator<Prisma.BookSkuSelect>()({
  id: true,
  edition: true,
  cover_image_url: true,
  bookMaster: {
    select: bookMasterSelectPublic,
  },
});

export const inventorySelectPublic = Prisma.validator<Prisma.InventoryItemSelect>()({
  id: true,
  condition: true,
  selling_price: true,
  bookSku: {
    select: bookSkuSelectPublic,
  },
});

export const inventorySelectBasic = Prisma.validator<Prisma.InventoryItemSelect>()({
  id: true,
  condition: true,
  selling_price: true,
  status: true,
  bookSku: {
    select: bookSkuSelectPublic,
  },
});

export type InventoryPublic = Prisma.InventoryItemGetPayload<{
  select: typeof inventorySelectPublic;
}>;

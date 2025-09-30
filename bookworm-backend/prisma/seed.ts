// bookworm-backend/prisma/seed.ts

import { PrismaClient, book_condition } from '@prisma/client';

const prisma = new PrismaClient();

const booksToSeed = [
  {
    master: {
      isbn13: '9787111594251',
      title: '深入理解计算机系统（原书第3版）',
      author: 'Randal E. Bryant',
      publisher: '机械工业出版社',
      original_price: 139.00,
    },
    skus: [
      {
        edition: '原书第3版',
        cover_image_url: 'https://img3.doubanio.com/view/subject/l/public/s29634731.jpg',
        inventory: [
          { condition: book_condition.NEW, cost: 70.00, selling_price: 95.00 },
          { condition: book_condition.GOOD, cost: 50.00, selling_price: 75.50 },
          { condition: book_condition.ACCEPTABLE, cost: 30.00, selling_price: 45.00 },
        ],
      },
    ],
  },
  {
    master: {
      isbn13: '9787115428868',
      title: '代码整洁之道',
      author: 'Robert C. Martin',
      publisher: '人民邮电出版社',
      original_price: 59.00,
    },
    skus: [
      {
        edition: '中文版',
        cover_image_url: 'https://img1.doubanio.com/view/subject/l/public/s4418368.jpg',
        inventory: [
          { condition: book_condition.GOOD, cost: 25.00, selling_price: 38.00 },
          { condition: book_condition.GOOD, cost: 26.00, selling_price: 39.00 },
        ],
      },
    ],
  },
  {
    master: {
      isbn13: '9787115546029',
      title: '深入浅出Node.js',
      author: '朴灵',
      publisher: '人民邮电出版社',
      original_price: 69.00,
    },
    skus: [
      {
        edition: '第一版',
        cover_image_url: 'https://img9.doubanio.com/view/subject/l/public/s27204686.jpg',
        inventory: [
          { condition: book_condition.ACCEPTABLE, cost: 15.00, selling_price: 25.00 },
        ],
      },
    ],
  },
  {
    master: {
      isbn13: '9787508649719',
      title: 'Sapiens: A Brief History of Humankind',
      author: 'Yuval Noah Harari',
      publisher: '中信出版社',
      original_price: 68.00,
    },
    skus: [
      {
        edition: '中文版',
        cover_image_url: 'https://img2.doubanio.com/view/subject/l/public/s27371512.jpg',
        inventory: [
          { condition: book_condition.GOOD, cost: 30.00, selling_price: 42.00 },
        ],
      },
      {
        edition: '英文原版',
        cover_image_url: 'https://img2.doubanio.com/view/subject/l/public/s29810813.jpg',
        inventory: [
          { condition: book_condition.NEW, cost: 50.00, selling_price: 78.00 },
        ],
      }
    ],
  },
];

async function main() {
  console.log('Start seeding...');

  // To ensure idempotency, we first clean up the tables that represent physical items.
  // We don't delete BookMaster or BookSKU to preserve their IDs.
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  
  console.log('Cleaned up existing inventory and order data.');

  for (const book of booksToSeed) {
    await prisma.$transaction(async (tx) => {
      // Upsert BookMaster
      const bookMaster = await tx.bookMaster.upsert({
        where: { isbn13: book.master.isbn13 },
        update: book.master,
        create: book.master,
      });

      for (const skuData of book.skus) {
        // Upsert BookSKU
        const bookSku = await tx.bookSku.upsert({
          where: {
            master_id_edition: {
              master_id: bookMaster.id,
              edition: skuData.edition,
            },
          },
          update: {
            cover_image_url: skuData.cover_image_url,
          },
          create: {
            master_id: bookMaster.id,
            edition: skuData.edition,
            cover_image_url: skuData.cover_image_url,
          },
        });

        // Create InventoryItems
        if (skuData.inventory && skuData.inventory.length > 0) {
          await tx.inventoryItem.createMany({
            data: skuData.inventory.map(item => ({
              sku_id: bookSku.id,
              ...item,
            })),
          });
        }
      }
    });
    console.log(`Seeded book: ${book.master.title}`);
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
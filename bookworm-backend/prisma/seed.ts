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

const contentToSeed = [
  {
    slug: 'terms-of-service',
    title: '用户服务协议',
    body: `
      <h2>用户服务协议</h2>
      <p>本服务面向校内二手教材流转，仅供注册用户在授权范围内使用。请您在下单、收货与售卖前确认所填信息真实、合法，不发布侵权或违法信息。</p>
      <p>当订单进入待取货或已售出状态时，请按通知时间前往约定地点完成交接；若需取消，请在支付前或支付后联系客服处理。平台对现金交易外的纠纷保留追责与冻结账户的权利。</p>
      <p>如您为工作人员账户，请遵守学校与平台的岗位要求，妥善保管取货码、付款凭证与仓库权限。</p>
    `,
  },
  {
    slug: 'privacy-policy',
    title: '隐私政策',
    body: `
      <h2>隐私政策</h2>
      <p>我们收集的必要信息包括：微信登录标识（openid）、手机号（用于账户合并与通知）、订单与库存记录。收集用途仅限于完成下单、支付、取货、售后与风控。</p>
      <p>我们不会公开展示您的手机号，所有日志默认进行脱敏处理。涉及支付的通知与证书将按最小权限保存在受控目录，并遵循学校及平台的合规要求。</p>
      <p>如需注销或导出账户数据，请联系客服，处理后将清除与您相关的个人标识与授权信息，但法律法规要求的记录除外。</p>
    `,
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

  // Seed basic content pages (idempotent)
  for (const content of contentToSeed) {
    await prisma.content.upsert({
      where: { slug: content.slug },
      update: {
        title: content.title,
        body: content.body,
      },
      create: content,
    });
    console.log(`Seeded content: ${content.slug}`);
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

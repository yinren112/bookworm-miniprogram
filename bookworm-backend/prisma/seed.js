"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// bookworm-backend/prisma/seed.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Start seeding...');
    // Clean up existing data to ensure a fresh start
    await prisma.orderitem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.inventoryitem.deleteMany({});
    await prisma.booksku.deleteMany({});
    await prisma.bookmaster.deleteMany({});
    await prisma.user.deleteMany({});
    console.log('Cleaned up old data.');
    // Create a dummy user for potential orders
    const user = await prisma.user.create({
        data: {
            openid: 'demo_user_openid',
            nickname: 'Demo User',
        },
    });
    console.log(`Created user with id: ${user.id}`);
    // Define some book data
    const booksToSeed = [
        {
            isbn13: '9787532779434', title: '三体', author: '刘慈欣',
            items: [
                { condition: 'A', cost: 30.00, selling_price: 45.50 },
                { condition: 'B', cost: 25.00, selling_price: 35.00 },
            ]
        },
        {
            isbn13: '9787020137097', title: '活着', author: '余华',
            items: [
                { condition: 'A', cost: 15.00, selling_price: 22.00 },
                { condition: 'B', cost: 12.00, selling_price: 18.00 },
                { condition: 'C', cost: 8.00, selling_price: 12.50 },
            ]
        },
        {
            isbn13: '9787544270878', title: '解忧杂货店', author: '东野圭吾',
            items: [
                { condition: 'A', cost: 20.00, selling_price: 29.80 },
            ]
        },
        {
            isbn13: '9787559620187', title: '人类简史', author: '尤瓦尔·赫拉利',
            items: [
                { condition: 'B', cost: 35.00, selling_price: 55.00 },
                { condition: 'B', cost: 34.00, selling_price: 54.00 },
            ]
        },
        {
            isbn13: '9787208150330', title: '代码整洁之道', author: 'Robert C. Martin',
            items: [
                { condition: 'A', cost: 40.00, selling_price: 68.00 },
                { condition: 'C', cost: 20.00, selling_price: 35.00 },
            ]
        },
        {
            isbn13: '9787115491240', title: '深入理解计算机系统', author: 'Randal E. Bryant',
            items: [
                { condition: 'A', cost: 80.00, selling_price: 120.00 },
                { condition: 'B', cost: 65.00, selling_price: 95.00 },
            ]
        }
    ];
    for (const book of booksToSeed) {
        await prisma.$transaction(async (tx) => {
            const bookMaster = await tx.bookmaster.upsert({
                where: { isbn13: book.isbn13 },
                update: {},
                create: { isbn13: book.isbn13, title: book.title, author: book.author },
            });
            const bookSku = await tx.booksku.upsert({
                where: { master_id_edition: { master_id: bookMaster.id, edition: 'default' } },
                update: {},
                create: { master_id: bookMaster.id, edition: 'default' },
            });
            for (const item of book.items) {
                await tx.inventoryitem.create({
                    data: {
                        sku_id: bookSku.id,
                        condition: item.condition,
                        cost: item.cost,
                        selling_price: item.selling_price,
                        status: 'in_stock',
                    },
                });
            }
        });
        console.log(`Seeded: ${book.title}`);
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

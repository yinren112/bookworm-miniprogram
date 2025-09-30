import { PrismaClient, book_condition, Prisma } from "@prisma/client";

interface AddBookInput {
  isbn13: string;
  title: string;
  author?: string;
  edition?: string;
  condition: book_condition;
  cost: number;
  selling_price: number;
}

// Test version of addBookToInventory that accepts a Prisma client
export async function addBookToInventoryTest(prisma: PrismaClient, input: AddBookInput) {
  return prisma.$transaction(async (tx) => {
    // Step 1: Find or create the master book record (based on ISBN).
    const bookMaster = await tx.bookMaster.upsert({
      where: { isbn13: input.isbn13 },
      update: {
        title: input.title,
        author: input.author || null,
      },
      create: {
        isbn13: input.isbn13,
        title: input.title,
        author: input.author || null,
        publisher: null,
        
      },
    });

    // Step 2: Find or create the SKU (edition/format combination)
    const bookSku = await tx.bookSku.upsert({
      where: {
        master_id_edition: {
          master_id: bookMaster.id,
          edition: input.edition || "未知版本",
        },
      },
      update: {},
      create: {
        master_id: bookMaster.id,
        edition: input.edition || "未知版本",
      },
    });

    // Step 3: Create the inventory item
    const inventoryItem = await tx.inventoryItem.create({
      data: {
        sku_id: bookSku.id,
        condition: input.condition,
        cost: input.cost,
        selling_price: input.selling_price,
        status: "in_stock",
      },
      include: {
        bookSku: {
          include: {
            bookMaster: true,
          },
        },
      },
    });

    return inventoryItem;
  });
}

// Test version of createOrder that accepts a Prisma client
export async function createOrderTest(
  prisma: PrismaClient,
  userId: number,
  itemIds: number[]
) {
  return prisma.$transaction(
    async (tx) => {
      // Find and reserve inventory items
      const itemsToReserve = await tx.inventoryItem.findMany({
        where: {
          id: { in: itemIds },
          status: "in_stock",
        },
      });

      if (itemsToReserve.length !== itemIds.length) {
        throw new Error("部分书籍已不可用，请刷新后重试");
      }

      // Calculate total amount
      const totalAmount = itemsToReserve.reduce((sum, item) => sum + Number(item.selling_price), 0);

      // Create the order first
      const order = await tx.Order.create({
        data: {
          user_id: userId,
          status: "PENDING_PAYMENT",
          total_amount: totalAmount,
          pickup_code: Math.random().toString(36).substring(2, 16).toUpperCase(),
          paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
          orderItem: {
            create: itemIds.map((itemId) => {
              const item = itemsToReserve.find(i => i.id === itemId)!;
              return {
                inventory_item_id: itemId,
                price: item.selling_price,
              };
            }),
          },
        },
        include: {
          orderItem: {
            include: {
              inventoryItem: {
                include: {
                  bookSku: {
                    include: {
                      bookMaster: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Reserve the items by updating status and creating reservation records
      await tx.inventoryItem.updateMany({
        where: {
          id: { in: itemIds },
          status: "in_stock",
        },
        data: {
          status: "reserved",
        },
      });

      // Create reservation records in InventoryReservation table
      await tx.inventoryReservation.createMany({
        data: itemIds.map((itemId) => ({
          inventory_item_id: itemId,
          order_id: order.id,
        })),
      });

      return order;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

// Test version of fulfillOrder that accepts a Prisma client
export async function fulfillOrderTest(
  prisma: PrismaClient,
  pickupCode: string
) {
  return prisma.$transaction(
    async (tx) => {
      // Find the order by pickup code
      const order = await tx.Order.findFirst({
        where: {
          pickup_code: pickupCode,
          status: "PENDING_PICKUP",
        },
        include: {
          orderItem: {
            include: {
              inventoryItem: true,
            },
          },
        },
      });

      if (!order) {
        throw new Error("订单不存在或状态错误");
      }

      // Mark inventory as sold
      const itemIds = order.orderItem.map((item) => item.inventory_item_id);
      await tx.inventoryItem.updateMany({
        where: { id: { in: itemIds } },
        data: {
          status: "sold",
        },
      });

      // Delete reservation records (CASCADE will handle this automatically when order is updated/deleted,
      // but we do it explicitly here for clarity in tests)
      await tx.inventoryReservation.deleteMany({
        where: { inventory_item_id: { in: itemIds } },
      });

      // Complete the order
      const completedOrder = await tx.Order.update({
        where: { id: order.id },
        data: {
          status: "COMPLETED",
          completed_at: new Date(),
        },
        include: {
          orderItem: {
            include: {
              inventoryItem: {
                include: {
                  bookSku: {
                    include: {
                      bookMaster: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return completedOrder;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}
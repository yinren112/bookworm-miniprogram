/**
 * Verification script for OrderSellDetails migration
 * Checks data consistency between Order table and order_sell_details table
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface VerificationResult {
  success: boolean;
  sellOrdersCount: number;
  detailsCount: number;
  missingDetails: number[];
  errors: string[];
}

async function verifyMigration(): Promise<VerificationResult> {
  const result: VerificationResult = {
    success: true,
    sellOrdersCount: 0,
    detailsCount: 0,
    missingDetails: [],
    errors: [],
  };

  try {
    // Count SELL orders
    const sellOrdersCount = await prisma.order.count({
      where: { type: 'SELL' },
    });
    result.sellOrdersCount = sellOrdersCount;

    // Count order_sell_details records
    const detailsCount = await prisma.orderSellDetails.count();
    result.detailsCount = detailsCount;

    console.log(`SELL Orders: ${sellOrdersCount}`);
    console.log(`OrderSellDetails: ${detailsCount}`);

    // Check if counts match
    if (sellOrdersCount !== detailsCount) {
      result.success = false;
      result.errors.push(
        `Count mismatch: ${sellOrdersCount} SELL orders but ${detailsCount} detail records`
      );
    }

    // Find SELL orders without details
    const sellOrders = await prisma.order.findMany({
      where: { type: 'SELL' },
      select: { id: true },
    });

    for (const order of sellOrders) {
      const details = await prisma.orderSellDetails.findUnique({
        where: { order_id: order.id },
      });

      if (!details) {
        result.missingDetails.push(order.id);
      }
    }

    if (result.missingDetails.length > 0) {
      result.success = false;
      result.errors.push(
        `${result.missingDetails.length} SELL orders missing details: ${result.missingDetails.join(', ')}`
      );
    }

    // Verify data integrity: check if details match Order fields
    const ordersWithDetails = await prisma.order.findMany({
      where: { type: 'SELL' },
      include: { sellDetails: true },
    });

    for (const order of ordersWithDetails) {
      if (!order.sellDetails) {
        continue; // Already caught in missingDetails check
      }

      const issues: string[] = [];

      if (order.totalWeightKg !== order.sellDetails.total_weight_kg) {
        issues.push(
          `totalWeightKg mismatch: ${order.totalWeightKg} vs ${order.sellDetails.total_weight_kg}`
        );
      }

      if (order.unitPrice !== order.sellDetails.unit_price) {
        issues.push(
          `unitPrice mismatch: ${order.unitPrice} vs ${order.sellDetails.unit_price}`
        );
      }

      if (order.settlementType !== order.sellDetails.settlement_type) {
        issues.push(
          `settlementType mismatch: ${order.settlementType} vs ${order.sellDetails.settlement_type}`
        );
      }

      if (order.voucherFaceValue !== order.sellDetails.voucher_face_value) {
        issues.push(
          `voucherFaceValue mismatch: ${order.voucherFaceValue} vs ${order.sellDetails.voucher_face_value}`
        );
      }

      if (issues.length > 0) {
        result.success = false;
        result.errors.push(`Order ${order.id}: ${issues.join('; ')}`);
      }
    }

    return result;
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyMigration()
  .then((result) => {
    console.log('\n=== Verification Result ===');
    if (result.success) {
      console.log('✅ Migration verification PASSED');
      console.log(`All ${result.sellOrdersCount} SELL orders have matching details`);
      process.exit(0);
    } else {
      console.log('❌ Migration verification FAILED');
      console.log('\nErrors:');
      result.errors.forEach((error) => console.log(`  - ${error}`));
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Verification script failed:', error);
    process.exit(1);
  });

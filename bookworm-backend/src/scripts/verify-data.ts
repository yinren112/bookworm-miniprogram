import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  console.log('[START] Verifying data import...\n');

  // Test data from your CSV files
  const isbnToTest = '9787109242753'; // From 2024-人工智能
  const editionToTest = '第二版';
  const yearToTest = 2024;
  const majorToTest = '人工智能';

  try {
    // 1. Check if SKU exists with correct edition
    console.log(`[CHECK 1] Verifying SKU exists for ISBN=${isbnToTest}, edition="${editionToTest}"...`);
    const sku = await prisma.bookSku.findFirst({
      where: {
        edition: editionToTest,
        bookMaster: {
          isbn13: isbnToTest,
        },
      },
      include: {
        bookMaster: true,
      },
    });

    if (!sku) {
      console.error(`❌ FAILED: SKU not found for ISBN ${isbnToTest} and edition ${editionToTest}`);
      process.exit(1);
    }
    console.log(`✓ SKU found: ID=${sku.id}, Master ID=${sku.master_id}`);

    // 2. Check if SKU is marked as acquirable
    console.log(`\n[CHECK 2] Verifying SKU is marked as acquirable...`);
    if (!sku.is_acquirable) {
      console.error(`❌ FAILED: SKU is not marked as acquirable.`);
      process.exit(1);
    }
    console.log(`✓ SKU is marked as acquirable`);

    // 3. Check if recommendation link exists
    console.log(
      `\n[CHECK 3] Verifying recommendation link exists for year=${yearToTest}, major="${majorToTest}", sku_id=${sku.id}...`
    );
    const recommendation = await prisma.recommendedBookItem.findFirst({
      where: {
        sku_id: sku.id,
        list: {
          enrollment_year: yearToTest,
          major: majorToTest,
        },
      },
      include: {
        list: true,
      },
    });

    if (!recommendation) {
      console.error(
        `❌ FAILED: Recommendation link not found for year=${yearToTest}, major="${majorToTest}", sku_id=${sku.id}`
      );
      process.exit(1);
    }
    console.log(
      `✓ Recommendation link found: List ID=${recommendation.list_id}, List=${recommendation.list.enrollment_year}-${recommendation.list.major}`
    );

    // Additional checks: Count total records
    console.log(`\n[ADDITIONAL CHECKS] Counting total records...`);

    const masterCount = await prisma.bookMaster.count();
    const skuCount = await prisma.bookSku.count();
    const acquirableSkuCount = await prisma.bookSku.count({ where: { is_acquirable: true } });
    const recommendationListCount = await prisma.recommendedBookList.count();
    const recommendationItemCount = await prisma.recommendedBookItem.count();

    console.log(`  - BookMaster records: ${masterCount}`);
    console.log(`  - BookSku records: ${skuCount}`);
    console.log(`  - Acquirable BookSku records: ${acquirableSkuCount}`);
    console.log(`  - RecommendationList records: ${recommendationListCount}`);
    console.log(`  - RecommendationItem records: ${recommendationItemCount}`);

    console.log(`\n✅ All data verification checks passed!`);
    console.log(`\n[SUCCESS] Data import pipeline completed successfully.`);
  } catch (error) {
    console.error('[ERROR] Verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verify();

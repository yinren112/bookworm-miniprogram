const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateUserMetrics() {
  try {
    // Get the current user count
    const userCount = await prisma.user.count();
    console.log(`Found ${userCount} users in database`);

    // Update the metrics by triggering the metrics object
    // Since we can't directly access the metrics object, we'll make an HTTP request
    const response = await fetch('http://localhost:8080/metrics');
    const metrics = await response.text();

    console.log('Current user metrics:');
    console.log(metrics.split('\n').filter(line => line.includes('bookworm_users_logged_in_total')));

  } catch (error) {
    console.error('Error updating metrics:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateUserMetrics();
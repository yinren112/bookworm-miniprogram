// src/app-factory.ts
// Factory function to create Fastify app with proper database setup for tests

// Override the DATABASE_URL for tests using test containers
export const setupTestDatabase = () => {
  if (process.env.NODE_ENV === 'test' && process.env.TEST_CONTAINERS) {
    const containers = JSON.parse(process.env.TEST_CONTAINERS);
    const workerId = parseInt(process.env.VITEST_WORKER_ID || '1', 10);
    const databaseUrl = containers[workerId] || containers['1'];

    if (databaseUrl) {
      // Override the DATABASE_URL for this process
      process.env.DATABASE_URL = databaseUrl;
      console.log(`✅ Test database URL set for worker ${workerId}: ${databaseUrl.substring(0, 30)}...`);
    }
  }
};

// Call this function before importing the main app to ensure the correct DATABASE_URL is used
export const createTestApp = async () => {
  setupTestDatabase();
  // Import after setting up the database URL
  const { buildApp } = await import('./index');
  return buildApp();
};
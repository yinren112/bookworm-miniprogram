// bookworm-backend/src/db.ts
import { PrismaClient } from '@prisma/client';

// Add prisma to the NodeJS global type
declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// --- Graceful Shutdown Logic ---

async function gracefulShutdown(signal: string) {
  console.error(`[GRACEFUL SHUTDOWN] Received ${signal}. Shutting down gracefully...`);
  try {
    await prisma.$disconnect();
    console.error('[GRACEFUL SHUTDOWN] Prisma client disconnected successfully.');
  } catch (error) {
    console.error('[GRACEFUL SHUTDOWN] Error during Prisma disconnection:', error);
  }
  console.error('[GRACEFUL SHUTDOWN] Process exiting...');
  process.exit(0);
}

// `beforeExit` is a good fallback for when the event loop empties,
// but it's not called on explicit termination signals.
process.on('beforeExit', async () => {
  console.error('beforeExit event triggered. Disconnecting Prisma client...');
  await prisma.$disconnect();
});

// Listen for the signals that are actually used to terminate processes.
// SIGINT is for Ctrl+C.
// SIGTERM is the standard signal for graceful termination (e.g., from Docker/Kubernetes).
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default prisma;

// src/services/auth/userMerge.ts
// User data migration strategies for account merging
// Implements Strategy pattern for clean separation of concerns

import { Prisma } from "@prisma/client";
import { log } from "../../lib/logger";

/**
 * Database context type (PrismaClient or TransactionClient)
 */
type DbCtx = Prisma.TransactionClient | { [K in keyof Prisma.TransactionClient]: Prisma.TransactionClient[K] };

/**
 * User Data Migration Strategy Interface
 *
 * Each strategy handles migration of one specific data type.
 * Follows Single Responsibility Principle.
 */
interface UserDataMigrationStrategy {
  name: string;
  migrate(fromUserId: number, toUserId: number, dbCtx: DbCtx): Promise<void>;
}

/**
 * Order Migration Strategy
 *
 * Transfers all orders from one user to another.
 * This includes both PURCHASE and SELL type orders.
 */
class OrderMigrationStrategy implements UserDataMigrationStrategy {
  name = 'orders';

  async migrate(fromUserId: number, toUserId: number, dbCtx: DbCtx): Promise<void> {
    const result = await dbCtx.order.updateMany({
      where: { user_id: fromUserId },
      data: { user_id: toUserId },
    });

    log.debug({ strategy: this.name, count: result.count }, 'Orders migrated');
  }
}

/**
 * Pending Payment Order Migration Strategy
 *
 * Transfers pending payment order records to prevent constraint violations.
 */
class PendingPaymentMigrationStrategy implements UserDataMigrationStrategy {
  name = 'pending_payment_orders';

  async migrate(fromUserId: number, toUserId: number, dbCtx: DbCtx): Promise<void> {
    const result = await dbCtx.pendingPaymentOrder.updateMany({
      where: { user_id: fromUserId },
      data: { user_id: toUserId },
    });

    log.debug({ strategy: this.name, count: result.count }, 'Pending payment orders migrated');
  }
}

/**
 * Acquisition Migration Strategy
 *
 * Transfers acquisition records where the user is the customer.
 * This is important for sell order history.
 */
class AcquisitionMigrationStrategy implements UserDataMigrationStrategy {
  name = 'acquisitions';

  async migrate(fromUserId: number, toUserId: number, dbCtx: DbCtx): Promise<void> {
    const result = await dbCtx.acquisition.updateMany({
      where: { customer_user_id: fromUserId },
      data: { customer_user_id: toUserId },
    });

    log.debug({ strategy: this.name, count: result.count }, 'Acquisitions migrated');
  }
}

/**
 * User Profile Migration Strategy
 *
 * Special handling: Check for conflicts before migration.
 * - If only source has profile: transfer it
 * - If both have profiles: delete source profile (keep target)
 * - If only target has profile or neither has: do nothing
 */
class UserProfileMigrationStrategy implements UserDataMigrationStrategy {
  name = 'user_profile';

  async migrate(fromUserId: number, toUserId: number, dbCtx: DbCtx): Promise<void> {
    const sourceProfile = await dbCtx.userProfile.findUnique({
      where: { user_id: fromUserId },
    });
    const targetProfile = await dbCtx.userProfile.findUnique({
      where: { user_id: toUserId },
    });

    if (sourceProfile && !targetProfile) {
      // Case 1: Only source has profile - transfer it
      await dbCtx.userProfile.update({
        where: { user_id: fromUserId },
        data: { user_id: toUserId },
      });
      log.debug({ strategy: this.name, action: 'transferred' }, 'Profile migrated');
    } else if (sourceProfile && targetProfile) {
      // Case 2: Both have profiles - delete source (keep target)
      await dbCtx.userProfile.delete({
        where: { user_id: fromUserId },
      });
      log.debug({ strategy: this.name, action: 'deleted_source' }, 'Profile conflict resolved');
    } else {
      // Case 3: Only target has profile or neither has - do nothing
      log.debug({ strategy: this.name, action: 'no_migration_needed' }, 'Profile migration skipped');
    }
  }
}

/**
 * Migrate all user data from one user to another
 *
 * Uses Strategy pattern to cleanly separate different migration concerns.
 * Each strategy is executed in sequence.
 *
 * @param fromUserId - Source user ID (data to be transferred)
 * @param toUserId - Target user ID (data recipient)
 * @param dbCtx - Database context (must be in a transaction)
 */
export async function migrateUserData(
  fromUserId: number,
  toUserId: number,
  dbCtx: DbCtx
): Promise<void> {
  const strategies: UserDataMigrationStrategy[] = [
    new OrderMigrationStrategy(),
    new PendingPaymentMigrationStrategy(),
    new AcquisitionMigrationStrategy(),
    new UserProfileMigrationStrategy(),
  ];

  log.info({ fromUserId, toUserId, strategiesCount: strategies.length }, 'Starting user data migration');

  for (const strategy of strategies) {
    await strategy.migrate(fromUserId, toUserId, dbCtx);
  }

  log.info({ fromUserId, toUserId }, 'User data migration completed');
}

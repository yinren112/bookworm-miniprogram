import { PrismaClient } from "@prisma/client";
import { log } from "../lib/logger";

interface CriticalConstraint {
  name: string;
  query: (db: PrismaClient) => Promise<boolean>;
  errorMessage: string;
}

// Define all critical constraints that cannot be expressed in schema.prisma
const CRITICAL_CONSTRAINTS: CriticalConstraint[] = [
  {
    name: "Pending payment guard table",
    query: async (db: PrismaClient) => {
      const result = await db.$queryRaw<[{ exists: boolean }]>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = 'pending_payment_order'
        );
      `;
      return result[0]?.exists === true;
    },
    errorMessage: "Pending payment guard table missing. Run database migrations before starting the service.",
  },
  {
    name: "Unique constraint uniq_order_pending_per_user",
    query: async (db: PrismaClient) => {
      const result = await db.$queryRaw<[{ exists: boolean }]>`
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE indexname = 'uniq_order_pending_per_user'
            AND indexdef LIKE '%UNIQUE%'
        );
      `;
      return result[0]?.exists === true;
    },
    errorMessage: "Unique constraint 'uniq_order_pending_per_user' is missing. Duplicate pending orders would slip through.",
  },
  {
    name: "Trigger order_sync_pending_payment_insert",
    query: async (db: PrismaClient) => {
      const result = await db.$queryRaw<[{ exists: boolean }]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'order_sync_pending_payment_insert'
            AND tgrelid = '"Order"'::regclass
        );
      `;
      return result[0]?.exists === true;
    },
    errorMessage: "Trigger 'order_sync_pending_payment_insert' missing. Pending guard table will drift.",
  },
  {
    name: "Trigger inventory_reservation_enforce_cap",
    query: async (db: PrismaClient) => {
      const result = await db.$queryRaw<[{ exists: boolean }]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'inventory_reservation_enforce_cap'
            AND tgrelid = 'inventory_reservation'::regclass
        );
      `;
      return result[0]?.exists === true;
    },
    errorMessage: "Trigger 'inventory_reservation_enforce_cap' missing. User reservation cap is unenforced.",
  },
  // Note: inventoryitem_validate_reservation trigger was removed in migration 20250930135002
  // It was legacy code from an older architecture. InventoryReservation table PK now enforces uniqueness.
];

/**
 * Verifies that all critical, manually-defined database constraints exist.
 * If a constraint is missing, it logs a fatal error and exits the process.
 * @param db The PrismaClient instance.
 */
export async function verifyDatabaseConstraints(db: PrismaClient): Promise<void> {
  log.info('Verifying critical database constraints...');
  let allOk = true;

  for (const constraint of CRITICAL_CONSTRAINTS) {
    const exists = await constraint.query(db);
    if (exists) {
      log.info({ constraint: constraint.name }, `✅ [OK] ${constraint.name}`);
    } else {
      log.error({ constraint: constraint.name, errorMessage: constraint.errorMessage }, `❌ [FATAL] ${constraint.name}`);
      allOk = false;
    }
  }

  if (!allOk) {
    log.error('Database constraint verification failed. The application cannot start in an inconsistent state.');
    process.exit(1);
  }

  log.info('All critical database constraints verified successfully.');
}

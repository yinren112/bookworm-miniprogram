// src/services/auth/userOperations.ts
// User state transition operations
// Each function performs a single atomic operation

import { Prisma, User } from "@prisma/client";
import { log } from "../../lib/logger";
import { maskOpenId, maskPhoneNumber } from "../../lib/logSanitizer";
import { migrateUserData } from "./userMerge";

type DbCtx = Prisma.TransactionClient | { [K in keyof Prisma.TransactionClient]: Prisma.TransactionClient[K] };

/**
 * Upgrade PRE_REGISTERED user to REGISTERED status
 *
 * This is the simple case: no conflicts, just add WeChat credentials.
 *
 * @param dbCtx - Database context
 * @param preRegUser - Pre-registered user
 * @param openid - WeChat openid
 * @param unionid - Optional WeChat unionid
 * @returns Updated user with REGISTERED status
 */
export async function upgradePreRegisteredUser(
  dbCtx: DbCtx,
  preRegUser: User,
  openid: string,
  unionid?: string
): Promise<User> {
  const updatedUser = await dbCtx.user.update({
    where: { id: preRegUser.id },
    data: {
      openid,
      unionid,
      status: 'REGISTERED',
    },
  });

  log.info(
    { userId: preRegUser.id, openid: maskOpenId(openid) },
    'PRE_REGISTERED user upgraded to REGISTERED'
  );

  return updatedUser;
}

/**
 * Resolve merge conflict: transfer data from PRE_REGISTERED to existing REGISTERED user
 *
 * This handles the complex case where the WeChat openid/unionid is already in use.
 * Strategy:
 * 1. Migrate all data from PRE_REGISTERED user to REGISTERED user
 * 2. Delete the PRE_REGISTERED placeholder
 * 3. Update phone number on REGISTERED user if missing
 *
 * @param dbCtx - Database context
 * @param preRegUser - PRE_REGISTERED user (will be deleted)
 * @param registeredUser - Existing REGISTERED user (data target)
 * @param phoneNumber - Phone number to set on registered user
 * @returns Updated REGISTERED user
 */
export async function resolveConflictAndMerge(
  dbCtx: DbCtx,
  preRegUser: User,
  registeredUser: User,
  phoneNumber: string
): Promise<User> {
  log.info(
    {
      preRegisteredUserId: preRegUser.id,
      registeredUserId: registeredUser.id,
      phone: maskPhoneNumber(phoneNumber),
    },
    'Merge conflict detected: transferring data from PRE_REGISTERED to REGISTERED user'
  );

  // Step 1: Migrate all associated data
  await migrateUserData(preRegUser.id, registeredUser.id, dbCtx);

  // Step 2: Delete the PRE_REGISTERED placeholder
  await dbCtx.user.delete({
    where: { id: preRegUser.id },
  });

  log.debug({ deletedUserId: preRegUser.id }, 'PRE_REGISTERED user deleted');

  // Step 3: Update phone number on REGISTERED user if not already set
  if (!registeredUser.phone_number) {
    await dbCtx.user.update({
      where: { id: registeredUser.id },
      data: { phone_number: phoneNumber },
    });
    log.debug({ userId: registeredUser.id }, 'Phone number updated on REGISTERED user');
  }

  // Step 4: Return the final merged user
  const mergedUser = await dbCtx.user.findUniqueOrThrow({
    where: { id: registeredUser.id },
  });

  log.info(
    { preRegisteredUserId: preRegUser.id, registeredUserId: registeredUser.id },
    'Merge complete: data transferred and placeholder deleted'
  );

  return mergedUser;
}

/**
 * Update user's openid (when it changes between logins)
 *
 * @param dbCtx - Database context
 * @param userId - User ID
 * @param openid - New openid
 * @returns Updated user
 */
export async function updateUserOpenId(
  dbCtx: DbCtx,
  userId: number,
  openid: string
): Promise<User> {
  return await dbCtx.user.update({
    where: { id: userId },
    data: { openid },
  });
}

/**
 * Update user's unionid
 *
 * @param dbCtx - Database context
 * @param userId - User ID
 * @param unionid - Unionid to set
 * @returns Updated user
 */
export async function updateUserUnionId(
  dbCtx: DbCtx,
  userId: number,
  unionid: string
): Promise<User> {
  return await dbCtx.user.update({
    where: { id: userId },
    data: { unionid },
  });
}

/**
 * Create a new REGISTERED user
 *
 * @param dbCtx - Database context
 * @param openid - WeChat openid
 * @param unionid - Optional WeChat unionid
 * @param phoneNumber - Optional phone number
 * @returns Newly created user
 */
export async function createUser(
  dbCtx: DbCtx,
  openid: string,
  unionid?: string,
  phoneNumber?: string
): Promise<User> {
  const user = await dbCtx.user.create({
    data: {
      openid,
      unionid,
      phone_number: phoneNumber,
    },
  });

  log.info({ userId: user.id, openid: maskOpenId(openid) }, 'New user created');

  return user;
}

// src/services/auth/userQueries.ts
// User query functions with single responsibility
// Each function does ONE thing and does it well

import { Prisma, User } from "@prisma/client";

type DbCtx = Prisma.TransactionClient | { [K in keyof Prisma.TransactionClient]: Prisma.TransactionClient[K] };

/**
 * Find PRE_REGISTERED user by phone number
 *
 * @param dbCtx - Database context
 * @param phoneNumber - Phone number to search for
 * @returns User if found, null otherwise
 */
export async function findPreRegisteredUserByPhone(
  dbCtx: DbCtx,
  phoneNumber: string
): Promise<User | null> {
  return await dbCtx.user.findFirst({
    where: {
      phone_number: phoneNumber,
      status: 'PRE_REGISTERED',
    },
  });
}

/**
 * Find conflicting REGISTERED user by openid or unionid
 *
 * This checks if the WeChat credentials are already in use by another user.
 *
 * @param dbCtx - Database context
 * @param openid - WeChat openid
 * @param unionid - Optional WeChat unionid
 * @returns Conflicting user if found, null otherwise
 */
export async function findConflictingRegisteredUser(
  dbCtx: DbCtx,
  openid: string,
  unionid?: string
): Promise<User | null> {
  const conditions: Prisma.UserWhereInput[] = [{ openid }];
  if (unionid) {
    conditions.push({ unionid });
  }

  return await dbCtx.user.findFirst({
    where: {
      OR: conditions,
      status: 'REGISTERED',
    },
  });
}

/**
 * Find user by unionid (most reliable identifier)
 *
 * @param dbCtx - Database context
 * @param unionid - WeChat unionid
 * @returns User if found, null otherwise
 */
export async function findUserByUnionId(
  dbCtx: DbCtx,
  unionid: string
): Promise<User | null> {
  return await dbCtx.user.findUnique({ where: { unionid } });
}

/**
 * Find user by openid
 *
 * @param dbCtx - Database context
 * @param openid - WeChat openid
 * @returns User if found, null otherwise
 */
export async function findUserByOpenId(
  dbCtx: DbCtx,
  openid: string
): Promise<User | null> {
  return await dbCtx.user.findUnique({ where: { openid } });
}

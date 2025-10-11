// src/services/authService.ts
import axios from "axios";
import { createSigner } from "fast-jwt";
import { PrismaClient, Prisma } from "@prisma/client";
import config from "../config";
import { metrics } from "../plugins/metrics";
import { WECHAT_CONSTANTS } from "../constants";

type DbCtx = PrismaClient | Prisma.TransactionClient;

interface WxSession {
  openid: string;
  unionid?: string;
}

// Helper functions for user management - each with single responsibility

async function findUserByUnionId(dbCtx: DbCtx, unionid: string) {
  return await dbCtx.user.findUnique({ where: { unionid } });
}

async function findUserByOpenId(dbCtx: DbCtx, openid: string) {
  return await dbCtx.user.findUnique({ where: { openid } });
}

async function updateUserOpenId(dbCtx: DbCtx, userId: number, openid: string) {
  return await dbCtx.user.update({
    where: { id: userId },
    data: { openid },
  });
}

async function updateUserUnionId(dbCtx: DbCtx, userId: number, unionid: string) {
  return await dbCtx.user.update({
    where: { id: userId },
    data: { unionid },
  });
}

async function createUser(dbCtx: DbCtx, openid: string, unionid?: string) {
  const user = await dbCtx.user.create({
    data: { openid, unionid },
  });

  metrics.usersLoggedInTotal.inc();

  return user;
}

async function ensureUserWithUnionId(dbCtx: DbCtx, openid: string, unionid: string) {
  // Try to find by unionid first (most reliable identifier)
  const userByUnionId = await findUserByUnionId(dbCtx, unionid);
  if (userByUnionId) {
    // Update openid if it changed
    if (userByUnionId.openid !== openid) {
      return await updateUserOpenId(dbCtx, userByUnionId.id, openid);
    }
    return userByUnionId;
  }

  // No user with this unionid, try to find by openid
  const userByOpenId = await findUserByOpenId(dbCtx, openid);
  if (userByOpenId) {
    // Update existing user with unionid
    return await updateUserUnionId(dbCtx, userByOpenId.id, unionid);
  }

  // No existing user, create new one
  return await createUser(dbCtx, openid, unionid);
}

async function ensureUserWithOpenIdOnly(dbCtx: DbCtx, openid: string) {
  const existingUser = await findUserByOpenId(dbCtx, openid);
  if (existingUser) {
    return existingUser;
  }

  // No existing user, create new one
  return await createUser(dbCtx, openid);
}

export function generateJwtToken(user: { id: number; openid: string }) {
  const signer = createSigner({
    key: config.JWT_SECRET,
    expiresIn: config.JWT_EXPIRES_IN,
  });

  return signer({
    userId: user.id,
    openid: user.openid,
  });
}


export async function requestWxSession(code: string): Promise<WxSession> {
  if (
    (config.NODE_ENV !== "production" && config.NODE_ENV !== "staging") ||
    config.WX_APP_ID.startsWith("dummy") ||
    config.WX_APP_SECRET.startsWith("dummy")
  ) {
    return {
      openid: `mock-openid-${code}`,
    };
  }

  const url = `${WECHAT_CONSTANTS.JSCODE2SESSION_URL}?appid=${config.WX_APP_ID}&secret=${config.WX_APP_SECRET}&js_code=${code}&grant_type=${WECHAT_CONSTANTS.GRANT_TYPE}`;
  const { data } = await axios.get(url);

  if (data.errcode) {
    throw new Error(`WeChat API Error: ${data.errmsg}`);
  }

  return data as WxSession;
}

export async function persistWeChatUser(dbCtx: DbCtx, { openid, unionid }: WxSession) {
  return unionid
    ? ensureUserWithUnionId(dbCtx, openid, unionid)
    : ensureUserWithOpenIdOnly(dbCtx, openid);
}

export async function wxLogin(prisma: PrismaClient, code: string) {
  const session = await requestWxSession(code);

  const user = await prisma.$transaction(async (tx) => {
    return persistWeChatUser(tx, session);
  });

  const token = await generateJwtToken(user);

  return { token, user };
}

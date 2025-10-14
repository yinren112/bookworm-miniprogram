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

interface WxAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface WxPhoneNumberResponse {
  errcode: number;
  errmsg: string;
  phone_info?: {
    phoneNumber: string;
    purePhoneNumber: string;
    countryCode: string;
  };
}

// Simple in-memory cache for access_token
let accessTokenCache: { token: string; expiresAt: number } | null = null;

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

async function createUser(dbCtx: DbCtx, openid: string, unionid?: string, phoneNumber?: string) {
  const user = await dbCtx.user.create({
    data: {
      openid,
      unionid,
      phone_number: phoneNumber,
    },
  });

  metrics.usersLoggedInTotal.inc();

  return user;
}

async function ensureUserWithUnionId(dbCtx: DbCtx, openid: string, unionid: string, phoneNumber?: string) {
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

  // No existing user, create new one with phone number if provided
  return await createUser(dbCtx, openid, unionid, phoneNumber);
}

async function ensureUserWithOpenIdOnly(dbCtx: DbCtx, openid: string, phoneNumber?: string) {
  const existingUser = await findUserByOpenId(dbCtx, openid);
  if (existingUser) {
    // Update phone_number if provided and user doesn't have one
    if (phoneNumber && !existingUser.phone_number) {
      return await dbCtx.user.update({
        where: { id: existingUser.id },
        data: { phone_number: phoneNumber },
      });
    }
    return existingUser;
  }

  // No existing user, create new one with phone number
  return await createUser(dbCtx, openid, undefined, phoneNumber);
}

async function findAndMergePreRegisteredUser(
  dbCtx: DbCtx,
  phoneNumber: string,
  openid: string,
  unionid?: string,
) {
  // Look for PRE_REGISTERED user with matching phone number
  const preRegisteredUser = await dbCtx.user.findFirst({
    where: {
      phone_number: phoneNumber,
      status: 'PRE_REGISTERED',
    },
  });

  if (preRegisteredUser) {
    // Merge: Update the placeholder account with real WeChat credentials
    const mergedUser = await dbCtx.user.update({
      where: { id: preRegisteredUser.id },
      data: {
        openid,
        unionid,
        status: 'REGISTERED',
      },
    });

    console.log(`Merged PRE_REGISTERED user ${preRegisteredUser.id} with WeChat openid ${openid}`);
    return mergedUser;
  }

  return null;
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
    // Development: Use a fixed mock openid to avoid creating new users on every reload
    return {
      openid: `mock-openid-dev-fixed-user`,
    };
  }

  const url = `${WECHAT_CONSTANTS.JSCODE2SESSION_URL}?appid=${config.WX_APP_ID}&secret=${config.WX_APP_SECRET}&js_code=${code}&grant_type=${WECHAT_CONSTANTS.GRANT_TYPE}`;
  const { data } = await axios.get(url);

  if (data.errcode) {
    throw new Error(`WeChat API Error: ${data.errmsg}`);
  }

  return data as WxSession;
}

async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAt > now) {
    return accessTokenCache.token;
  }

  // Fetch new access_token from WeChat
  const url = `${WECHAT_CONSTANTS.GET_ACCESS_TOKEN_URL}?grant_type=client_credential&appid=${config.WX_APP_ID}&secret=${config.WX_APP_SECRET}`;
  const { data } = await axios.get<WxAccessTokenResponse>(url);

  if (data.errcode || !data.access_token || !data.expires_in) {
    throw new Error(`WeChat Access Token Error: ${data.errmsg || 'Invalid response'}`);
  }

  // After validation, we know access_token and expires_in are defined
  const accessToken = data.access_token;
  const expiresIn = data.expires_in;

  // Cache the token with 5-minute buffer before expiry (WeChat tokens expire in 7200s)
  const expiresAt = now + (expiresIn - 300) * 1000;
  accessTokenCache = {
    token: accessToken,
    expiresAt,
  };

  return accessToken;
}

export async function requestWxPhoneNumber(phoneCode: string): Promise<string | null> {
  if (
    (config.NODE_ENV !== "production" && config.NODE_ENV !== "staging") ||
    config.WX_APP_ID.startsWith("dummy") ||
    config.WX_APP_SECRET.startsWith("dummy")
  ) {
    // Development: Return mock phone number
    return "13800138000";
  }

  try {
    const accessToken = await getAccessToken();
    const url = `${WECHAT_CONSTANTS.GET_PHONE_NUMBER_URL}?access_token=${accessToken}`;

    const { data } = await axios.post<WxPhoneNumberResponse>(url, {
      code: phoneCode,
    });

    if (data.errcode !== 0) {
      console.warn(`Failed to get phone number from WeChat: ${data.errmsg}`);
      return null;
    }

    return data.phone_info?.purePhoneNumber || null;
  } catch (error) {
    console.error("Error fetching WeChat phone number:", error);
    return null;
  }
}

export async function persistWeChatUser(
  dbCtx: DbCtx,
  { openid, unionid }: WxSession,
  phoneNumber?: string,
) {
  // PHASE 1: If phone number provided, try to merge with PRE_REGISTERED account
  if (phoneNumber) {
    const mergedUser = await findAndMergePreRegisteredUser(dbCtx, phoneNumber, openid, unionid);
    if (mergedUser) {
      return mergedUser;
    }
  }

  // PHASE 2: Normal flow - find or create user by openid/unionid
  if (unionid) {
    const user = await ensureUserWithUnionId(dbCtx, openid, unionid, phoneNumber);

    // Update phone_number if provided and user doesn't have one
    if (phoneNumber && !user.phone_number) {
      return await dbCtx.user.update({
        where: { id: user.id },
        data: { phone_number: phoneNumber },
      });
    }

    return user;
  }

  return ensureUserWithOpenIdOnly(dbCtx, openid, phoneNumber);
}

export async function wxLogin(prisma: PrismaClient, code: string) {
  const session = await requestWxSession(code);

  const user = await prisma.$transaction(async (tx) => {
    return persistWeChatUser(tx, session);
  });

  const token = await generateJwtToken(user);

  return { token, user };
}

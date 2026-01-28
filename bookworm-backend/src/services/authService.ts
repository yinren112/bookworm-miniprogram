// src/services/authService.ts
import axios from "axios";
import { createSigner } from "fast-jwt";
import { PrismaClient, Prisma, User } from "@prisma/client";
import config from "../config";
import { metrics } from "../plugins/metrics";
import { BUSINESS_LIMITS, WECHAT_CONSTANTS } from "../constants";
import { findPreRegisteredUserByPhone, findConflictingRegisteredUser, findUserByUnionId as findUserByUnionIdQuery, findUserByOpenId as findUserByOpenIdQuery } from "./auth/userQueries";
import { upgradePreRegisteredUser, resolveConflictAndMerge, updateUserOpenId as updateUserOpenIdOp, updateUserUnionId as updateUserUnionIdOp, createUser as createUserOp } from "./auth/userOperations";
import { log } from "../lib/logger";

type DbCtx = PrismaClient | Prisma.TransactionClient;

interface WxSession {
  openid: string;
  unionid?: string;
}

interface WxSessionResponse {
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
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

type WxPhoneNumberResult =
  | { status: "ok"; phoneNumber: string }
  | { status: "failed"; retryable: boolean; reason: string; errcode?: number; httpStatus?: number };

const WECHAT_RETRYABLE_ERRCODES = new Set([-1, 40001, 40014, 42001, 45011]);
const WECHAT_TOKEN_INVALID_ERRCODES = new Set([40001, 40014, 42001]);

class WechatRequestError extends Error {
  public retryable: boolean;
  public errcode?: number;
  public httpStatus?: number;
  public originalError?: unknown;

  constructor(
    message: string,
    options: { retryable: boolean; errcode?: number; httpStatus?: number; originalError?: unknown },
  ) {
    super(message);
    this.name = "WechatRequestError";
    this.retryable = options.retryable;
    this.errcode = options.errcode;
    this.httpStatus = options.httpStatus;
    this.originalError = options.originalError;
  }
}

const isRetryableWechatErrcode = (errcode?: number) =>
  typeof errcode === "number" && WECHAT_RETRYABLE_ERRCODES.has(errcode);

const isRetryableAxiosError = (error: unknown) => {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  const status = error.response.status;
  return status >= 500 || status === 408 || status === 429;
};

async function retryWechatRequest<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
): Promise<T> {
  for (let attempt = 0; attempt < BUSINESS_LIMITS.WECHAT_API_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= BUSINESS_LIMITS.WECHAT_API_RETRY_ATTEMPTS - 1 || !shouldRetry(error)) {
        throw error;
      }
      const backoffDelay = BUSINESS_LIMITS.WECHAT_API_RETRY_DELAY_MS * Math.pow(2, attempt);
      log.debug(
        { attempt: attempt + 1, attempts: BUSINESS_LIMITS.WECHAT_API_RETRY_ATTEMPTS, backoffDelay },
        `WeChat request failed, retrying in ${backoffDelay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }
  throw new Error("WeChat retry logic failed unexpectedly.");
}

// Simple in-memory cache for access_token
let accessTokenCache: { token: string; expiresAt: number } | null = null;
// Promise-based request deduplication to prevent concurrent WeChat API calls
let accessTokenPromise: Promise<string> | null = null;

// Helper functions for user management - each with single responsibility


// Wrapper functions that use the new modularized code

const findUserByUnionId = findUserByUnionIdQuery;
const findUserByOpenId = findUserByOpenIdQuery;
const updateUserOpenId = updateUserOpenIdOp;
const updateUserUnionId = updateUserUnionIdOp;
const createUser = (dbCtx: DbCtx, openid: string, unionid?: string, phoneNumber?: string) => {
  metrics.usersLoggedInTotal.inc();
  return createUserOp(dbCtx, openid, unionid, phoneNumber);
};

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
): Promise<User | null> {
  // Step 1: Look for PRE_REGISTERED user with matching phone number
  const preRegUser = await findPreRegisteredUserByPhone(dbCtx, phoneNumber);

  if (!preRegUser) {
    return null; // No pre-registered user found
  }

  // Step 2: Check if WeChat credentials are already in use by another REGISTERED user
  const conflictUser = await findConflictingRegisteredUser(dbCtx, openid, unionid);

  if (conflictUser) {
    // Conflict case: Merge PRE_REGISTERED data into existing REGISTERED user
    return await resolveConflictAndMerge(dbCtx, preRegUser, conflictUser, phoneNumber);
  }

  // No conflict case: Simply upgrade PRE_REGISTERED to REGISTERED
  return await upgradePreRegisteredUser(dbCtx, preRegUser, openid, unionid);
}

export function generateJwtToken(user: { id: number; openid: string; role: string }) {
  const signer = createSigner({
    key: config.JWT_SECRET,
    expiresIn: config.JWT_EXPIRES_IN,
  });

  return signer({
    userId: user.id,
    openid: user.openid,
    role: user.role,
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
  const session = await retryWechatRequest(
    async () => {
      try {
        const { data } = await axios.get<WxSessionResponse>(url, {
          timeout: BUSINESS_LIMITS.WECHAT_API_TIMEOUT_MS,
        });

        if (data.errcode) {
          throw new WechatRequestError(`WeChat API Error: ${data.errmsg}`, {
            retryable: isRetryableWechatErrcode(data.errcode),
            errcode: data.errcode,
          });
        }

        if (!data.openid) {
          throw new WechatRequestError("WeChat session response missing openid", {
            retryable: false,
          });
        }

        return data as WxSession;
      } catch (error) {
        if (error instanceof WechatRequestError) {
          throw error;
        }
        if (axios.isAxiosError(error)) {
          throw new WechatRequestError("WeChat session request failed", {
            retryable: isRetryableAxiosError(error),
            httpStatus: error.response?.status,
            originalError: error,
          });
        }
        throw new WechatRequestError("WeChat session request failed", {
          retryable: false,
          originalError: error,
        });
      }
    },
    (error) => error instanceof WechatRequestError && error.retryable,
  );

  return session;
}

async function getAccessToken(): Promise<string> {
  // If there's already a fetch in progress, wait for it
  if (accessTokenPromise) {
    return accessTokenPromise;
  }

  // Check if we have a valid cached token
  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAt > now) {
    return accessTokenCache.token;
  }

  // Create new fetch promise with automatic cleanup
  accessTokenPromise = (async () => {
    try {
      // Fetch new access_token from WeChat
      const url = `${WECHAT_CONSTANTS.GET_ACCESS_TOKEN_URL}?grant_type=client_credential&appid=${config.WX_APP_ID}&secret=${config.WX_APP_SECRET}`;
      let data: WxAccessTokenResponse;

      try {
        const response = await axios.get<WxAccessTokenResponse>(url, {
          timeout: BUSINESS_LIMITS.WECHAT_API_TIMEOUT_MS,
        });
        data = response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          throw new WechatRequestError("WeChat access token request failed", {
            retryable: isRetryableAxiosError(error),
            httpStatus: error.response?.status,
            originalError: error,
          });
        }
        throw new WechatRequestError("WeChat access token request failed", {
          retryable: false,
          originalError: error,
        });
      }

      if (data.errcode || !data.access_token || !data.expires_in) {
        throw new WechatRequestError(
          `WeChat Access Token Error: ${data.errmsg || "Invalid response"}`,
          {
            retryable: isRetryableWechatErrcode(data.errcode),
            errcode: data.errcode,
          },
        );
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
    } finally {
      // Clear the promise reference after completion (success or failure)
      accessTokenPromise = null;
    }
  })();

  return accessTokenPromise;
}

export async function requestWxPhoneNumber(phoneCode: string): Promise<WxPhoneNumberResult> {
  if (
    (config.NODE_ENV !== "production" && config.NODE_ENV !== "staging") ||
    config.WX_APP_ID.startsWith("dummy") ||
    config.WX_APP_SECRET.startsWith("dummy")
  ) {
    // Development: Return mock phone number
    return { status: "ok", phoneNumber: "13800138000" };
  }

  try {
    return await retryWechatRequest(
      async () => {
        try {
          const accessToken = await getAccessToken();
          const url = `${WECHAT_CONSTANTS.GET_PHONE_NUMBER_URL}?access_token=${accessToken}`;

          const { data } = await axios.post<WxPhoneNumberResponse>(
            url,
            { code: phoneCode },
            { timeout: BUSINESS_LIMITS.WECHAT_API_TIMEOUT_MS },
          );

          if (data.errcode !== 0) {
            if (WECHAT_TOKEN_INVALID_ERRCODES.has(data.errcode)) {
              accessTokenCache = null;
            }
            const retryable = isRetryableWechatErrcode(data.errcode);
            if (retryable) {
              throw new WechatRequestError(`WeChat phone number error: ${data.errmsg}`, {
                retryable: true,
                errcode: data.errcode,
              });
            }
            return {
              status: "failed",
              retryable: false,
              reason: data.errmsg || "WECHAT_PHONE_NUMBER_ERROR",
              errcode: data.errcode,
            };
          }

          const phoneNumber = data.phone_info?.purePhoneNumber;
          if (!phoneNumber) {
            return {
              status: "failed",
              retryable: false,
              reason: "WECHAT_PHONE_NUMBER_MISSING",
              errcode: data.errcode,
            };
          }

          return { status: "ok", phoneNumber };
        } catch (error) {
          if (error instanceof WechatRequestError) {
            throw error;
          }
          if (axios.isAxiosError(error)) {
            throw new WechatRequestError("WeChat phone number request failed", {
              retryable: isRetryableAxiosError(error),
              httpStatus: error.response?.status,
              originalError: error,
            });
          }
          throw new WechatRequestError("WeChat phone number request failed", {
            retryable: false,
            originalError: error,
          });
        }
      },
      (error) => error instanceof WechatRequestError && error.retryable,
    );
  } catch (error) {
    if (error instanceof WechatRequestError && !error.retryable) {
      return {
        status: "failed",
        retryable: false,
        reason: error.message,
        errcode: error.errcode,
        httpStatus: error.httpStatus,
      };
    }
    log.warn({ err: error }, "WeChat phone number request failed after retries");
    return {
      status: "failed",
      retryable: true,
      reason: "WECHAT_PHONE_NUMBER_RETRY_EXHAUSTED",
      errcode: error instanceof WechatRequestError ? error.errcode : undefined,
      httpStatus: error instanceof WechatRequestError ? error.httpStatus : undefined,
    };
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

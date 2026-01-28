// src/routes/auth.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import {
  generateJwtToken,
  persistWeChatUser,
  requestWxSession,
  requestWxPhoneNumber
} from "../services/authService";
import { maskPhoneNumber } from "../lib/logSanitizer";
import { ServiceError } from "../errors";
import config from "../config";
import prisma from "../db";

const LoginBodySchema = Type.Object({
  code: Type.String({ minLength: 1 }),
  phoneCode: Type.Optional(Type.String({ minLength: 1 })),
});

const authRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.post<{ Body: Static<typeof LoginBodySchema> }>(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: config.API_LOGIN_RATE_LIMIT_MAX,
          timeWindow: "1 minute",
        },
      },
      schema: {
        body: LoginBodySchema,
      },
    },
    async (request, reply) => {
      const { code, phoneCode } = request.body;

      // Step 1: Get WeChat session (openid, unionid)
      const session = await requestWxSession(code);

      // Step 2: If phoneCode provided, get phone number from WeChat
      let phoneNumber: string | undefined;
      if (phoneCode) {
        const phoneResult = await requestWxPhoneNumber(phoneCode);
        if (phoneResult.status === "ok") {
          phoneNumber = phoneResult.phoneNumber;
          // 安全日志：脱敏手机号
          request.log.info(
            { phoneNumber: maskPhoneNumber(phoneNumber) },
            "User authorized phone number"
          );
        } else if (phoneResult.retryable) {
          throw new ServiceError(
            "WECHAT_PHONE_NUMBER_UNAVAILABLE",
            "WeChat phone number unavailable, please retry",
            phoneResult,
          );
        } else {
          request.log.warn(
            { reason: phoneResult.reason, errcode: phoneResult.errcode },
            "Failed to fetch phone number despite phoneCode being provided",
          );
        }
      }

      // Step 3: Persist user with merge logic
      const user = await prisma.$transaction((tx) =>
        persistWeChatUser(tx, session, phoneNumber)
      );

      // Step 4: Generate JWT and respond
      const token = generateJwtToken(user);
      reply.send({
        token,
        userId: user.id,
        merged: user.status === 'REGISTERED' && phoneNumber !== undefined,
      });
    },
  );
};

export default authRoutes;

// src/routes/auth.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { generateJwtToken, persistWeChatUser, requestWxSession } from "../services/authService";
import config from "../config";
import prisma from "../db";

const LoginBodySchema = Type.Object({
  code: Type.String({ minLength: 1 }),
});

const TestAuthBodySchema = Type.Object({
  openId: Type.String({ minLength: 1 }),
  nickname: Type.Optional(Type.String()),
  avatarUrl: Type.Optional(Type.String()),
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
      const { code } = request.body;
      const session = await requestWxSession(code);
      const user = await prisma.$transaction((tx) => persistWeChatUser(tx, session));
      const token = generateJwtToken(user);
      reply.send({ token, userId: user.id });
    },
  );

  // Test-only endpoint for load testing and staging environments
  // SECURITY: This endpoint MUST be disabled in production
  if (config.NODE_ENV !== "production") {
    fastify.post<{ Body: Static<typeof TestAuthBodySchema> }>(
      "/api/auth/test-login",
      {
        schema: {
          body: TestAuthBodySchema,
        },
      },
      async (request, reply) => {
        const { openId, nickname, avatarUrl } = request.body;

        // Find or create test user
        const user = await prisma.user.upsert({
          where: { openid: openId },
          update: {
            nickname: nickname || "Test User",
            avatar_url: avatarUrl || "https://example.com/avatar.png",
          },
          create: {
            openid: openId,
            nickname: nickname || "Test User",
            avatar_url: avatarUrl || "https://example.com/avatar.png",
            role: "USER",
          },
        });

        const token = generateJwtToken(user);
        reply.send({ token, userId: user.id });
      },
    );
  }
};

export default authRoutes;

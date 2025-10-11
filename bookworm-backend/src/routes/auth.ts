// src/routes/auth.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { generateJwtToken, persistWeChatUser, requestWxSession } from "../services/authService";
import config from "../config";
import prisma from "../db";

const LoginBodySchema = Type.Object({
  code: Type.String({ minLength: 1 }),
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
};

export default authRoutes;
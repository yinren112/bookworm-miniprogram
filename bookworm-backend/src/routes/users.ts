// src/routes/users.ts
import { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";
import prisma from "../db";
import { sanitizeUser } from "../lib/logSanitizer";
import { userPublicView } from "../db/views";

const UserResponseSchema = Type.Object({
  id: Type.Integer(),
  role: Type.String(),
  createdAt: Type.String(),
  phone_number: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/users/me - 获取当前用户信息
  fastify.get(
    "/api/users/me",
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: {
          200: UserResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      request.log.debug({ userId }, 'Fetching user info from JWT');

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: userPublicView,
      });

      // 安全日志：脱敏用户数据
      request.log.debug(
        { user: sanitizeUser(user || undefined) },
        'User fetched from database'
      );

      if (!user) {
        return reply.code(404).send({
          code: "USER_NOT_FOUND",
          message: "User not found",
        });
      }

      const response = {
        id: user.id,
        role: user.role,
        createdAt: user.created_at.toISOString(),
        phone_number: user.phone_number,
      };

      // 注意：响应数据不需要脱敏（已由 Pino redaction 处理）
      request.log.debug('User info response prepared');

      return reply.send(response);
    }
  );
};

export default usersRoutes;

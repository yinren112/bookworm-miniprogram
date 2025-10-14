// src/routes/users.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import prisma from "../db";

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
      console.log('[DEBUG] /api/users/me - User ID from JWT:', userId);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          created_at: true,
          phone_number: true,
        },
      });

      console.log('[DEBUG] /api/users/me - User from database:', user);

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

      console.log('[DEBUG] /api/users/me - Response:', response);

      return reply.send(response);
    }
  );
};

export default usersRoutes;

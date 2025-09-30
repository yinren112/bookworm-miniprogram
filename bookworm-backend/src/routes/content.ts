// src/routes/content.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { getContentBySlug } from "../services/contentService";
import prisma from "../db";

const ContentParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
});

const contentRoutes: FastifyPluginAsync = async function (fastify) {
  // Content Management
  fastify.get<{ Params: Static<typeof ContentParamsSchema> }>(
    "/api/content/:slug",
    {
      schema: {
        params: ContentParamsSchema,
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const content = await getContentBySlug(prisma, slug);
      reply.send(content);
    }
  );
};

export default contentRoutes;

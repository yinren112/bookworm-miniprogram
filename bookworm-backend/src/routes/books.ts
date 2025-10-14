// src/routes/books.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { getBookMetadata } from "../services/bookMetadataService";
import { getRecommendedBooks } from "../services/bookService";
import { ApiError } from "../errors";
import prisma from "../db";

const BookMetaQuerySchema = Type.Object({
  isbn: Type.String({ minLength: 10, maxLength: 13 }),
});

const booksRoutes: FastifyPluginAsync = async function (fastify) {
  // Books metadata
  fastify.get<{ Querystring: Static<typeof BookMetaQuerySchema> }>(
    "/api/books/meta",
    {
      schema: {
        querystring: BookMetaQuerySchema,
      },
    },
    async (request, reply) => {
      const { isbn } = request.query;

      const metadata = await getBookMetadata(isbn);
      if (!metadata) {
        throw new ApiError(
          404,
          "Book metadata not found.",
          "BOOK_METADATA_NOT_FOUND",
        );
      }

      reply.send(metadata);
    }
  );

  // GET /api/books/recommendations - 获取个性化推荐书籍
  fastify.get(
    "/api/books/recommendations",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const recommendations = await getRecommendedBooks(prisma, userId);

      reply.send({
        recommendations,
        count: recommendations.length,
      });
    }
  );
};

export default booksRoutes;
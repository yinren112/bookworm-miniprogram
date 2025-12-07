// src/routes/books.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { getBookMetadata } from "../services/bookMetadataService";
import { getRecommendedBooks } from "../services/bookService";
import { ApiError } from "../errors";
import prisma from "../db";
import { ISBN13Schema } from "./sharedSchemas";

const BookMetaQuerySchema = Type.Object({
  isbn: ISBN13Schema,
});

const booksRoutes: FastifyPluginAsync = async function (fastify) {
  // PUBLIC ENDPOINT: Books metadata lookup
  // Rate-limited to prevent ISBN enumeration attacks
  fastify.get<{ Querystring: Static<typeof BookMetaQuerySchema> }>(
    "/api/books/meta",
    {
      schema: {
        querystring: BookMetaQuerySchema,
      },
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
          keyGenerator: (req) => req.ip,
        },
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
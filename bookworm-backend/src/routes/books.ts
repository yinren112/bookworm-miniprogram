// src/routes/books.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { getBookMetadata } from "../services/bookMetadataService";
import { ApiError } from "../errors";

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
};

export default booksRoutes;
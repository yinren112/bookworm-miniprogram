// src/routes/inventory.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import {
  getAvailableBooks,
  getBookById,
  persistInventoryItem,
} from "../services/inventoryService";
import { getBookMetadata } from "../services/bookMetadataService";
import { ApiError } from "../errors";
import config from "../config";
import prisma from "../db";

const ListAvailableQuery = Type.Object({
  search: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  page: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
});

const GetItemParamsSchema = Type.Object({
  id: Type.Number(),
});

const AddBookBody = Type.Object({
  isbn13: Type.String({ minLength: 10, maxLength: 13 }),
  title: Type.String({ minLength: 1 }),
  author: Type.Optional(Type.String()),
  edition: Type.Optional(Type.String()),
  condition: Type.Union([Type.Literal("NEW"), Type.Literal("GOOD"), Type.Literal("ACCEPTABLE")]),
  cost: Type.Number({ minimum: 0 }),
  selling_price: Type.Number({ minimum: 0 }),
});

const inventoryRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.get<{ Querystring: Static<typeof ListAvailableQuery> }>(
    "/api/inventory/available",
    { schema: { querystring: ListAvailableQuery } },
    async (request, reply) => {
      const { search, page, limit } = request.query;
      const books = await getAvailableBooks(prisma, { searchTerm: search, page, limit });
      reply.send(books);
    }
  );

  fastify.get<{ Params: Static<typeof GetItemParamsSchema> }>(
    "/api/inventory/item/:id",
    {
      schema: {
        params: GetItemParamsSchema,
      },
    },
    async (request, reply) => {
      const id = request.params.id;
      const book = await getBookById(prisma, id);
      if (!book) {
        throw new ApiError(404, "Book not found.", "BOOK_NOT_FOUND");
      }
      reply.send(book);
    },
  );

  fastify.post<{ Body: Static<typeof AddBookBody> }>(
    "/api/inventory/add",
    { preHandler: [fastify.authenticate, fastify.requireRole("STAFF")], schema: { body: AddBookBody } },
    async (request, reply) => {
      let metadata = null;
      try {
        metadata = await getBookMetadata(request.body.isbn13);
      } catch (error) {
        request.log.warn({ err: error }, "获取图书元数据失败，使用用户输入补全");
      }

      const newItem = await prisma.$transaction((tx) =>
        persistInventoryItem(tx, request.body, metadata),
      );
      reply.code(201).send(newItem);
    },
  );
};

export default inventoryRoutes;

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
import prisma from "../db";
import { ISBN13Schema } from "./sharedSchemas";

const ListAvailableQuery = Type.Object({
  search: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  page: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
});

const GetItemParamsSchema = Type.Object({
  id: Type.Number(),
});

// Linus式输入校验：在数据进入系统前就拒绝垃圾
const AddBookBody = Type.Object({
  // ISBN使用统一Schema
  isbn13: ISBN13Schema,
  // 书名不能超过500字符（数据库列通常有限制）
  title: Type.String({ minLength: 1, maxLength: 500 }),
  // 作者名不能超过200字符
  author: Type.Optional(Type.String({ maxLength: 200 })),
  // 版本不能超过100字符
  edition: Type.Optional(Type.String({ maxLength: 100 })),
  condition: Type.Union([Type.Literal("NEW"), Type.Literal("GOOD"), Type.Literal("ACCEPTABLE")]),
  // 成本和售价必须>0（分为单位，最大1000万分=10万元）
  cost: Type.Integer({ minimum: 1, maximum: 10000000 }),
  selling_price: Type.Integer({ minimum: 1, maximum: 10000000 }),
});

const inventoryRoutes: FastifyPluginAsync = async function (fastify) {
  // PUBLIC ENDPOINT: Intentionally unauthenticated for guest browsing
  // Rate-limited to prevent abuse
  fastify.get<{ Querystring: Static<typeof ListAvailableQuery> }>(
    "/api/inventory/available",
    {
      schema: { querystring: ListAvailableQuery },
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.ip,
        }
      }
    },
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

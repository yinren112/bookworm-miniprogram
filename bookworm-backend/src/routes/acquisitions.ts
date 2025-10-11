// src/routes/acquisitions.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import prisma from "../db";
import { createAcquisition, AcquisitionItemInput } from "../services/acquisitionService";

const CheckQuerySchema = Type.Object({
  isbn: Type.String({ minLength: 10, maxLength: 17 }),
});

const AcquisitionSkuSchema = Type.Object({
  skuId: Type.Integer(),
  edition: Type.Union([Type.String(), Type.Null()]),
  title: Type.String(),
  author: Type.Union([Type.String(), Type.Null()]),
  coverImageUrl: Type.Union([Type.String(), Type.Null()]),
  suggestedPrice: Type.Integer(), // 单位：分
});

const CheckResponseSchema = Type.Object({
  acquirableSkus: Type.Array(AcquisitionSkuSchema),
});

const CreateAcquisitionBodySchema = Type.Object({
  customerUserId: Type.Optional(Type.Integer({ minimum: 1 })),
  items: Type.Array(
    Type.Object({
      skuId: Type.Integer({ minimum: 1 }),
      condition: Type.Union([Type.Literal("NEW"), Type.Literal("GOOD"), Type.Literal("ACCEPTABLE")]),
      acquisitionPrice: Type.Integer({ minimum: 1 }), // 单位：分
    }),
    { minItems: 1 }
  ),
  settlementType: Type.Union([Type.Literal("CASH"), Type.Literal("VOUCHER")]),
  voucherCode: Type.Optional(Type.String({ maxLength: 255 })),
  notes: Type.Optional(Type.String({ maxLength: 1000 })),
});

type CreateAcquisitionBody = Static<typeof CreateAcquisitionBodySchema>;

const acquisitionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof CheckQuerySchema>;
  }>(
    "/api/acquisitions/check",
    {
      schema: {
        querystring: CheckQuerySchema,
        response: {
          200: CheckResponseSchema,
        },
      },
    },
    async (request) => {
      const rawIsbn = request.query.isbn;
      const normalizedIsbn = rawIsbn.replace(/[-\s]/g, "");

      const acquirableSkus = await prisma.bookSku.findMany({
        where: {
          is_acquirable: true,
          bookMaster: {
            isbn13: normalizedIsbn,
          },
        },
        include: {
          bookMaster: {
            select: {
              title: true,
              author: true,
              original_price: true,
            },
          },
        },
        orderBy: {
          id: "asc",
        },
      });

      // 计算建议收购价：原价的 30%，如果没有原价则默认 1000 分（10 元）
      const DEFAULT_SUGGESTED_PRICE = 1000; // 10 元
      const ACQUISITION_RATIO = 0.3;

      return {
        acquirableSkus: acquirableSkus.map((sku) => {
          const originalPrice = sku.bookMaster.original_price
            ? Number(sku.bookMaster.original_price)
            : null;

          const suggestedPrice = originalPrice
            ? Math.round(originalPrice * 100 * ACQUISITION_RATIO)
            : DEFAULT_SUGGESTED_PRICE;

          return {
            skuId: sku.id,
            edition: sku.edition ?? null,
            title: sku.bookMaster.title,
            author: sku.bookMaster.author ?? null,
            coverImageUrl: sku.cover_image_url ?? null,
            suggestedPrice,
          };
        }),
      };
    }
  );
};

export default acquisitionsRoutes;

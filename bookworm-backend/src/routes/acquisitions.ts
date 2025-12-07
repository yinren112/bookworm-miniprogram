// src/routes/acquisitions.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import prisma from "../db";
import { createAcquisition } from "../services/acquisitionService";
import { PhoneNumberSchema, ISBN13Schema } from "./sharedSchemas";
import { bookSkuWithMasterInclude } from "../db/views";

const CheckQuerySchema = Type.Object({
  isbn: ISBN13Schema,
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

const CustomerProfileSchema = Type.Object({
  phoneNumber: Type.Optional(PhoneNumberSchema),
  enrollmentYear: Type.Optional(Type.Integer({ minimum: 2000, maximum: 2100 })),
  major: Type.Optional(Type.String({ maxLength: 100 })),
  className: Type.Optional(Type.String({ maxLength: 50 })),
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
  customerProfile: Type.Optional(CustomerProfileSchema),
});

type CreateAcquisitionBody = Static<typeof CreateAcquisitionBodySchema>;

const acquisitionsRoutes: FastifyPluginAsync = async (fastify) => {
  // PUBLIC ENDPOINT: Allows customers to check acquisition eligibility
  // Rate-limited to prevent ISBN enumeration attacks
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
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.ip,
        }
      }
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
        include: bookSkuWithMasterInclude,
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

  // POST /api/acquisitions - 创建收购记录
  fastify.post<{
    Body: CreateAcquisitionBody;
  }>(
    "/api/acquisitions",
    {
      preHandler: [fastify.authenticate, fastify.requireRole("STAFF")],
      schema: {
        body: CreateAcquisitionBodySchema,
      },
    },
    async (request, reply) => {
      const staffUserId = request.user!.userId;
      const body = request.body;

      const acquisition = await createAcquisition(prisma, {
        staffUserId,
        customerUserId: body.customerUserId,
        items: body.items,
        settlementType: body.settlementType,
        voucherCode: body.voucherCode,
        notes: body.notes,
        customerProfile: body.customerProfile,
      });

      return reply.code(201).send(acquisition);
    }
  );
};

export default acquisitionsRoutes;

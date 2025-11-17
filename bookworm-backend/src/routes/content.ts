// src/routes/content.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { getContentBySlug } from "../services/contentService";
import { fetchProxiedImage } from "../services/imageProxyService";
import { ApiError, ServiceError } from "../errors";
import prisma from "../db";

const ContentParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
});

const ImageProxyQuerySchema = Type.Object({
  url: Type.String({ format: "uri" }),
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

  fastify.get<{ Querystring: Static<typeof ImageProxyQuerySchema> }>(
    "/api/content/proxy-image",
    {
      schema: {
        querystring: ImageProxyQuerySchema,
      },
    },
    async (request, reply) => {
      const { url } = request.query;
      try {
        const result = await fetchProxiedImage(url);

        if (result.contentType) {
          reply.header("Content-Type", result.contentType);
        }
        if (result.contentLength) {
          reply.header("Content-Length", result.contentLength);
        }
        if (result.cacheControl) {
          reply.header("Cache-Control", result.cacheControl);
        } else {
          reply.header("Cache-Control", "public, max-age=3600");
        }
        if (result.etag) {
          reply.header("ETag", result.etag);
        }
        if (result.lastModified) {
          reply.header("Last-Modified", result.lastModified);
        }
        reply.header(
          "X-Proxy-Upstream-Status",
          result.upstreamStatus.toString(),
        );

        return reply.send(result.stream);
      } catch (error) {
        if (error instanceof ServiceError) {
          throw new ApiError(400, error.message, error.code);
        }
        request.log.error(error, "Proxy image fetch failed");
        throw new ApiError(
          502,
          "Upstream image fetch failed",
          "IMAGE_PROXY_UNEXPECTED_ERROR",
        );
      }
    }
  );
};

export default contentRoutes;

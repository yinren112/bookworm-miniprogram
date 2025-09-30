// src/plugins.ts
import { FastifyInstance } from "fastify";
import * as path from "path";
import fastifyStatic from "@fastify/static";
import authPlugin from "./plugins/auth";
import metricsPlugin from "./plugins/metrics";
import fastifyRawBody from "fastify-raw-body";
import rateLimit from "@fastify/rate-limit";

export async function registerPlugins(fastify: FastifyInstance): Promise<void> {
  // Register plugins first - MUST be awaited in correct order
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, "..", "public"),
    prefix: "/admin/",
  });
  await fastify.register(authPlugin);
  await fastify.register(metricsPlugin);
  await fastify.register(fastifyRawBody, {
    field: "rawBody",
    global: false, // 只在需要的路由上启用
    encoding: "utf8",
    runFirst: true,
  });
  await fastify.register(rateLimit, {
    global: false, // 我们按路由单独配置
  });
}
// src/routes/health.ts
import { FastifyPluginAsync } from "fastify";
import prisma from "../db";

const healthRoutes: FastifyPluginAsync = async function (fastify) {
  // Health Check Endpoint
  fastify.get("/api/health", async (request, reply) => {
    const checks: { [key: string]: string } = {};
    let allHealthy = true;

    // Database connectivity check
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch (error) {
      request.log.error(error, "Database health check failed");
      checks.database = "failed";
      allHealthy = false;
    }

    if (allHealthy) {
      reply.send({
        status: "ok",
        timestamp: new Date().toISOString(),
        checks,
      });
    } else {
      reply.code(503).send({
        status: "error",
        timestamp: new Date().toISOString(),
        checks,
      });
    }
  });
};

export default healthRoutes;
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { createTestApp } from "../app-factory";
import { getPrismaClientForWorker } from "./globalSetup";

const ENDPOINT = "/api/acquisitions/check";

describe("Acquisitions Allowlist API", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("返回可收购版本列表", async () => {
    const isbn = "9781234567897";
    const master = await prisma.bookMaster.create({
      data: {
        isbn13: isbn,
        title: "Allowlist Sample",
      },
    });

    await prisma.bookSku.create({
      data: {
        master_id: master.id,
        edition: "Hardcover",
        is_acquirable: true,
      },
    });

    await prisma.bookSku.create({
      data: {
        master_id: master.id,
        edition: "Paperback",
        is_acquirable: false,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `${ENDPOINT}?isbn=${isbn}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.acquirableSkus).toBeDefined();
    expect(Array.isArray(body.acquirableSkus)).toBe(true);
    expect(body.acquirableSkus.length).toBe(1);
    expect(body.acquirableSkus[0].edition).toBe("Hardcover");
  });

  it("查询非白名单ISBN时返回空数组", async () => {
    const response = await app.inject({
      method: "GET",
      url: `${ENDPOINT}?isbn=9781234567898`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.acquirableSkus).toEqual([]);
  });
});

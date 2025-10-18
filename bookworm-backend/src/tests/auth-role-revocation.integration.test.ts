// src/tests/auth-role-revocation.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";
import { createTestApp } from "../app-factory";
import { PrismaClient } from "@prisma/client";

describe("Auth: Role Revocation Integration Tests", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should immediately deny access after a user role is demoted from STAFF to USER", { timeout: 20000 }, async () => {
    // 1. Create a STAFF user and get their token
    const { userId: staffUserId, token: staffToken } = await createTestUser("STAFF");

    // 2. Verify they can access a STAFF-only endpoint (e.g., /api/inventory/add)
    const initialResponse = await app.inject({
      method: "POST",
      url: "/api/inventory/add",
      headers: { Authorization: `Bearer ${staffToken}` },
      payload: {
        isbn13: "9780134685991",
        title: "Test Book",
        author: "Test Author",
        condition: "GOOD",
        cost: 5000, // 50 yuan = 5000 cents
        selling_price: 8000, // 80 yuan = 8000 cents
      },
    });

    // We expect a 201 Created because the STAFF user should be able to add inventory
    expect(initialResponse.statusCode).toBe(201);

    // 3. Demote the user's role directly in the database
    await prisma.user.update({
      where: { id: staffUserId },
      data: { role: "USER" },
    });

    // 4. Immediately try to access the same endpoint again with the SAME old token
    const afterDemotionResponse = await app.inject({
      method: "POST",
      url: "/api/inventory/add",
      headers: { Authorization: `Bearer ${staffToken}` },
      payload: {
        isbn13: "9780134685992",
        title: "Another Test Book",
        author: "Test Author",
        condition: "GOOD",
        cost: 5000, // 50 yuan = 5000 cents
        selling_price: 8000, // 80 yuan = 8000 cents
      },
    });

    // 5. Assert that access is now FORBIDDEN
    expect(afterDemotionResponse.statusCode).toBe(403);
    const errorBody = JSON.parse(afterDemotionResponse.payload);
    expect(errorBody.code).toBe("FORBIDDEN");
  });

  it("should immediately grant access after a user role is promoted from USER to STAFF", { timeout: 20000 }, async () => {
    // 1. Create a USER and get their token
    const { userId, token } = await createTestUser("USER");

    // 2. Verify they CANNOT access a STAFF-only endpoint initially
    const initialResponse = await app.inject({
      method: "POST",
      url: "/api/inventory/add",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        isbn13: "9780134685993",
        title: "Test Book",
        author: "Test Author",
        condition: "GOOD",
        cost: 5000, // 50 yuan = 5000 cents
        selling_price: 8000, // 80 yuan = 8000 cents
      },
    });

    expect(initialResponse.statusCode).toBe(403);

    // 3. Promote the user's role directly in the database
    await prisma.user.update({
      where: { id: userId },
      data: { role: "STAFF" },
    });

    // 4. Immediately try to access the same endpoint again with the SAME old token
    const afterPromotionResponse = await app.inject({
      method: "POST",
      url: "/api/inventory/add",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        isbn13: "9780134685994",
        title: "Another Test Book",
        author: "Test Author",
        condition: "GOOD",
        cost: 5000, // 50 yuan = 5000 cents
        selling_price: 8000, // 80 yuan = 8000 cents
      },
    });

    // 5. Assert that access is now GRANTED
    expect(afterPromotionResponse.statusCode).toBe(201);
  });

  it("should enforce role check on every request, not just once per token", { timeout: 20000 }, async () => {
    // This test ensures that the role is checked on EVERY request, not cached
    const { userId, token } = await createTestUser("STAFF");

    // 1. First request should succeed (STAFF role)
    const firstResponse = await app.inject({
      method: "POST",
      url: "/api/inventory/add",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        isbn13: "9780134685995",
        title: "Test Book 1",
        author: "Test Author",
        condition: "GOOD",
        cost: 5000, // 50 yuan = 5000 cents
        selling_price: 8000, // 80 yuan = 8000 cents
      },
    });
    expect(firstResponse.statusCode).toBe(201);

    // 2. Demote to USER
    await prisma.user.update({
      where: { id: userId },
      data: { role: "USER" },
    });

    // 3. Second request should fail (USER role)
    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/inventory/add",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        isbn13: "9780134685996",
        title: "Test Book 2",
        author: "Test Author",
        condition: "GOOD",
        cost: 5000, // 50 yuan = 5000 cents
        selling_price: 8000, // 80 yuan = 8000 cents
      },
    });
    expect(secondResponse.statusCode).toBe(403);

    // 4. Promote back to STAFF
    await prisma.user.update({
      where: { id: userId },
      data: { role: "STAFF" },
    });

    // 5. Third request should succeed again (STAFF role)
    const thirdResponse = await app.inject({
      method: "POST",
      url: "/api/inventory/add",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        isbn13: "9780134685997",
        title: "Test Book 3",
        author: "Test Author",
        condition: "GOOD",
        cost: 5000, // 50 yuan = 5000 cents
        selling_price: 8000, // 80 yuan = 8000 cents
      },
    });
    expect(thirdResponse.statusCode).toBe(201);
  });
});

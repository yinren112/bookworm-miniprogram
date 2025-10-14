// src/tests/user-merge.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getPrismaClientForWorker } from "./globalSetup";
import { persistWeChatUser } from "../services/authService";

describe("User Account Merge", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.user.deleteMany({
      where: {
        phone_number: {
          in: ["13800138888", "13900139999", "13700137777", "13600136666"],
        },
      },
    });
  });

  it("should merge PRE_REGISTERED user with WeChat account when phone numbers match", async () => {
    // SETUP: Create a PRE_REGISTERED user (simulating sell order flow)
    const phoneNumber = "13800138888";
    const preRegisteredUser = await prisma.user.create({
      data: {
        phone_number: phoneNumber,
        openid: `placeholder_${phoneNumber}_${Date.now()}`,
        role: "USER",
        status: "PRE_REGISTERED",
      },
    });

    expect(preRegisteredUser.status).toBe("PRE_REGISTERED");
    expect(preRegisteredUser.phone_number).toBe(phoneNumber);
    expect(preRegisteredUser.openid).toContain("placeholder");

    // ACTION: Simulate WeChat login with phone number authorization
    const realOpenid = "wx_real_openid_123";

    const mergedUser = await prisma.$transaction(async (tx) => {
      return await persistWeChatUser(tx, { openid: realOpenid }, phoneNumber);
    });

    // ASSERTION: User should be merged (same ID, updated openid, status changed)
    expect(mergedUser.id).toBe(preRegisteredUser.id); // Same user
    expect(mergedUser.openid).toBe(realOpenid); // Updated to real openid
    expect(mergedUser.status).toBe("REGISTERED"); // Status upgraded
    expect(mergedUser.phone_number).toBe(phoneNumber); // Phone number preserved

    // Verify no duplicate users were created
    const allUsers = await prisma.user.findMany({
      where: {
        OR: [{ phone_number: phoneNumber }, { openid: realOpenid }],
      },
    });

    expect(allUsers).toHaveLength(1);
    expect(allUsers[0].id).toBe(preRegisteredUser.id);
  });

  it("should create new user when phone number doesn't match any PRE_REGISTERED account", async () => {
    // SETUP: No pre-existing user
    const newPhoneNumber = "13900139999";
    const newOpenid = "wx_new_openid_456";

    // ACTION: WeChat login with phone authorization
    const newUser = await prisma.$transaction(async (tx) => {
      return await persistWeChatUser(tx, { openid: newOpenid }, newPhoneNumber);
    });

    // ASSERTION: New user created with REGISTERED status
    expect(newUser.openid).toBe(newOpenid);
    expect(newUser.phone_number).toBe(newPhoneNumber);
    expect(newUser.status).toBe("REGISTERED");
    expect(newUser.openid).not.toContain("placeholder");
  });

  it("should not merge if existing account has same openid but different phone", async () => {
    // SETUP: Create a user with real openid
    const existingOpenid = "wx_existing_789";
    const existingPhone = "13700137777";
    const existingUser = await prisma.user.create({
      data: {
        openid: existingOpenid,
        phone_number: existingPhone,
        role: "USER",
        status: "REGISTERED",
      },
    });

    // ACTION: Same user logs in again but with different phone number
    const newPhoneNumber = "13700137778"; // Different phone

    const resultUser = await prisma.$transaction(async (tx) => {
      return await persistWeChatUser(tx, { openid: existingOpenid }, newPhoneNumber);
    });

    // ASSERTION: Should return existing user without changing phone (openid takes precedence)
    expect(resultUser.id).toBe(existingUser.id);
    expect(resultUser.openid).toBe(existingOpenid);
    expect(resultUser.phone_number).toBe(existingPhone); // Original phone preserved
  });

  it("should handle login without phone authorization (legacy flow)", async () => {
    // ACTION: WeChat login without phone code
    const openidOnly = "wx_no_phone_111";

    const user = await prisma.$transaction(async (tx) => {
      return await persistWeChatUser(
        tx,
        { openid: openidOnly }
        // No phoneNumber parameter
      );
    });

    // ASSERTION: User created with no phone number
    expect(user.openid).toBe(openidOnly);
    expect(user.phone_number).toBeNull();
    expect(user.status).toBe("REGISTERED"); // Still REGISTERED (not PRE_REGISTERED)
  });

  it("should preserve unionid during merge", async () => {
    // SETUP: PRE_REGISTERED user with phone
    const phoneNumber = "13600136666";
    const preRegisteredUser = await prisma.user.create({
      data: {
        phone_number: phoneNumber,
        openid: `placeholder_${phoneNumber}_${Date.now()}`,
        role: "USER",
        status: "PRE_REGISTERED",
      },
    });

    // ACTION: Login with both openid and unionid
    const realOpenid = "wx_openid_with_union";
    const unionid = "union_id_999";

    const mergedUser = await prisma.$transaction(async (tx) => {
      return await persistWeChatUser(tx, { openid: realOpenid, unionid }, phoneNumber);
    });

    // ASSERTION: Both openid and unionid should be updated
    expect(mergedUser.id).toBe(preRegisteredUser.id);
    expect(mergedUser.openid).toBe(realOpenid);
    expect(mergedUser.unionid).toBe(unionid);
    expect(mergedUser.status).toBe("REGISTERED");
  });
});

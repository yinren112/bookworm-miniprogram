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
    // Note: Since we use isolated test containers (Testcontainers),
    // cleanup is not strictly necessary as the container is destroyed after tests.
    // We attempt cleanup for good practice but ignore any errors.
    try {
      await prisma.bookMaster.deleteMany({
        where: { isbn13: "9780000000001" },
      });
    } catch {
      // Ignore - container will be destroyed anyway
    }

    try {
      await prisma.user.deleteMany({
        where: {
          OR: [
            {
              phone_number: {
                in: [
                  "13800138888",
                  "13900139999",
                  "13700137777",
                  "13600136666",
                  "13500135555",
                  "13400134444",
                  "13300133333",
                ],
              },
            },
            { openid: { in: ["wx_staff_for_test", "wx_staff_cascade_test"] } },
          ],
        },
      });
    } catch {
      // Ignore - container will be destroyed anyway
    }
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

  it("should handle CONFLICT: openid already used by REGISTERED user", async () => {
    // SCENARIO:
    // - User A (PRE_REGISTERED, phone=135..., openid=placeholder)
    // - User B (REGISTERED, phone=null, openid=wx_conflict_openid)
    // - WeChat login with phone=135... and openid=wx_conflict_openid
    // EXPECTED: Merge into user B, transfer data from A, delete A

    const phoneNumber = "13500135555";
    const conflictingOpenid = "wx_conflict_openid_123";

    // SETUP: Create REGISTERED user with openid (no phone)
    const registeredUser = await prisma.user.create({
      data: {
        openid: conflictingOpenid,
        phone_number: null,
        role: "USER",
        status: "REGISTERED",
      },
    });

    // SETUP: Create PRE_REGISTERED user with phone
    const preRegisteredUser = await prisma.user.create({
      data: {
        phone_number: phoneNumber,
        openid: `placeholder_${phoneNumber}_${Date.now()}`,
        role: "USER",
        status: "PRE_REGISTERED",
      },
    });

    // SETUP: Create a staff user for the acquisition
    const staffUser = await prisma.user.create({
      data: {
        openid: "wx_staff_for_test",
        role: "STAFF",
        status: "REGISTERED",
      },
    });

    // SETUP: Create acquisition linked to PRE_REGISTERED user
    const acquisition = await prisma.acquisition.create({
      data: {
        staff_user_id: staffUser.id,
        customer_user_id: preRegisteredUser.id,
        total_value: 300, // 1.5kg * 200 cents/kg = 300 cents
        item_count: 1,
        settlement_type: "CASH",
      },
    });

    // ACTION: WeChat login with conflicting openid + phone
    const mergedUser = await prisma.$transaction(async (tx) => {
      return await persistWeChatUser(
        tx,
        { openid: conflictingOpenid },
        phoneNumber
      );
    });

    // ASSERTION: Should return REGISTERED user (not PRE_REGISTERED)
    expect(mergedUser.id).toBe(registeredUser.id);
    expect(mergedUser.openid).toBe(conflictingOpenid);
    expect(mergedUser.phone_number).toBe(phoneNumber); // Phone transferred
    expect(mergedUser.status).toBe("REGISTERED");

    // ASSERTION: PRE_REGISTERED user should be deleted
    const deletedUser = await prisma.user.findUnique({
      where: { id: preRegisteredUser.id },
    });
    expect(deletedUser).toBeNull();

    // ASSERTION: Acquisition ownership transferred to REGISTERED user
    const updatedAcquisition = await prisma.acquisition.findUnique({
      where: { id: acquisition.id },
    });
    expect(updatedAcquisition!.customer_user_id).toBe(registeredUser.id);

    // ASSERTION: Only one user with this phone/openid exists
    const allUsers = await prisma.user.findMany({
      where: {
        OR: [{ phone_number: phoneNumber }, { openid: conflictingOpenid }],
      },
    });
    expect(allUsers).toHaveLength(1);
  });

  it("should transfer ALL associated records during CONFLICT merge", async () => {
    // SCENARIO:
    // - User A (PRE_REGISTERED) has: Order, PendingPaymentOrder, Acquisition, UserProfile
    // - User B (REGISTERED) exists with same openid
    // - WeChat login triggers merge: all A's records → B, then delete A
    // PURPOSE: Verify no foreign key violations and complete data transfer

    const phoneNumber = "13300133333";
    const conflictingOpenid = "wx_full_cascade_test";

    // SETUP: Create REGISTERED user (target of merge)
    const registeredUser = await prisma.user.create({
      data: {
        openid: conflictingOpenid,
        phone_number: null,
        role: "USER",
        status: "REGISTERED",
      },
    });

    // SETUP: Create PRE_REGISTERED user (source of merge)
    const preRegisteredUser = await prisma.user.create({
      data: {
        phone_number: phoneNumber,
        openid: `placeholder_${phoneNumber}_${Date.now()}`,
        role: "USER",
        status: "PRE_REGISTERED",
      },
    });

    // SETUP: Create staff user for acquisition
    const staffUser = await prisma.user.create({
      data: {
        openid: "wx_staff_cascade_test",
        role: "STAFF",
        status: "REGISTERED",
      },
    });

    // SETUP: Create a book for order testing
    const bookMaster = await prisma.bookMaster.create({
      data: {
        isbn13: "9780000000001",
        title: "Cascade Test Book",
        author: "Test Author",
        publisher: "Test Publisher",
        original_price: 10000, // 100 yuan = 10000 cents
      },
    });

    const bookSku = await prisma.bookSku.create({
      data: {
        master_id: bookMaster.id,
        edition: "1st Edition",
        is_acquirable: true,
      },
    });

    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        sku_id: bookSku.id,
        condition: "GOOD",
        cost: 3000, // 30 yuan = 3000 cents
        selling_price: 5000, // 50 yuan = 5000 cents
        status: "reserved",
      },
    });

    // SETUP: Create Order linked to PRE_REGISTERED user
    // Note: PendingPaymentOrder will be automatically created by database trigger
    // when Order status is PENDING_PAYMENT
    const order = await prisma.order.create({
      data: {
        user_id: preRegisteredUser.id,
        status: "PENDING_PAYMENT",
        total_amount: 5000, // 50 yuan = 5000 cents
        pickup_code: "CASCADETEST01",
        paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // SETUP: Create OrderItem
    await prisma.orderItem.create({
      data: {
        order_id: order.id,
        inventory_item_id: inventoryItem.id,
        price: 5000, // 50 yuan = 5000 cents
      },
    });

    // SETUP: Create Acquisition linked to PRE_REGISTERED user
    const acquisition = await prisma.acquisition.create({
      data: {
        staff_user_id: staffUser.id,
        customer_user_id: preRegisteredUser.id,
        total_value: 300,
        item_count: 1,
        settlement_type: "CASH",
      },
    });

    // SETUP: Create UserProfile for PRE_REGISTERED user
    const userProfile = await prisma.userProfile.create({
      data: {
        user_id: preRegisteredUser.id,
        enrollment_year: 2023,
        major: "Computer Science",
        class_name: "CS-2023-01",
      },
    });

    // ACTION: WeChat login triggers cascade merge
    const mergedUser = await prisma.$transaction(async (tx) => {
      return await persistWeChatUser(
        tx,
        { openid: conflictingOpenid },
        phoneNumber
      );
    });

    // ASSERTION 1: Merged into REGISTERED user
    expect(mergedUser.id).toBe(registeredUser.id);
    expect(mergedUser.phone_number).toBe(phoneNumber);
    expect(mergedUser.status).toBe("REGISTERED");

    // ASSERTION 2: PRE_REGISTERED user deleted
    const deletedUser = await prisma.user.findUnique({
      where: { id: preRegisteredUser.id },
    });
    expect(deletedUser).toBeNull();

    // ASSERTION 3: Order transferred
    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(updatedOrder!.user_id).toBe(registeredUser.id);

    // ASSERTION 4: PendingPaymentOrder transferred
    const updatedPendingOrder = await prisma.pendingPaymentOrder.findUnique({
      where: { order_id: order.id },
    });
    expect(updatedPendingOrder!.user_id).toBe(registeredUser.id);

    // ASSERTION 5: Acquisition transferred
    const updatedAcquisition = await prisma.acquisition.findUnique({
      where: { id: acquisition.id },
    });
    expect(updatedAcquisition!.customer_user_id).toBe(registeredUser.id);

    // ASSERTION 6: UserProfile transferred
    const updatedProfile = await prisma.userProfile.findUnique({
      where: { user_id: registeredUser.id },
    });
    expect(updatedProfile).not.toBeNull();
    expect(updatedProfile!.enrollment_year).toBe(2023);
    expect(updatedProfile!.major).toBe("Computer Science");

    // ASSERTION 7: No orphaned records
    const orphanedOrders = await prisma.order.findMany({
      where: { user_id: preRegisteredUser.id },
    });
    expect(orphanedOrders).toHaveLength(0);
  });

  it("should handle CONFLICT: both phone and openid already used by REGISTERED user", async () => {
    // SCENARIO:
    // - User A (PRE_REGISTERED, phone=134..., openid=placeholder)
    // - User B (REGISTERED, phone=456..., openid=wx_double_conflict)
    // - WeChat login with phone=134... and openid=wx_double_conflict
    // EXPECTED: Merge into user B, transfer phone from A, delete A

    const preRegPhone = "13400134444";
    const registeredPhone = "13400134555"; // Different phone
    const conflictingOpenid = "wx_double_conflict_456";

    // SETUP: Create REGISTERED user with openid and DIFFERENT phone
    const registeredUser = await prisma.user.create({
      data: {
        openid: conflictingOpenid,
        phone_number: registeredPhone,
        role: "USER",
        status: "REGISTERED",
      },
    });

    // SETUP: Create PRE_REGISTERED user with DIFFERENT phone
    const preRegisteredUser = await prisma.user.create({
      data: {
        phone_number: preRegPhone,
        openid: `placeholder_${preRegPhone}_${Date.now()}`,
        role: "USER",
        status: "PRE_REGISTERED",
      },
    });

    // ACTION: WeChat login with PRE_REGISTERED phone + REGISTERED openid
    const mergedUser = await prisma.$transaction(async (tx) => {
      return await persistWeChatUser(
        tx,
        { openid: conflictingOpenid },
        preRegPhone
      );
    });

    // ASSERTION: Should return REGISTERED user (not PRE_REGISTERED)
    expect(mergedUser.id).toBe(registeredUser.id);
    expect(mergedUser.openid).toBe(conflictingOpenid);
    // Phone should NOT be updated because openid takes precedence
    expect(mergedUser.phone_number).toBe(registeredPhone);
    expect(mergedUser.status).toBe("REGISTERED");

    // ASSERTION: PRE_REGISTERED user should be deleted
    const deletedUser = await prisma.user.findUnique({
      where: { id: preRegisteredUser.id },
    });
    expect(deletedUser).toBeNull();

    // ASSERTION: Only one user with this openid exists
    const allUsers = await prisma.user.findMany({
      where: {
        openid: conflictingOpenid,
      },
    });
    expect(allUsers).toHaveLength(1);
  });
});

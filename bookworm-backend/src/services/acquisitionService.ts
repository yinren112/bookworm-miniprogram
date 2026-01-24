import { Prisma, PrismaClient, SettlementType } from "@prisma/client";
import { ApiError } from "../errors";
import { withTxRetry } from "../db/transaction";
import { BUSINESS_LIMITS } from "../constants";
import { userIdOnlyView, acquisitionDetailInclude, acquisitionListInclude } from "../db/views";

/**
 * 单个待收购书籍的信息
 */
export interface AcquisitionItemInput {
  skuId: number;
  condition: "NEW" | "GOOD" | "ACCEPTABLE";
  acquisitionPrice: number; // 单位：分
}

/**
 * 用户画像信息（收购时收集）
 */
export interface CustomerProfileInput {
  phoneNumber?: string;
  enrollmentYear?: number;
  major?: string;
  className?: string;
}

/**
 * 创建收购记录的输入参数
 */
export interface CreateAcquisitionInput {
  staffUserId: number;
  customerUserId?: number;
  items: AcquisitionItemInput[];
  settlementType: SettlementType;
  voucherCode?: string;
  notes?: string;
  customerProfile?: CustomerProfileInput;
}

/**
 * 创建收购记录的返回结果
 */
export interface CreateAcquisitionResult {
  id: number;
  staff_user_id: number | null;
  web_staff_id: number | null;
  customer_user_id: number | null;
  total_value: number;
  item_count: number;
  settlement_type: SettlementType;
  voucher_code: string | null;
  notes: string | null;
  created_at: Date;
}

/**
 * 实现层：在事务中创建收购记录和库存项
 */
async function createAcquisitionImpl(
  tx: Prisma.TransactionClient,
  dbCtx: PrismaClient,
  input: CreateAcquisitionInput,
): Promise<CreateAcquisitionResult> {
  // 验证输入
  if (input.items.length === 0) {
    throw new ApiError(400, "收购书籍列表不能为空", "EMPTY_ACQUISITION_ITEMS");
  }

  if (input.items.length > BUSINESS_LIMITS.MAX_ACQUISITION_ITEMS) {
    throw new ApiError(
      400,
      `单次收购最多 ${BUSINESS_LIMITS.MAX_ACQUISITION_ITEMS} 本`,
      "ACQUISITION_SIZE_EXCEEDED",
    );
  }

  // 验证所有价格都是正数
  for (const item of input.items) {
    if (item.acquisitionPrice <= 0) {
      throw new ApiError(400, "收购价格必须大于零", "INVALID_ACQUISITION_PRICE");
    }
  }

  // 计算总价值和总数量
  const totalValue = input.items.reduce((sum, item) => sum + item.acquisitionPrice, 0);
  const itemCount = input.items.length;

  // 创建 Acquisition 记录
  const acquisition = await tx.acquisition.create({
    data: {
      staff_user_id: input.staffUserId,
      customer_user_id: input.customerUserId ?? null,
      total_value: totalValue,
      item_count: itemCount,
      settlement_type: input.settlementType,
      voucher_code: input.voucherCode ?? null,
      notes: input.notes ?? null,
    },
  });

  // 如果提供了用户画像信息，则创建或更新 UserProfile
  if (input.customerProfile && input.customerUserId) {
    // 如果提供了手机号，更新 User 表（单一真相源）
    if (input.customerProfile.phoneNumber) {
      // Try-update pattern: 直接尝试更新，捕获唯一约束冲突
      // 这比 check-then-act 更安全，避免了竞态条件
      try {
        await tx.user.update({
          where: { id: input.customerUserId },
          data: { phone_number: input.customerProfile.phoneNumber },
        });
      } catch (error: unknown) {
        // 捕获唯一约束违反错误 (P2002)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          // 手机号被占用，检查是被谁占用
          // 注意：不能使用失败的事务对象（tx），必须使用独立的dbCtx
          const conflictingUser = await dbCtx.user.findUnique({
            where: { phone_number: input.customerProfile.phoneNumber },
            select: userIdOnlyView,
          });

          // 如果手机号被其他用户占用，抛出 409 错误
          if (conflictingUser && conflictingUser.id !== input.customerUserId) {
            throw new ApiError(
              409,
              `手机号 ${input.customerProfile.phoneNumber} 已被其他用户占用`,
              "PHONE_NUMBER_CONFLICT"
            );
          }

          // 如果手机号被当前用户占用（说明手机号没变化），忽略错误继续
          // 这种情况通常不会发生，因为 update 不会在值相同时触发唯一约束
        } else {
          // 其他错误，重新抛出
          throw error;
        }
      }
    }

    // 更新 UserProfile（不包含 phone_number）
    await tx.userProfile.upsert({
      where: { user_id: input.customerUserId },
      create: {
        user_id: input.customerUserId,
        enrollment_year: input.customerProfile.enrollmentYear ?? null,
        major: input.customerProfile.major ?? null,
        class_name: input.customerProfile.className ?? null,
      },
      update: {
        enrollment_year: input.customerProfile.enrollmentYear ?? null,
        major: input.customerProfile.major ?? null,
        class_name: input.customerProfile.className ?? null,
        updated_at: new Date(),
      },
    });
  }

  // 批量创建 InventoryItem 记录
  // 注意：我们使用 createMany 进行批量插入以提高性能
  await tx.inventoryItem.createMany({
    data: input.items.map((item) => ({
      sku_id: item.skuId,
      condition: item.condition,
      cost: item.acquisitionPrice, // 直接使用分作为单位
      selling_price: item.acquisitionPrice, // 初始售价等于成本价（单位：分）
      status: "in_stock" as const,
      acquisitionId: acquisition.id,
    })),
  });

  return acquisition;
}

/**
 * 服务层：创建收购记录（包含事务重试逻辑）
 */
export function createAcquisition(
  dbCtx: PrismaClient,
  input: CreateAcquisitionInput,
): Promise<CreateAcquisitionResult> {
  return withTxRetry(
    dbCtx,
    (tx) => createAcquisitionImpl(tx, dbCtx, input),
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      transactionOptions: {
        timeout: BUSINESS_LIMITS.TRANSACTION_TIMEOUT_MS,
      },
    },
  );
}

/**
 * 获取收购记录详情（包含关联的库存项）
 */
export async function getAcquisitionById(
  dbCtx: PrismaClient,
  acquisitionId: number,
) {
  const acquisition = await dbCtx.acquisition.findUnique({
    where: { id: acquisitionId },
    include: acquisitionDetailInclude,
  });

  if (!acquisition) {
    throw new ApiError(404, "收购记录不存在", "ACQUISITION_NOT_FOUND");
  }

  return acquisition;
}

/**
 * 获取指定员工的收购记录列表
 */
export async function getAcquisitionsByStaff(
  dbCtx: PrismaClient,
  staffUserId: number,
  limit: number = 20,
  offset: number = 0,
) {
  const acquisitions = await dbCtx.acquisition.findMany({
    where: { staff_user_id: staffUserId },
    include: acquisitionListInclude,
    orderBy: { created_at: "desc" },
    take: limit,
    skip: offset,
  });

  return acquisitions;
}

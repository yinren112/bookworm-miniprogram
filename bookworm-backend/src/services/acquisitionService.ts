import { Prisma, PrismaClient, Acquisition, SettlementType } from "@prisma/client";
import { ApiError } from "../errors";
import { withTxRetry } from "./orderService";
import { BUSINESS_LIMITS, ERROR_CODES, ERROR_MESSAGES } from "../constants";

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
  staff_user_id: number;
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
    await tx.userProfile.upsert({
      where: { user_id: input.customerUserId },
      create: {
        user_id: input.customerUserId,
        phone_number: input.customerProfile.phoneNumber ?? null,
        enrollment_year: input.customerProfile.enrollmentYear ?? null,
        major: input.customerProfile.major ?? null,
        class_name: input.customerProfile.className ?? null,
      },
      update: {
        phone_number: input.customerProfile.phoneNumber ?? null,
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
      cost: item.acquisitionPrice / 100, // 转换为元，Decimal 格式
      selling_price: item.acquisitionPrice / 100, // 初始售价等于成本价
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
  return withTxRetry(async () => {
    return dbCtx.$transaction(
      (tx) => createAcquisitionImpl(tx, input),
      {
        timeout: BUSINESS_LIMITS.TRANSACTION_TIMEOUT_MS,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  });
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
    include: {
      StaffUser: {
        select: { id: true, nickname: true, role: true },
      },
      CustomerUser: {
        select: { id: true, nickname: true },
      },
      items: {
        include: {
          bookSku: {
            include: {
              bookMaster: true,
            },
          },
        },
      },
    },
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
    include: {
      CustomerUser: {
        select: { id: true, nickname: true },
      },
    },
    orderBy: { created_at: "desc" },
    take: limit,
    skip: offset,
  });

  return acquisitions;
}

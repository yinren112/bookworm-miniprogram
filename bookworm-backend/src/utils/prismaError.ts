import { ApiError } from "../errors";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants";
import { isPrismaKnownError } from "./typeGuards";

export interface PrismaErrorContext {
  phoneNumber?: string;
}

type PrismaErrorMeta = {
  target?: string[] | string;
  modelName?: string;
  constraint?: string;
};

type PrismaErrorLike = {
  code?: string;
  meta?: PrismaErrorMeta;
  message?: string;
  name?: string;
};

function getPrismaErrorCode(error: unknown): string | undefined {
  if (isPrismaKnownError(error)) {
    return error.code;
  }
  if (typeof error === "object" && error !== null) {
    const code = (error as PrismaErrorLike).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function getPrismaErrorMeta(error: unknown): PrismaErrorMeta | undefined {
  if (isPrismaKnownError(error)) {
    return error.meta as PrismaErrorMeta | undefined;
  }
  if (typeof error === "object" && error !== null) {
    return (error as PrismaErrorLike).meta;
  }
  return undefined;
}

function normalizeTargets(target?: string[] | string): string[] {
  if (!target) return [];
  if (Array.isArray(target)) {
    return target.map((item) => String(item).toLowerCase());
  }
  return [String(target).toLowerCase()];
}

function isOrderPendingConstraint(meta?: PrismaErrorMeta): boolean {
  const targets = normalizeTargets(meta?.target);
  const modelName = meta?.modelName?.toLowerCase();
  const constraint = meta?.constraint?.toLowerCase();

  if (constraint?.includes("uniq_order_pending_per_user")) {
    return true;
  }

  return modelName === "order" && targets.includes("user_id");
}

function isPhoneNumberConstraint(meta?: PrismaErrorMeta): boolean {
  const targets = normalizeTargets(meta?.target);
  const constraint = meta?.constraint?.toLowerCase();

  if (targets.includes("phone_number")) {
    return true;
  }

  return constraint?.includes("phone_number") === true;
}

export function prismaErrorToApiError(
  error: unknown,
  context: PrismaErrorContext = {},
): ApiError | null {
  const prismaCode = getPrismaErrorCode(error);
  if (prismaCode !== "P2002") {
    return null;
  }

  const meta = getPrismaErrorMeta(error);

  if (isOrderPendingConstraint(meta)) {
    return new ApiError(
      409,
      ERROR_MESSAGES.CONCURRENT_ORDER,
      ERROR_CODES.CONCURRENT_PENDING_ORDER,
    );
  }

  if (isPhoneNumberConstraint(meta)) {
    const message = context.phoneNumber
      ? `手机号 ${context.phoneNumber} 已被其他用户占用`
      : "手机号已被其他用户占用";
    return new ApiError(409, message, ERROR_CODES.PHONE_NUMBER_CONFLICT);
  }

  return new ApiError(
    409,
    ERROR_MESSAGES.DUPLICATE_RECORD,
    ERROR_CODES.DUPLICATE_RECORD,
  );
}

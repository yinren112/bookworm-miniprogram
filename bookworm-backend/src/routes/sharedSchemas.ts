import { Type } from "@sinclair/typebox";
import config from "../config";

// 手机号：11位纯数字
export const PhoneNumberSchema = Type.String({
  pattern: "^[0-9]+$",
  minLength: 11,
  maxLength: 11,
});

// ISBN-13：13位数字，支持带短横线格式（如 978-7-111-12345-6）
// 也兼容 ISBN-10（10位）
export const ISBN13Schema = Type.String({
  pattern: "^[0-9\\-]+$",
  minLength: 10,
  maxLength: 17, // 13位 + 最多4个短横线
  description: "ISBN-10 或 ISBN-13，支持带短横线格式",
});

// 取货码：固定长度十六进制字符串（大小写不敏感，服务端统一转大写）
const PICKUP_CODE_LENGTH = config.ORDER_PICKUP_CODE_LENGTH;
export const PickupCodeSchema = Type.String({
  pattern: `^[a-fA-F0-9]{${PICKUP_CODE_LENGTH}}$`,
  minLength: PICKUP_CODE_LENGTH,
  maxLength: PICKUP_CODE_LENGTH,
  description: `取货码 (${PICKUP_CODE_LENGTH}位十六进制)`,
});

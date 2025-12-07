import { Type } from "@sinclair/typebox";

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

// 取货码：10位十六进制字符串（大小写不敏感，服务端统一转大写）
export const PickupCodeSchema = Type.String({
  pattern: "^[a-fA-F0-9]{10}$",
  minLength: 10,
  maxLength: 10,
  description: "取货码 (10位十六进制)",
});

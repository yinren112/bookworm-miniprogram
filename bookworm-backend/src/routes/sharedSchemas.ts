import { Type } from "@sinclair/typebox";

export const PhoneNumberSchema = Type.String({
  pattern: "^[0-9]+$",
  minLength: 11,
  maxLength: 11,
});

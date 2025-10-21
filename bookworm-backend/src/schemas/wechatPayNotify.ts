// src/schemas/wechatPayNotify.ts
// Runtime validation schema for WeChat Pay webhook notifications

import { Type, Static } from '@sinclair/typebox';

/**
 * WeChat Pay notification payload schema
 * Ref: https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_5.shtml
 */
export const WechatPayNotifySchema = Type.Object({
  id: Type.String({ minLength: 1 }),          // Notification ID (for deduplication)
  create_time: Type.String({ minLength: 1 }), // ISO 8601 timestamp
  resource_type: Type.String({ minLength: 1 }),
  event_type: Type.String({ minLength: 1 }),
  summary: Type.Optional(Type.String()),
  resource: Type.Object({
    algorithm: Type.String({ enum: ['AEAD_AES_256_GCM'] }),
    ciphertext: Type.String({ minLength: 1 }),
    nonce: Type.String({ minLength: 1 }),
    associated_data: Type.Optional(Type.String()),
  }),
});

export type WechatPayNotify = Static<typeof WechatPayNotifySchema>;

/**
 * Decrypted resource content schema (after AES decryption)
 */
export const WechatPayResourceSchema = Type.Object({
  mchid: Type.String(),
  appid: Type.String(),
  out_trade_no: Type.String(),
  transaction_id: Type.Optional(Type.String()),
  trade_type: Type.Optional(Type.String()),
  trade_state: Type.String({ enum: ['SUCCESS', 'REFUND', 'NOTPAY', 'CLOSED', 'REVOKED', 'USERPAYING', 'PAYERROR'] }),
  trade_state_desc: Type.String(),
  bank_type: Type.Optional(Type.String()),
  attach: Type.Optional(Type.String()),
  success_time: Type.Optional(Type.String()),
  payer: Type.Optional(Type.Object({
    openid: Type.String(),
  })),
  amount: Type.Optional(Type.Object({
    total: Type.Number(),
    payer_total: Type.Optional(Type.Number()),
    currency: Type.Optional(Type.String()),
    payer_currency: Type.Optional(Type.String()),
  })),
});

export type WechatPayResource = Static<typeof WechatPayResourceSchema>;

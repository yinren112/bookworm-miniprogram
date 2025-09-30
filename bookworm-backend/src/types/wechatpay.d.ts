// src/types/wechatpay.d.ts

// Since the 'wechatpay-node-v3' library doesn't export proper types,
// we define our own interface for the parts of the API we actually use.
// This is infinitely better than using 'any'.
export interface IWechatPayV3 {
  transactions_jsapi(params: any): Promise<any>;
  transactions_out_trade_no(params: { out_trade_no: string; mchid: string }): Promise<any>;
  verifySign(params: any): boolean;
  decipher_gcm(ciphertext: string, associated_data: string, nonce: string, apiv3Key: string): string;
  sign(message: string): string;
  // Add other methods here if you use them
}
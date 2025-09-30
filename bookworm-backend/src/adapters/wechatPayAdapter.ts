// src/adapters/wechatPayAdapter.ts
// Type-safe adapter for WeChat Pay SDK, isolating all 'as any' casts

import WechatPay from "wechatpay-node-v3";
import { WechatPayError } from "../errors";
import { isAxiosError } from "../utils/typeGuards";

// --- STRICT INPUT/OUTPUT INTERFACES ---

export interface WechatPayConfig {
  appid: string;
  mchid: string;
  privateKey: Buffer;
  serial_no: string;
  key: string;
}

export interface CreatePaymentOrderRequest {
  appid: string;
  mchid: string;
  description: string;
  out_trade_no: string;
  notify_url: string;
  time_expire: string;
  amount: {
    total: number;
    currency: string;
  };
  payer: {
    openid: string;
  };
}

export interface CreatePaymentOrderResponse {
  prepay_id: string;
}

export interface QueryPaymentRequest {
  out_trade_no: string;
  mchid: string;
}

export interface QueryPaymentResponse {
  trade_state: string;
  amount: {
    total: number;
    currency: string;
  };
  payer?: {
    openid: string;
  };
  mchid: string;
  appid: string;
  transaction_id?: string;
}

export interface VerifySignatureRequest {
  timestamp: string;
  nonce: string;
  body: string | Buffer;
  signature: string;
  serial: string;
}

export interface SignRequest {
  message: string;
}

export interface DecryptDataRequest {
  ciphertext: string;
  associated_data: string;
  nonce: string;
  apiv3Key: string;
}

export interface CreateRefundRequest {
  out_trade_no: string;
  out_refund_no: string;
  reason?: string;
  amount: {
    refund: number;
    total: number;
    currency: string;
  };
}

export interface CreateRefundResponse {
  status: string; // e.g., 'SUCCESS', 'PROCESSING'
  refund_id?: string;
  out_refund_no: string;
  transaction_id?: string;
  out_trade_no: string;
}

// --- ADAPTER CLASS ---

export class WechatPayAdapter {
  private readonly payInstance: any; // Keep 'any' confined to this private field

  constructor(config: WechatPayConfig) {
    // This is the ONLY place where we use 'as any' - confined to initialization
    this.payInstance = new WechatPay({
      appid: config.appid,
      mchid: config.mchid,
      privateKey: config.privateKey,
      serial_no: config.serial_no,
      key: config.key,
    } as any) as any;
  }

  /**
   * Create a payment order using JSAPI
   * @param request - Payment order details
   * @returns Promise with prepay_id and other response data
   * @throws Error if payment creation fails
   */
  async createPaymentOrder(request: CreatePaymentOrderRequest): Promise<CreatePaymentOrderResponse> {
    try {
      const response = await this.payInstance.transactions_jsapi(request);

      // Validate response structure
      if (!response || typeof response.prepay_id !== 'string') {
        throw new Error('Invalid response from WeChat Pay: missing prepay_id');
      }

      return {
        prepay_id: response.prepay_id,
      };
    } catch (error) {
      throw new Error(`Failed to create payment order: ${(error as Error).message}`);
    }
  }

  /**
   * Query payment status by out_trade_no
   * @param request - Query parameters
   * @returns Promise with payment status and details
   * @throws WechatPayError with appropriate error classification
   */
  async queryPaymentStatus(request: QueryPaymentRequest): Promise<QueryPaymentResponse> {
    try {
      const response = await this.payInstance.transactions_out_trade_no(request);

      // Validate required fields in response
      if (!response || !response.trade_state) {
        throw new Error('Invalid response from WeChat Pay: missing trade_state');
      }

      if (!response.amount || typeof response.amount.total !== 'number') {
        throw new Error('Invalid response from WeChat Pay: invalid amount structure');
      }

      return {
        trade_state: response.trade_state,
        amount: {
          total: response.amount.total,
          currency: response.amount.currency || 'CNY',
        },
        payer: response.payer ? { openid: response.payer.openid } : undefined,
        mchid: response.mchid,
        appid: response.appid,
        transaction_id: response.transaction_id,
      };
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;

        if (status === 404 || message.includes('ORDER_NOT_EXIST')) {
          throw new WechatPayError('ORDER_NOT_FOUND', false, `Order not found on WeChat's side: ${message}`, error);
        }
        if (status && status >= 400 && status < 500) {
          throw new WechatPayError('INVALID_REQUEST', false, `Invalid request to WeChat Pay: ${message}`, error);
        }
        if (status && status >= 500) {
          throw new WechatPayError('WECHAT_SERVER_ERROR', true, `WeChat Pay server error: ${message}`, error);
        }
      }
      // For non-axios errors (e.g., network timeout, DNS), assume they are retryable.
      throw new WechatPayError('NETWORK_ERROR', true, `Network error during payment query: ${(error as Error).message}`, error);
    }
  }

  /**
   * Verify signature from WeChat Pay notification
   * @param request - Signature verification parameters
   * @returns true if signature is valid, false otherwise
   */
  verifySignature(request: VerifySignatureRequest): boolean {
    try {
      return this.payInstance.verifySign({
        timestamp: request.timestamp,
        nonce: request.nonce,
        body: request.body,
        signature: request.signature,
        serial: request.serial,
      });
    } catch (error) {
      // Log error but return false instead of throwing
      console.error('WeChat Pay signature verification failed:', error);
      return false;
    }
  }

  /**
   * Decrypt encrypted data from WeChat Pay notification
   * @param request - Decryption parameters
   * @returns Decrypted string data
   * @throws Error if decryption fails
   */
  decryptNotificationData(request: DecryptDataRequest): string {
    try {
      const result = this.payInstance.decipher_gcm(
        request.ciphertext,
        request.associated_data,
        request.nonce,
        request.apiv3Key
      );

      if (typeof result !== 'string') {
        throw new Error('Decryption result is not a string');
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to decrypt notification data: ${(error as Error).message}`);
    }
  }

  /**
   * Generate RSA signature for WeChat Pay
   * @param request - Data to sign
   * @returns Signature string
   * @throws Error if signing fails
   */
  generateSignature(request: SignRequest): string {
    try {
      const signature = this.payInstance.sign(request.message);

      if (typeof signature !== 'string') {
        throw new Error('Signature generation returned non-string result');
      }

      return signature;
    } catch (error) {
      throw new Error(`Failed to generate signature: ${(error as Error).message}`);
    }
  }

  /**
   * Create a refund for a transaction
   * @param request - Refund details
   * @returns Promise with refund status
   * @throws WechatPayError with appropriate error classification
   */
  async createRefund(request: CreateRefundRequest): Promise<CreateRefundResponse> {
    try {
      // The SDK method name is typically plural, like 'refunds'
      const response = await this.payInstance.refunds(request);

      if (!response || !response.status) {
        throw new Error('Invalid response from WeChat Pay refund API: missing status');
      }

      return {
        status: response.status,
        refund_id: response.refund_id,
        out_refund_no: response.out_refund_no || request.out_refund_no,
        transaction_id: response.transaction_id,
        out_trade_no: response.out_trade_no || request.out_trade_no,
      };
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;

        if (status && status >= 400 && status < 500) {
          throw new WechatPayError('INVALID_REFUND_REQUEST', false, `Invalid refund request: ${message}`, error);
        }
        if (status && status >= 500) {
          throw new WechatPayError('WECHAT_SERVER_ERROR', true, `WeChat Pay server error during refund: ${message}`, error);
        }
      }
      throw new WechatPayError('NETWORK_ERROR', true, `Network error during refund creation: ${(error as Error).message}`, error);
    }
  }
}

// --- FACTORY FUNCTION FOR CLEAN INITIALIZATION ---

export function createWechatPayAdapter(config: WechatPayConfig): WechatPayAdapter {
  return new WechatPayAdapter(config);
}
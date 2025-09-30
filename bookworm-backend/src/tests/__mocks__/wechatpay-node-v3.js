import { vi } from "vitest";

// This is a manual mock for the 'wechatpay-node-v3' library
export default vi.fn().mockImplementation(() => ({
  transactions_jsapi: vi
    .fn()
    .mockResolvedValue({ prepay_id: "mock_prepay_id" }),
  transactions_out_trade_no: vi.fn(), // We will configure this in tests
  verifySign: vi.fn().mockReturnValue(true),
  decipher_gcm: vi.fn().mockImplementation((...args) =>
    JSON.stringify({
      trade_state: "SUCCESS",
      out_trade_no: "mock_out_trade_no_from_decipher",
      transaction_id: "mock_transaction_id",
      total_fee: 2000, // 20.00 yuan in cents
      trade_state_desc: "Payment successful",
    }),
  ),
  sign: vi.fn().mockReturnValue("mock_signature"),
  update_verifier: vi.fn().mockResolvedValue(undefined),
}));

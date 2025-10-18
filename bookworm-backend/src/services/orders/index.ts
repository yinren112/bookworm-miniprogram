// src/services/orders/index.ts
// Unified export point for all order-related functionality
// Single entry point for importing order services

// Query operations
export {
  getOrdersByUserId,
  getOrderById,
  getPendingPickupOrders,
} from "./queries";

// Order creation
export { createOrder } from "./create";

// Payment operations
export {
  preparePaymentIntent,
  buildWechatPaymentRequest,
  buildClientPaymentSignature,
  generatePaymentParams,
  processPaymentNotification,
  // Export types
  type PaymentIntentContext,
} from "./payments";

// Order fulfillment
export { fulfillOrder } from "./fulfill";

// Order status management
export { updateOrderStatus } from "./management";

// Scheduled tasks
export { cancelExpiredOrders } from "./scheduling";

// Pure utility functions (re-exported from domain layer)
export {
  formatCentsToYuanString,
  generateUniquePickupCode,
} from "../../domain/orders/utils";

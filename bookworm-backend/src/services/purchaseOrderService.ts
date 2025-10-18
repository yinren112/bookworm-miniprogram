// src/services/purchaseOrderService.ts
// LEGACY COMPATIBILITY LAYER
// This file is kept for backward compatibility with existing imports
// All functionality has been moved to src/services/orders/*
//
// "Never break userspace" - Linus Torvalds
//
// DO NOT add new functionality here. Instead:
// 1. Add it to the appropriate module in src/services/orders/
// 2. Export it from src/services/orders/index.ts
// 3. It will automatically be available here via re-export

// Re-export everything from the new modular structure
export * from "./orders/index";

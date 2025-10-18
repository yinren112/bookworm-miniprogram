# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed - Internal Refactoring (Non-Breaking)

#### Order Service Module Restructuring (2025-10-18)

**Summary**: Refactored `src/services/purchaseOrderService.ts` (1040 lines) into modular components for improved maintainability and testability. All existing functionality preserved with zero breaking changes.

**New Structure**:
- `src/domain/orders/utils.ts` - Pure utility functions (formatCentsToYuanString, generateUniquePickupCode)
- `src/services/orders/queries.ts` - Read-only query operations (getOrdersByUserId, getOrderById, getPendingPickupOrders)
- `src/services/orders/create.ts` - Order creation with advisory locks and inventory reservation
- `src/services/orders/payments.ts` - Payment processing with WeChat Pay integration and idempotency guarantees
- `src/services/orders/fulfill.ts` - Order fulfillment (pickup completion)
- `src/services/orders/management.ts` - Order status management (STAFF operations)
- `src/services/orders/scheduling.ts` - Background tasks (order expiration cleanup)
- `src/services/orders/index.ts` - Unified export point

**Backward Compatibility**:
- `src/services/purchaseOrderService.ts` retained as compatibility layer
- All existing import paths continue to work via re-exports
- No changes required to route files, job files, or tests

**Benefits**:
- Each module now < 300 lines (down from 1040 lines monolithic file)
- Clearer separation of concerns (queries, writes, background tasks)
- Easier to test individual components
- Reduced cognitive load when working with order logic
- Preserved critical payment callback idempotency logic without modification

**Testing**:
- All 116 integration tests pass (19 test files)
- Zero behavioral changes detected
- Payment callback idempotency verified
- Advisory lock ordering preserved
- Transaction boundaries maintained

**Technical Debt Addressed**:
- Eliminated 1000+ line "god file" anti-pattern
- Improved code navigability and searchability
- Set foundation for future feature additions

**Philosophy**: "Never break userspace" - Linus Torvalds. This refactoring prioritizes internal code quality while maintaining absolute compatibility with existing consumers.

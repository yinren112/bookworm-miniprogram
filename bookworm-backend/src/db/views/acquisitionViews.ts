// src/db/views/acquisitionViews.ts
// Centralized Acquisition model data access selectors

import type { Prisma } from '@prisma/client';

/**
 * Acquisition detail with full related data
 * Used by: getAcquisitionById
 */
export const acquisitionDetailInclude = {
  StaffUser: {
    select: { id: true, nickname: true, role: true },
  },
  CustomerUser: {
    select: { id: true, nickname: true },
  },
  items: {
    include: {
      bookSku: {
        include: {
          bookMaster: true,
        },
      },
    },
  },
} as const satisfies Prisma.AcquisitionInclude;

/**
 * Acquisition list with customer info only
 * Used by: getAcquisitionsByStaff
 */
export const acquisitionListInclude = {
  CustomerUser: {
    select: { id: true, nickname: true },
  },
} as const satisfies Prisma.AcquisitionInclude;

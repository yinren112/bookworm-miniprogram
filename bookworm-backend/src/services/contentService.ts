// src/services/contentService.ts
import { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

export async function getContentBySlug(dbCtx: PrismaClient | Prisma.TransactionClient, slug: string) {
  return await dbCtx.content.findUniqueOrThrow({
    where: { slug },
  });
}

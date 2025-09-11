// src/services/contentService.ts
import prisma from '../db';

export async function getContentBySlug(slug: string) {
  return await prisma.content.findUniqueOrThrow({
    where: { slug }
  });
}
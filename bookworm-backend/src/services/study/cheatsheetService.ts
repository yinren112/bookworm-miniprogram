// src/services/study/cheatsheetService.ts
// 急救包服务 - 考前资料管理

import { PrismaClient } from "@prisma/client";
import {
  cheatsheetWithUnitInclude,
  cheatsheetDetailInclude,
} from "../../db/views";

type DbCtx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface CheatSheet {
  id: number;
  title: string;
  assetType: string;
  url: string;
  version: number;
  sortOrder: number;
  unit: {
    id: number;
    title: string;
    unitKey: string;
  } | null;
}

/**
 * 获取课程的急救包列表
 */
export async function getCheatSheets(
  db: DbCtx,
  courseId: number,
  unitId?: number,
): Promise<CheatSheet[]> {
  const whereClause = {
    courseId,
    ...(unitId ? { unitId } : {}),
  };

  const sheets = await db.studyCheatSheet.findMany({
    where: whereClause,
    include: cheatsheetWithUnitInclude,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  return sheets.map((s) => ({
    id: s.id,
    title: s.title,
    assetType: s.assetType,
    url: s.url,
    version: s.version,
    sortOrder: s.sortOrder,
    unit: s.unit,
  }));
}

/**
 * 获取单个急救包详情
 */
export async function getCheatSheetById(
  db: DbCtx,
  id: number,
): Promise<CheatSheet | null> {
  const sheet = await db.studyCheatSheet.findUnique({
    where: { id },
    include: cheatsheetDetailInclude,
  });

  if (!sheet) return null;

  return {
    id: sheet.id,
    title: sheet.title,
    assetType: sheet.assetType,
    url: sheet.url,
    version: sheet.version,
    sortOrder: sheet.sortOrder,
    unit: sheet.unit,
  };
}

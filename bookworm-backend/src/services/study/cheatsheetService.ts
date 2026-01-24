// src/services/study/cheatsheetService.ts
// 急救包服务 - 考前资料管理

import { PrismaClient } from "@prisma/client";
import { cheatsheetDetailView, cheatsheetSummaryView } from "../../db/views";

type DbCtx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export function normalizeCheatsheetContent(content: string): string {
  return content.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

export interface CheatSheetSummary {
  id: number;
  title: string;
  assetType: string;
  url: string | null;
  contentFormat: string | null;
  version: number;
  sortOrder: number;
  unit: {
    id: number;
    title: string;
    unitKey: string;
  } | null;
}

export interface CheatSheetDetail extends CheatSheetSummary {
  content: string | null;
  course: {
    id: number;
    title: string;
    courseKey: string;
  };
}

export type CheatSheet = CheatSheetSummary;

/**
 * 获取课程的急救包列表
 */
export async function getCheatSheets(
  db: DbCtx,
  courseId: number,
  unitId?: number,
): Promise<CheatSheetSummary[]> {
  const whereClause = {
    courseId,
    ...(unitId ? { unitId } : {}),
  };

  const sheets = await db.studyCheatSheet.findMany({
    where: whereClause,
    select: cheatsheetSummaryView,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  return sheets.map((s) => ({
    id: s.id,
    title: s.title,
    assetType: s.assetType,
    url: s.url,
    contentFormat: s.contentFormat ?? null,
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
): Promise<CheatSheetDetail | null> {
  const sheet = await db.studyCheatSheet.findUnique({
    where: { id },
    select: cheatsheetDetailView,
  });

  if (!sheet) return null;

  return {
    id: sheet.id,
    title: sheet.title,
    assetType: sheet.assetType,
    url: sheet.url,
    content: sheet.content ? normalizeCheatsheetContent(sheet.content) : null,
    contentFormat: sheet.contentFormat ?? null,
    version: sheet.version,
    sortOrder: sheet.sortOrder,
    unit: sheet.unit,
    course: sheet.course,
  };
}

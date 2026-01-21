// src/services/study/starService.ts
// 星标收藏服务
import { PrismaClient, Prisma } from "@prisma/client";
import { cardContentIdView, questionIdOnlyView } from "../../db/views";

type DbCtx = PrismaClient | Prisma.TransactionClient;

export type StarType = "card" | "question";

export type StarredItem = {
  type: StarType;
  contentId?: string;
  questionId?: number;
  createdAt: Date;
};

export type StarItemInput =
  | { type: "card"; contentId: string }
  | { type: "question"; questionId: number };

export async function starItem(
  db: DbCtx,
  userId: number,
  input: StarItemInput,
): Promise<void> {
  try {
    if (input.type === "card") {
      await db.userStarredItem.create({
        data: {
          userId,
          type: "card",
          contentId: input.contentId,
        },
      });
      return;
    }

    await db.userStarredItem.create({
      data: {
        userId,
        type: "question",
        questionId: input.questionId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}

export async function unstarItem(
  db: DbCtx,
  userId: number,
  input: StarItemInput,
): Promise<void> {
  if (input.type === "card") {
    await db.userStarredItem.deleteMany({
      where: {
        userId,
        type: "card",
        contentId: input.contentId,
      },
    });
    return;
  }

  await db.userStarredItem.deleteMany({
    where: {
      userId,
      type: "question",
      questionId: input.questionId,
    },
  });
}

export async function getStarredItems(
  db: DbCtx,
  userId: number,
  options: { type?: StarType; courseId?: number; limit?: number; offset?: number } = {},
): Promise<{ items: StarredItem[]; total: number }> {
  const { type, courseId, limit, offset } = options;

  const whereClause = {
    userId,
    ...(type ? { type } : {}),
  };

  const [items, total] = await Promise.all([
    db.userStarredItem.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: courseId ? undefined : limit,
      skip: courseId ? undefined : offset,
    }),
    db.userStarredItem.count({
      where: whereClause,
    }),
  ]);

  if (!courseId) {
    return {
      items: items.map((item) => ({
        type: item.type,
        contentId: item.contentId ?? undefined,
        questionId: item.questionId ?? undefined,
        createdAt: item.createdAt,
      })),
      total,
    };
  }

  const cardContentIds = items
    .filter((item) => item.type === "card" && item.contentId)
    .map((item) => item.contentId as string);
  const questionIds = items
    .filter((item) => item.type === "question" && item.questionId)
    .map((item) => item.questionId as number);

  const validCardContentIds = new Set<string>();
  if (cardContentIds.length > 0) {
    const cards = await db.studyCard.findMany({
      where: {
        courseId,
        contentId: { in: cardContentIds },
      },
      select: cardContentIdView,
    });
    cards.forEach((card) => validCardContentIds.add(card.contentId));
  }

  const validQuestionIds = new Set<number>();
  if (questionIds.length > 0) {
    const questions = await db.studyQuestion.findMany({
      where: {
        courseId,
        id: { in: questionIds },
      },
      select: questionIdOnlyView,
    });
    questions.forEach((question) => validQuestionIds.add(question.id));
  }

  const filteredItems = items
    .filter((item) => {
      if (item.type === "card") {
        return item.contentId && validCardContentIds.has(item.contentId);
      }
      return item.questionId && validQuestionIds.has(item.questionId);
    });

  const start = offset ?? 0;
  const end = limit ? start + limit : undefined;

  return {
    items: filteredItems
      .slice(start, end)
      .map((item) => ({
        type: item.type,
        contentId: item.contentId ?? undefined,
        questionId: item.questionId ?? undefined,
        createdAt: item.createdAt,
      })),
    total: filteredItems.length,
  };
}

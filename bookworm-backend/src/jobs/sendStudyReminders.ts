// src/jobs/sendStudyReminders.ts
// 每日复习提醒发送任务
import prisma from "../db";
import { sendStudyReminders } from "../services/study";

export async function dispatchStudyReminders() {
  return sendStudyReminders(prisma);
}

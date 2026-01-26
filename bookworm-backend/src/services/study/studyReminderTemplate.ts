// src/services/study/studyReminderTemplate.ts
// 真实 Key 映射 (Verified by User)
export const REMINDER_TEMPLATE_KEYS = {
  CONTENT: "thing2",      // 复习内容
  COUNT: "number1",       // 复习数量
  TIME: "time5",          // 开始学习时间
  REMARK: "thing4",       // 备注
} as const;

export interface ReminderTemplateData {
  [REMINDER_TEMPLATE_KEYS.CONTENT]: { value: string };
  [REMINDER_TEMPLATE_KEYS.COUNT]: { value: string };
  [REMINDER_TEMPLATE_KEYS.TIME]: { value: string };
  [REMINDER_TEMPLATE_KEYS.REMARK]: { value: string };
}

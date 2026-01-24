# Project Status: One-time Subscription Template Integration

## Overview
Successfully transitioned the study reminder system from a daily logic to a **One-time Subscription** model using WeChat Template `kNHUGMC5tapQG7aTC2zalWgnW0iFuBjbwp06xDOXRjk`.

## 1. Key Configuration (Verified)
- **Template ID**: `kNHUGMC5tapQG7aTC2zalWgnW0iFuBjbwp06xDOXRjk`
- **Field Mapping** (See: `src/services/study/studyReminderTemplate.ts`):
  | Logic Field | Template Key | Description |
  |-------------|--------------|-------------|
  | CONTENT     | `thing2`     | 复习内容 |
  | COUNT       | `number1`    | 复习数量 |
  | TIME        | `time5`      | 开始学习时间 |
  | REMARK      | `thing4`     | 备注 |

## 2. Code Changes
### Backend (`bookworm-backend`)
- **Schema**: Updated `StudyReminderStatus` (Added `ACTIVE`, `SENT`, `FAILED`), added `sentAt`, `lastError`.
- **Migration**: Applied `add_one_time_reminder_fields`.
- **Service**: 
  - `upsertStudyReminderSubscription`: Sets status to `ACTIVE`.
  - `sendStudyReminders`: Sends message → Updates status to `SENT` (Consumed) or `FAILED`.
  - `buildReminderPayload`: Uses dynamically imported keys from `studyReminderTemplate.ts`.

### Frontend (`miniprogram`)
- **Constants**: Updated `STUDY_REMINDER_TEMPLATE_ID`.
- **Pages**: 
  - `profile/index.js`, `session-complete/index.js`: Updated UI logic to handle `ACTIVE`/`SENT` status.
  - WXML: Changed "每日提醒" to "下次提醒" / "已订阅下次".

## 3. Verification Results
- **Lint**: ✅ Passed (Exit Code 0)
- **Unit Tests**: ✅ Passed (Exit Code 0)
- **Integration Tests**: ✅ Passed (All 28 suites including `study-reminders.integration.test.ts`)

## 4. Next Steps for Staging/Prod
1. **Frontend Release**: Upload and release the miniprogram version.
2. **Backend Deploy**: Deploy backend code and run migrations (`npx prisma migrate deploy`).
3. **Manual Check**:
   - User subscribes -> DB Status `ACTIVE`.
   - Trigger Send -> Receive 1 Msg -> DB Status `SENT`.
   - Trigger Send again -> No Msg sent (Idempotency).

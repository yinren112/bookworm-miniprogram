# Task Plan: One-time Subscription Template Integration

## Goal
Implement one-time subscription message for study reminders, replacing the daily reminder model. Ensure exact template key mapping, correct frontend integration, and robust backend handling (idempotency, consumption state).

## Key Information
- **Template ID**: `kNHUGMC5tapQG7aTC2zalWgnW0iFuBjbwp06xDOXRjk`
- **Type**: One-time subscription (Requires "Consume" logic)
- **Constraint**: Strict template key mapping (No guessing)
- **Confirmed Keys**:
    - 复习内容 = `thing2` (CONTENT)
    - 复习数量 = `number1` (COUNT)
    - 开始学习时间 = `time5` (START_TIME)
    - 备注 = `thing4` (REMARK)

## Phases

### Phase 1: Preparation & Discovery (Completed)
- [x] Identify Template Keys (User Provided)
- [x] Create/Update mapping table file
- [x] Verify Schema requirements (Added `SENT`, `FAILED`, `sentAt`, `lastError`)
- [x] Schema Migration

### Phase 2: Frontend Implementation (Completed)
- [x] Update `STUDY_REMINDER_TEMPLATE_ID` in `miniprogram/utils/constants.js`
- [x] Verify subscription entry points
- [x] Update UI copy ("Daily" -> "Next") in `session-complete` and `profile`.

### Phase 3: Backend Core Implementation (Completed)
- [x] Update `studyReminderTemplate.ts` with Real Keys
- [x] Verify `reminderService.ts` dynamic data construction.

### Phase 4: Testing & Verification (Completed)
- [x] Lint Check (`npm run lint`). Status: Pass
- [x] Unit Tests (`npm test`). Status: Pass
- [x] Integration Tests (`npm run test:integration`). Status: Pass (28 test files passed)

### Phase 5: Documentation & Handoff (Current)
- [ ] Generate Final Report

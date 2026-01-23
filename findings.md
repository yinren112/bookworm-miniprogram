# Findings

## Context
- We are moving from "Daily Reminder" to "One-time Reminder".
- Template ID: `kNHUGMC5tapQG7aTC2zalWgnW0iFuBjbwp06xDOXRjk`

## Schema Analysis
- Current `StudyReminderSubscription` table exists.
- Current Status Enum: `ACCEPT`, `REJECT`, `BAN`.
- Need to support: `SENT` (Consumed), `FAILED` (Consumed/Error).
- User requested `sentAt` field (Already exists as `lastSentAt`? Or strict `sentAt` for the one-time event? User said `sentAt` non-null). `lastSentAt` seems sufficient if we treat it as "the time it was sent".
- Uniqueness: `@@unique([userId, templateId])`. This implies one row per user per template. For ONE-TIME subscription, usually, a user subscribes *again* for the next one.
  - If `@@unique` is on `userId, templateId`, how do we handle multiple subscriptions?
  - WeChat One-time subscription: User taps -> adds 1 to quota.
  - Does WeChat allow getting the *count*? No. 
  - Typically, we just check if we have a valid subscription.
  - If we send one, the quota decreases.
  - If we treat it as "Store one record per user", and update status to `SENT`, then the user needs to subscribe *again* to reset it to `ACCEPT`.
  - `upsert` logic in `reminderService.ts` handles re-subscription:
    ```typescript
    update: {
      status, // Sets to ACCEPT
      consentAt: now,
      ...
    }
    ```
    This works for re-subscription.

## Template Keys
- **MISSING**: Exact mapping of keys (thing1, time2, etc.) to content.
- Need to ask user or find in unidentified docs.

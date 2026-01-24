---
title: Study Record & Activity Tracking Optimization
status: DRAFT
author: Antigravity
date: 2026-01-24
---

# Study Record & Activity Tracking Optimization

## 1. Problem Analysis
The current "Learning Record" (accessed via Heatmap) is perceived as "meaningless" layout and inaccurate data wise.
*   **Data Accuracy**: The "Learning Count" is derived from `UserCardState.lastAnsweredAt`. Since this field is updated on every review, past activity for the same card is "moved" to the current date. Loops of reviewing the same 50 cards daily result in 0 history for previous days. (Bug: "History Erasure").
*   **Metric Relevance**: Users care more about "Duration" (Time Spent) than raw counts, especially for passive review or long-tackle questions.
*   **Visual Appeal**: The current list is repetitive and visually flat.

## 2. Proposed Solution: "Valid Study Time" Tracking

We will shift the core metric from "Touch Count" to "Time Spent".

### 2.1. Metric Definition
**Valid Study Time**: Time spent actively engaged in a learning interface (Flashcard, Quiz, Cheatsheet).
*   **Active**: Screen is on, app is in foreground.
*   **Capping**: If no interaction (touch/scroll) for > X minutes, stop counting (idle detection).

### 2.2. Architecture Design

#### Frontend (Miniprogram)
*   **`StudyTimer` Class**: A singleton to manage state `(pagePath, startTime, accumulatedDuration)`.
*   **Hooks**: `onShow` / `onHide` in `Page` lifecycle.
*   **Reporting**:
    *   **Pulse**: Send `POST /api/study/activity/pulse` every 1 minute if active.
    *   **Flush**: Send remaining duration on `onHide` / `onUnload`.
    *   **Payload**: `{ type: 'card'|'quiz'|'cheatsheet', durationSeconds: 60, timestamp: NOW }`.

#### Backend (Prisma/Postgres)
*   **New Model**: `DailyStudyActivity`
    *   Aggregates duration at the daily level to save space.
    *   Columns: `id`, `userId`, `date` (Date), `cardDurationSeconds`, `quizDurationSeconds`, `cheatsheetDurationSeconds`, `updatedAt`.
    *   Logic: Upsert increments.

*   **Deprecated**: `getActivityHistory` relying on `UserCardState`. It will now query `DailyStudyActivity`.

### 2.3. User Interface Redesign

**Page: `pages/activity-history/index`**

1.  **Header Stats (Summary)**
    *   **Total Time**: "12h 45m" (This week/month)
    *   **Daily Avg**: "45m / day"
    *   **Streak**: "🔥 5 Days"

2.  **Visual Chart (The "Meaning")**
    *   **Bar Chart**: Last 7 days / 30 days.
    *   Y-Axis: Time (Hours/Minutes).
    *   X-Axis: Date.
    *   Stacks: Cards (Green), Quiz (Blue), Cheatsheet (Purple).

3.  **Daily Log (The List)**
    *   **Format**: Timeline style.
    *   **Entry**:
        *   **Date**: "Jan 24"
        *   **Total**: "53 min"
        *   **Breakdown**: Icons for types. "Cards: 30m · Quiz: 23m".
    *   **Action**: Clicking a day could show details (if we stored session logs, but for now just breakdown).

## 3. Implementation Plan

### Phase 1: Backend Foundation
1.  Add `DailyStudyActivity` to `schema.prisma`.
2.  Create migration.
3.  Implement `POST /api/study/activity/log` (or `pulse`) endpoint.
4.  Update `GET /api/study/activity-history` to return time-based data.

### Phase 2: Frontend Data Collection
1.  Implement `StudyTimer` utility.
2.  Integrate into `CardSession`, `QuizSession`, `Cheatsheet` pages.
3.  Verify "Pulse" reliability (account for network failures).

### Phase 3: Frontend UI Overhaul
1.  Redesign `activity-history/index.wxml`.
2.  Implement Chart (using CSS-based bars or simple Canvas).
3.  Apply "Premium Design" guidelines (Glassmorphism, gradients).

## 4. Risks & Mitigations
*   **Network Spam**: Pulse every minute = lots of requests.
    *   *Mitigation*: Batch on client, send every 5 mins or on exit. If fail, local storage retry.
*   **Cheating**: User leaves phone open.
    *   *Mitigation*: Idle timeout (e.g., 2 mins no touch -> stop timer).


# Task Plan: Debug Missing Course on Dashboard

## Goal
Fix the issue where "Advanced Mathematics" (高数) course is missing from the dashboard/homepage for the user. Ensure consistent data retrieval and correct caching strategies (user-specific keys).

## Hypothesis
1. **Cache Key Collision**: The dashboard cache might be missing `userId` in the key, causing one user's (empty) dashboard to be served to another.
2. **Enrollment Query Filter**: The query fetching enrolled courses might be filtering out the course (e.g., status mismatch, soft delete).
3. **Frontend Local Storage**: The miniprogram might be caching an old empty state.

## Phases

### Phase 1: Diagnostics (Current)
- [ ] **Log Analysis**: Add debug logs in `getStudyDashboard` and `getUserEnrolledCourses` to trace:
    - User ID
    - Query result count
    - Cache hit/miss
- [ ] **Code Review (Backend)**: Inspect `dashboardService.ts` and `courseService.ts` for:
    - Caching logic (keys)
    - Query constraints (`where` clauses)
- [ ] **Code Review (Frontend)**: Check local storage logic in miniprogram.

### Phase 2: Implementation
- [ ] **Fix Cache Key**: Ensure all user-specific data (dashboard, enrollment) keys include `userId`.
- [ ] **Fix Query**: Adjust Prisma queries if they are too restrictive.
- [ ] **Frontend**: Clear potentially stale cache or fix key generation.

### Phase 3: Verification
- [ ] **Reproduction Test**: Create a test case with 2 users (one enrolled, one not) to verify isolation.
- [ ] **Integration Test**: Run `study-dashboard.integration.test.ts`.

### Phase 4: Delivery
- [ ] Final Report with Root Cause and Fix.

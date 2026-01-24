-- Migration: add_quiz_attempt_idempotency
-- Description: Add unique constraint to prevent duplicate quiz answer submissions
-- Date: 2024-12-18

-- Step 1: Clean up any existing duplicate records (keep the earliest one)
-- This ensures the unique constraint can be added without conflicts
DELETE FROM user_question_attempt a
USING user_question_attempt b
WHERE a.id > b.id
  AND a.session_id = b.session_id
  AND a.user_id = b.user_id
  AND a.question_id = b.question_id;

-- Step 2: Add unique constraint for idempotency
-- Same session + user + question should only have one attempt record
ALTER TABLE user_question_attempt
ADD CONSTRAINT uniq_attempt_session_user_question
UNIQUE (session_id, user_id, question_id);

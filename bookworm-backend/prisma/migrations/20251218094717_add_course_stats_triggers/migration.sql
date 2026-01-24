-- Migration: add_course_stats_triggers
-- Description: Add triggers to auto-update course totalCards/totalQuestions on card/question insert/delete
-- Date: 2024-12-18

-- ============================================
-- Card count auto-update trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_course_card_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE study_course SET total_cards = total_cards + 1
    WHERE id = NEW.course_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE study_course SET total_cards = total_cards - 1
    WHERE id = OLD.course_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_study_card_count ON study_card;
CREATE TRIGGER trg_study_card_count
AFTER INSERT OR DELETE ON study_card
FOR EACH ROW EXECUTE FUNCTION update_course_card_count();

-- ============================================
-- Question count auto-update trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_course_question_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE study_course SET total_questions = total_questions + 1
    WHERE id = NEW.course_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE study_course SET total_questions = total_questions - 1
    WHERE id = OLD.course_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_study_question_count ON study_question;
CREATE TRIGGER trg_study_question_count
AFTER INSERT OR DELETE ON study_question
FOR EACH ROW EXECUTE FUNCTION update_course_question_count();

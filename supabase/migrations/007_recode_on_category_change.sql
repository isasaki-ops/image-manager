-- Shared helper: consume the per-category sequence and format an event_code
CREATE OR REPLACE FUNCTION next_event_code(p_category_id TEXT)
RETURNS TEXT AS $$
DECLARE
  next_seq BIGINT;
BEGIN
  IF p_category_id = '01' THEN
    next_seq := nextval('events_cat_01_seq');
  ELSIF p_category_id = '02' THEN
    next_seq := nextval('events_cat_02_seq');
  ELSE
    RETURN NULL;
  END IF;
  RETURN p_category_id || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Reuse the shared helper for INSERT (behavior unchanged)
CREATE OR REPLACE FUNCTION generate_event_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.event_code := next_event_code(NEW.category_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-issue event_code whenever category_id changes on an existing event,
-- so the code's category prefix always matches the current category.
CREATE OR REPLACE FUNCTION regenerate_event_code_on_category_change()
RETURNS TRIGGER AS $$
BEGIN
  NEW.event_code := next_event_code(NEW.category_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_code_recategorize
  BEFORE UPDATE ON events
  FOR EACH ROW
  WHEN (NEW.category_id IS DISTINCT FROM OLD.category_id)
  EXECUTE FUNCTION regenerate_event_code_on_category_change();

-- One-off fix: 02-0141「ライテン」was recategorized from 来店(02) to 取材(01)
-- earlier, but its event_code kept the stale 02- prefix (this bug is what
-- the trigger above now prevents going forward).
UPDATE events
SET event_code = next_event_code('01')
WHERE event_code = '02-0141' AND category_id = '01';

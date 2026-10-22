-- +migrate Up
-- Repairs content bodies stored as double-encoded jsonb strings.
--
-- The demo seed historically inserted the body document with
-- `to_jsonb($5::text)` after `JSON.stringify`, which wraps the document as a
-- jsonb STRING (the JSON text becomes the string value) instead of a jsonb
-- object. The theme renderer then received the raw JSON text and rendered an
-- empty body. Fixed at the source in the same release; this migration repairs
-- existing rows.
--
-- Safe/idempotent: only rows with jsonb_typeof(body) = 'string' whose inner
-- text parses as a JSON object/array are converted. Plain-text string bodies
-- and already-correct rows are left untouched, so re-running is a no-op.

DO $$
DECLARE
  row_record RECORD;
  inner_text text;
BEGIN
  FOR row_record IN
    SELECT id, body FROM content WHERE jsonb_typeof(body) = 'string'
  LOOP
    inner_text := row_record.body #>> '{}';
    IF inner_text IS NOT NULL AND btrim(inner_text) ~ '^[\{\[]' THEN
      BEGIN
        UPDATE content SET body = inner_text::jsonb WHERE id = row_record.id;
      EXCEPTION WHEN OTHERS THEN
        -- inner text looked like a document but is not valid JSON — keep it
        NULL;
      END;
    END IF;
  END LOOP;
END $$;

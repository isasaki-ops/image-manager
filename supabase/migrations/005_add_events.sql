-- Sequences for per-category event codes
CREATE SEQUENCE IF NOT EXISTS events_cat_01_seq;
CREATE SEQUENCE IF NOT EXISTS events_cat_02_seq;

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code  TEXT UNIQUE,
  category_id TEXT NOT NULL CHECK (category_id IN ('01', '02')),
  name        TEXT NOT NULL,
  keywords    TEXT,
  memo        TEXT,
  search_text TEXT,
  embedding   VECTOR(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate event_code on INSERT
CREATE OR REPLACE FUNCTION generate_event_code()
RETURNS TRIGGER AS $$
DECLARE
  next_seq BIGINT;
BEGIN
  IF NEW.category_id = '01' THEN
    next_seq := nextval('events_cat_01_seq');
  ELSIF NEW.category_id = '02' THEN
    next_seq := nextval('events_cat_02_seq');
  ELSE
    RETURN NEW;
  END IF;
  NEW.event_code := NEW.category_id || '-' || LPAD(next_seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_code
  BEFORE INSERT ON events
  FOR EACH ROW
  WHEN (NEW.event_code IS NULL)
  EXECUTE FUNCTION generate_event_code();

-- Vector index for events
CREATE INDEX IF NOT EXISTS events_embedding_idx
  ON events USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Add event linkage and type classification to images
ALTER TABLE images
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_type TEXT DEFAULT 'original';

-- Classify existing images
UPDATE images SET image_type = '600x400' WHERE image_width = 600 AND image_height = 400;
UPDATE images SET image_type = 'original' WHERE image_type IS NULL;

-- Index for fast event → images lookups
CREATE INDEX IF NOT EXISTS images_event_id_idx ON images (event_id);

-- Vector search RPC for events
CREATE OR REPLACE FUNCTION search_events(
  query_vector    VECTOR(1536),
  match_limit     INT   DEFAULT 20,
  match_threshold FLOAT DEFAULT 0.25
)
RETURNS TABLE (
  id          UUID,
  event_code  TEXT,
  category_id TEXT,
  name        TEXT,
  keywords    TEXT,
  memo        TEXT,
  created_at  TIMESTAMPTZ
)
LANGUAGE SQL
AS $$
  SELECT
    e.id,
    e.event_code,
    e.category_id,
    e.name,
    e.keywords,
    e.memo,
    e.created_at
  FROM events e
  WHERE
    e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_vector) > match_threshold
  ORDER BY 1 - (e.embedding <=> query_vector) DESC
  LIMIT match_limit;
$$;

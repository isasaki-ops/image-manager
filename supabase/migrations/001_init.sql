-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Images table
CREATE TABLE IF NOT EXISTS images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  r2_key        TEXT NOT NULL UNIQUE,
  r2_url        TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  memo          TEXT,
  ai_description TEXT,
  search_text   TEXT,
  embedding     VECTOR(1536),
  is_active     BOOLEAN NOT NULL DEFAULT true
);

-- Vector search index
CREATE INDEX IF NOT EXISTS images_embedding_idx
  ON images USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Feedback table
CREATE TABLE IF NOT EXISTS image_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id        UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  query_text      TEXT NOT NULL,
  query_embedding VECTOR(1536),
  feedback        TEXT NOT NULL CHECK (feedback IN ('relevant', 'irrelevant')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS image_feedback_image_id_idx ON image_feedback (image_id);
CREATE INDEX IF NOT EXISTS image_feedback_feedback_idx ON image_feedback (feedback);

-- Search RPC function
CREATE OR REPLACE FUNCTION search_images(
  query_vector VECTOR(1536),
  match_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  r2_url TEXT,
  uploaded_at TIMESTAMPTZ,
  memo TEXT,
  ai_description TEXT,
  vector_score FLOAT,
  feedback_score FLOAT,
  final_score FLOAT
)
LANGUAGE SQL
AS $$
  SELECT
    i.id,
    i.r2_url,
    i.uploaded_at,
    i.memo,
    i.ai_description,
    1 - (i.embedding <=> query_vector) AS vector_score,
    COALESCE(
      SUM(CASE WHEN f.feedback = 'relevant' THEN 0.1 ELSE 0 END) -
      SUM(CASE WHEN f.feedback = 'irrelevant' THEN 0.15 ELSE 0 END),
      0
    ) AS feedback_score,
    (1 - (i.embedding <=> query_vector)) +
    COALESCE(
      SUM(CASE WHEN f.feedback = 'relevant' THEN 0.1 ELSE 0 END) -
      SUM(CASE WHEN f.feedback = 'irrelevant' THEN 0.15 ELSE 0 END),
      0
    ) AS final_score
  FROM images i
  LEFT JOIN image_feedback f
    ON f.image_id = i.id
    AND 1 - (f.query_embedding <=> query_vector) > 0.85
  WHERE
    i.is_active = true
    AND i.embedding IS NOT NULL
  GROUP BY i.id
  ORDER BY final_score DESC
  LIMIT match_limit;
$$;

-- Helper function for finding similar feedback (used by feedback API)
CREATE OR REPLACE FUNCTION find_similar_feedback(
  p_image_id UUID,
  p_query_embedding VECTOR(1536),
  p_threshold FLOAT DEFAULT 0.95
)
RETURNS TABLE (id UUID, feedback TEXT)
LANGUAGE SQL
AS $$
  SELECT id, feedback
  FROM image_feedback
  WHERE image_id = p_image_id
    AND 1 - (query_embedding <=> p_query_embedding) > p_threshold
  LIMIT 1;
$$;

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS file_type TEXT;

-- Update search RPC to return file meta
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
  file_name TEXT,
  file_size BIGINT,
  file_type TEXT,
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
    i.file_name,
    i.file_size,
    i.file_type,
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

-- フィードバックスコアを除去し、ベクトル類似度のみでランキング
CREATE OR REPLACE FUNCTION search_images(
  query_vector VECTOR(1536),
  match_limit INT DEFAULT 20,
  match_threshold FLOAT DEFAULT 0.25
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
    0::FLOAT AS feedback_score,
    1 - (i.embedding <=> query_vector) AS final_score
  FROM images i
  WHERE
    i.is_active = true
    AND i.embedding IS NOT NULL
    AND (1 - (i.embedding <=> query_vector)) > match_threshold
  ORDER BY final_score DESC
  LIMIT match_limit;
$$;

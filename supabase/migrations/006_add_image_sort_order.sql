-- イベント内の画像の表示順（ドラッグ&ドロップ並び替え用）
ALTER TABLE images ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- 既存データを登録順（uploaded_at昇順）で初期化
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY uploaded_at ASC) - 1 AS rn
  FROM images
  WHERE event_id IS NOT NULL
)
UPDATE images SET sort_order = ranked.rn
FROM ranked
WHERE images.id = ranked.id;

CREATE INDEX IF NOT EXISTS images_event_sort_idx ON images (event_id, sort_order);

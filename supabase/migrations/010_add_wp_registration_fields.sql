-- WordPress登録結果の永続化（実際にWPへ登録されたファイル名・URLはWP側でのサニタイズにより
-- images.file_name と異なる場合があるため、実際の登録結果を別途保持する）
ALTER TABLE images
  ADD COLUMN IF NOT EXISTS wp_file_name TEXT,
  ADD COLUMN IF NOT EXISTS wp_url TEXT,
  ADD COLUMN IF NOT EXISTS wp_registered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 外部連携（差分取得）で使うためのインデックス
CREATE INDEX IF NOT EXISTS images_updated_at_idx ON images (updated_at);

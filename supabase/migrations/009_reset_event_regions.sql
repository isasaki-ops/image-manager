-- 「地方タグは登録者が明示的に選ぶもの」という運用に変更したため、
-- 既存イベントの地方タグを一旦すべて解除する。以後、地方タグが空のイベントは
-- アプリ側で「設定なし」という派生カテゴリとして扱われる。
ALTER TABLE events ALTER COLUMN region_ids SET DEFAULT '{}';

UPDATE events SET region_ids = '{}';

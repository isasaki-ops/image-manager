-- 1. category_id に '03'（収録）を許可する
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%category_id%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE events DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE events ADD CONSTRAINT events_category_id_check CHECK (category_id IN ('01', '02', '03'));

-- 2. 一度きりの振り直し: event_codeの4桁部分を登録日時順の単一連番に統一する
--    （プレフィックスは各イベント現在のcategory_idのまま変更しない）
--    UNIQUE制約は行ごとの更新中に一時的な重複が生じるため、振り直しの間だけ外す
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_code_key;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM events
)
UPDATE events e
SET event_code = e.category_id || '-' || LPAD(ordered.rn::TEXT, 4, '0')
FROM ordered
WHERE e.id = ordered.id;

ALTER TABLE events ADD CONSTRAINT events_event_code_key UNIQUE (event_code);

-- 3. 今後の採番用に単一シーケンスを用意し、振り直し後の件数から継続させる
--    （005で作った events_cat_01_seq / events_cat_02_seq は使われなくなるがそのまま残す）
CREATE SEQUENCE IF NOT EXISTS events_seq;
SELECT setval('events_seq', (SELECT COUNT(*) FROM events), true);

-- 4. INSERT時: カテゴリ別ではなく単一シーケンスから採番する
--    generate_event_code()（005で定義、trg_event_codeから呼ばれる）はnext_event_code()を
--    呼ぶだけなので変更不要
CREATE OR REPLACE FUNCTION next_event_code(p_category_id TEXT)
RETURNS TEXT AS $$
DECLARE
  next_seq BIGINT;
BEGIN
  next_seq := nextval('events_seq');
  RETURN p_category_id || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 5. カテゴリ変更時: 新規採番せず、既存の番号を維持してプレフィックスだけ差し替える
--    trg_event_code_recategorize（007で定義）はこの関数を呼ぶだけなので変更不要
CREATE OR REPLACE FUNCTION regenerate_event_code_on_category_change()
RETURNS TRIGGER AS $$
BEGIN
  NEW.event_code := NEW.category_id || '-' || split_part(OLD.event_code, '-', 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

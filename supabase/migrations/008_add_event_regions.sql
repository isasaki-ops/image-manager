-- Region tags for events (multi-select; an event can belong to multiple regions).
-- Existing rows default to all 6 regions checked (safe default until manually reviewed);
-- new events also start with all 6 checked and the registrant unchecks what doesn't apply.
ALTER TABLE events
  ADD COLUMN region_ids TEXT[] NOT NULL DEFAULT ARRAY[
    'hokkaido', 'tohoku', 'kanto', 'tokai', 'kansai', 'kyushu'
  ];

ALTER TABLE events
  ADD CONSTRAINT events_region_ids_valid CHECK (
    region_ids <@ ARRAY['hokkaido', 'tohoku', 'kanto', 'tokai', 'kansai', 'kyushu']::text[]
  );

-- Speeds up the OR-overlap filter used on the TOP page (region_ids && ARRAY[...]).
CREATE INDEX IF NOT EXISTS events_region_ids_idx ON events USING GIN (region_ids);

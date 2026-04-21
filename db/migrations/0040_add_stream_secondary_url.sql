-- Add optional secondary stream URL for primary/substream/fallback camera sources

-- migrate:up
ALTER TABLE streams ADD COLUMN secondary_url TEXT DEFAULT '';

-- migrate:down
-- SQLite does not support DROP COLUMN in older versions; migration is left intentionally empty.

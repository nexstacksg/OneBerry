-- Add archive segment metadata for faster timeline lookup and playback seek planning

-- migrate:up

ALTER TABLE recordings ADD COLUMN container TEXT DEFAULT 'mp4';
ALTER TABLE recordings ADD COLUMN duration_ms INTEGER DEFAULT 0;
ALTER TABLE recordings ADD COLUMN first_keyframe_time INTEGER DEFAULT NULL;
ALTER TABLE recordings ADD COLUMN last_keyframe_time INTEGER DEFAULT NULL;
ALTER TABLE recordings ADD COLUMN first_pts INTEGER DEFAULT NULL;
ALTER TABLE recordings ADD COLUMN last_pts INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_recordings_stream_complete_time
ON recordings(stream_name, is_complete, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_recordings_cleanup_complete_time
ON recordings(is_complete, start_time);

-- migrate:down

DROP INDEX IF EXISTS idx_recordings_cleanup_complete_time;
DROP INDEX IF EXISTS idx_recordings_stream_complete_time;
SELECT 1;

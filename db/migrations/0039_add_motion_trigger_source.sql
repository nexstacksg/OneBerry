-- Add motion_trigger_source column to streams table
-- This supports cross-stream motion triggering: when a stream has
-- motion_trigger_source set to another stream's name, its recording
-- is triggered by motion events from that source stream.
-- Useful for dual-lens cameras (e.g. TP-Link C545D) where the fixed
-- wide-angle lens provides ONVIF motion events but the PTZ lens does not.

-- migrate:up
ALTER TABLE streams ADD COLUMN motion_trigger_source TEXT DEFAULT '';

-- migrate:down
-- SQLite does not support DROP COLUMN in older versions; migration is left intentionally empty.


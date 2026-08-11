-- 0006: indexes for the register feed and saved-area lookups.
--
-- /incidents/mine scans by owner; the public feed already uses
-- incidents_created_idx (moderation_status, created_at DESC). Saved-area
-- alert polling and overlap checks scan saved_areas by bounds.
CREATE INDEX incidents_user_created_idx ON incidents (user_id, created_at DESC);
CREATE INDEX saved_areas_bounds_gix ON saved_areas USING gist (bounds);

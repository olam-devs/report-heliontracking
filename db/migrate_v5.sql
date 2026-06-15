USE fleet_incidents;

-- Tracking / Daily report portal module access
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_tracking TINYINT(1) NOT NULL DEFAULT 0;


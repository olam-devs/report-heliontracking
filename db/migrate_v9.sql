-- v9: add read-tracking for notifications
ALTER TABLE mechanic_logs ADD COLUMN IF NOT EXISTS seen_by_admin TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE mechanic_admin_notes ADD COLUMN IF NOT EXISTS seen_by_mechanic TINYINT(1) NOT NULL DEFAULT 0;

USE fleet_incidents;

ALTER TABLE users ADD COLUMN IF NOT EXISTS tracking_page_access JSON NULL;

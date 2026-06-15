USE fleet_incidents;

-- 1. Create case_drivers junction table (many-to-many)
CREATE TABLE IF NOT EXISTS case_drivers (
  case_id   VARCHAR(20) NOT NULL,
  driver_id INT NOT NULL,
  linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, driver_id),
  FOREIGN KEY (case_id)   REFERENCES cases(id)   ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id)  ON DELETE CASCADE
);

-- 2. Migrate existing driver_id relationships
INSERT IGNORE INTO case_drivers (case_id, driver_id)
SELECT id, driver_id FROM cases WHERE driver_id IS NOT NULL;

-- 3. Drop driver_id column from cases (disabling FK checks to avoid constraint name lookup)
SET FOREIGN_KEY_CHECKS = 0;
ALTER TABLE cases DROP COLUMN driver_id;
SET FOREIGN_KEY_CHECKS = 1;

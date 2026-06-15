-- Migration: add drivers table, driver_id to cases, update status values, add case_access to users,
--            make evidence_files.step_id nullable + add case_id, convert evidence steps to text.
-- Run once on existing databases. Safe to re-run (uses IF NOT EXISTS / IGNORE where possible).

USE fleet_incidents;

-- 1. Add case_access column to users (MySQL 8.0: ADD COLUMN IF NOT EXISTS)
ALTER TABLE users ADD COLUMN IF NOT EXISTS case_access JSON DEFAULT NULL;

-- 2. Create drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  vehicle_plate VARCHAR(50),
  employee_id   VARCHAR(50),
  notes         TEXT,
  created_by    INT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 3. Add driver_id column to cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS driver_id INT AFTER id;

-- 4. Add FK for driver_id (ignore error if already exists)
ALTER TABLE cases ADD CONSTRAINT fk_cases_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;

-- 5. Migrate existing status values before changing enum
UPDATE cases SET status = 'ongoing' WHERE status IN ('open', 'investigating');

-- 6. Update the status enum to new values
ALTER TABLE cases MODIFY COLUMN status ENUM('ongoing','completed','closed') DEFAULT 'ongoing';

-- 7. Make evidence_files.step_id nullable (allows case-level general evidence)
ALTER TABLE evidence_files MODIFY COLUMN step_id INT NULL;

-- 8. Add case_id to evidence_files for general (case-level) evidence
ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS case_id VARCHAR(20) NULL AFTER step_id;
ALTER TABLE evidence_files ADD CONSTRAINT fk_evidence_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;

-- 9. Convert legacy 'evidence' steps to 'text' steps (note field becomes the evidence description)
UPDATE steps SET type = 'text' WHERE type = 'evidence';

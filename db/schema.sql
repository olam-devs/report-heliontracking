CREATE DATABASE IF NOT EXISTS fleet_incidents CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fleet_incidents;

CREATE TABLE IF NOT EXISTS users (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(100) NOT NULL,
  email                VARCHAR(150) UNIQUE NOT NULL,
  password             VARCHAR(255) NOT NULL,
  role                 ENUM('reporter','manager','hr','admin') DEFAULT 'reporter',
  is_active            TINYINT(1) NOT NULL DEFAULT 1,
  case_access          JSON DEFAULT NULL,
  driver_access        JSON DEFAULT NULL,
  case_specific_access JSON DEFAULT NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS cases (
  id            VARCHAR(20) PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  vehicle_plate VARCHAR(50),
  driver_name   VARCHAR(100),
  incident_date DATE,
  status        ENUM('ongoing','completed','closed') DEFAULT 'ongoing',
  severity      ENUM('low','medium','high') DEFAULT 'medium',
  created_by    INT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS case_drivers (
  case_id   VARCHAR(20) NOT NULL,
  driver_id INT NOT NULL,
  linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, driver_id),
  FOREIGN KEY (case_id)   REFERENCES cases(id)   ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS steps (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  case_id     VARCHAR(20) NOT NULL,
  step_order  INT NOT NULL DEFAULT 0,
  type        ENUM('text','evidence') NOT NULL DEFAULT 'text',
  label       VARCHAR(255),
  content     TEXT,
  note        TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence_files (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  step_id     INT NULL,
  case_id     VARCHAR(20) NULL,
  file_name   VARCHAR(255),
  file_path   VARCHAR(500),
  file_type   ENUM('image','video','document','audio'),
  mime_type   VARCHAR(100),
  file_size   BIGINT,
  description TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS templates (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  language    ENUM('Swahili','English','Both') DEFAULT 'Both',
  sections    JSON,
  created_by  INT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

USE fleet_incidents;

-- Vehicle access grants (expires at end of the granted day)
CREATE TABLE IF NOT EXISTS mechanic_vehicle_access (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  mechanic_user_id INT NOT NULL,
  devIdno       VARCHAR(100) NOT NULL,
  plate         VARCHAR(50)  NOT NULL,
  can_see_status TINYINT(1)  NOT NULL DEFAULT 0,
  granted_by    INT          NOT NULL,
  granted_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME     NOT NULL,
  revoked_at    DATETIME     NULL,
  FOREIGN KEY (mechanic_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by)       REFERENCES users(id) ON DELETE CASCADE
);

-- Work log entries added by mechanic
CREATE TABLE IF NOT EXISTS mechanic_logs (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  mechanic_user_id INT          NOT NULL,
  devIdno          VARCHAR(100) NOT NULL,
  plate            VARCHAR(50)  NOT NULL,
  note             TEXT         NOT NULL,
  log_date         DATE         NOT NULL,
  recorded_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mechanic_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Attachments (photos/docs) linked to a log entry
CREATE TABLE IF NOT EXISTS mechanic_attachments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  log_id        INT          NOT NULL,
  filename      VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100),
  uploaded_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (log_id) REFERENCES mechanic_logs(id) ON DELETE CASCADE
);

-- Admin notes left on a vehicle for mechanics to read
CREATE TABLE IF NOT EXISTS mechanic_admin_notes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  devIdno    VARCHAR(100) NOT NULL,
  plate      VARCHAR(50)  NOT NULL,
  note       TEXT         NOT NULL,
  created_by INT          NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

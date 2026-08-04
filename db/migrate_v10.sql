CREATE TABLE IF NOT EXISTS mechanic_pending_vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  devIdno VARCHAR(50) NOT NULL,
  plate VARCHAR(50),
  reason TEXT,
  marked_by INT,
  marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_devIdno (devIdno)
);

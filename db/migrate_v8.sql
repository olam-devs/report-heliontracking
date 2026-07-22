-- v8: add mechanic to role ENUM
ALTER TABLE users MODIFY COLUMN role ENUM('reporter','manager','hr','admin','mechanic') DEFAULT 'reporter';

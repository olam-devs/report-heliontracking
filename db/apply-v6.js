require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fleet_incidents',
  });
  const db = process.env.DB_NAME || 'fleet_incidents';
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'tracking_page_access'`,
    [db],
  );
  if (!cols.length) {
    await conn.query('ALTER TABLE users ADD COLUMN tracking_page_access JSON NULL');
    console.log('tracking_page_access column added');
  } else {
    console.log('tracking_page_access already exists');
  }
  await conn.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

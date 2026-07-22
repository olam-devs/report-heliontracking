require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, 'db', 'migrate_v7.sql'), 'utf8');

mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'fleet_incidents',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  multipleStatements: true,
}).query(sql).then(() => {
  console.log('Migration v7 done: mechanic tables created.');
  process.exit(0);
}).catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});

// Run this once on VPS: node fix-db-config.js
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'src/config/db.js');
const content = `const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'fleet_incidents',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true,
});

module.exports = pool;
`;

fs.writeFileSync(target, content, 'utf8');
console.log('Written:', target);
console.log(fs.readFileSync(target, 'utf8'));

/**
 * List all companies and their IDs
 * Run on VPS: node scripts\probe_companies.js
 */
const mysql = require('mysql2/promise');
const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

(async () => {
  const conn = await mysql.createConnection(DB);

  const [companies] = await conn.query(
    `SELECT ID, Name, Abbreviation, ParentCompanyID FROM jt808_company_info ORDER BY ParentCompanyID, ID`);
  console.log('\nAll companies:');
  companies.forEach(c =>
    console.log(`  ID=${c.ID}  Parent=${c.ParentCompanyID}  Name="${c.Name}"  Abbr="${c.Abbreviation}"`)
  );

  // Vehicle count per company
  const [vcnt] = await conn.query(`
    SELECT vi.CompanyID, COUNT(*) AS cnt
    FROM jt808_vehicle_info vi GROUP BY vi.CompanyID ORDER BY cnt DESC`);
  console.log('\nVehicle counts per company:');
  vcnt.forEach(r => console.log(`  CompanyID=${r.CompanyID}  vehicles=${r.cnt}`));

  await conn.end();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });

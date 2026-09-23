/**
 * Check actual SWeiDu/SJingDu values in jt808_vehicle_daily
 * Run on VPS: node scripts\probe_daily_coords.js
 */
const mysql = require('mysql2/promise');
const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

(async () => {
  const conn = await mysql.createConnection(DB);

  // 1. How many rows have non-zero start coords?
  const [[cnt]] = await conn.query(`
    SELECT
      COUNT(*) AS total,
      SUM(SWeiDu != 0 AND SJingDu != 0) AS hasStart,
      SUM(EWeiDu != 0 AND EJingDu != 0) AS hasEnd
    FROM jt808_vehicle_daily
    WHERE GPSDate >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)`);
  console.log(`Total rows (6mo): ${cnt.total}  non-zero start: ${cnt.hasStart}  non-zero end: ${cnt.hasEnd}`);

  // 2. Sample 5 rows with non-zero coords
  const [samples] = await conn.query(`
    SELECT vi.VehiIDNO AS plate, vd.GPSDate, vd.SJingDu, vd.SWeiDu, vd.EJingDu, vd.EWeiDu,
           vd.SJingDu/1000000 AS sLng_div1e6, vd.SWeiDu/1000000 AS sLat_div1e6
    FROM jt808_vehicle_daily vd
    JOIN jt808_vehicle_info vi ON vi.ID = vd.VehiID
    WHERE vd.SWeiDu != 0 AND vd.SJingDu != 0
      AND vd.GPSDate >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)
    LIMIT 5`);
  console.log('\nSample rows with non-zero coords:');
  samples.forEach(r => {
    console.log(`  ${r.plate}  ${String(r.GPSDate).slice(0,10)}  SJingDu=${r.SJingDu}  SWeiDu=${r.SWeiDu}`);
    console.log(`    → ÷1e6: lng=${r.sLng_div1e6}  lat=${r.sLat_div1e6}`);
  });

  // 3. Check the one that matched: print its raw coords
  const [match] = await conn.query(`
    SELECT vi.VehiIDNO AS plate, vd.GPSDate,
           vd.SJingDu, vd.SWeiDu, vd.EJingDu, vd.EWeiDu,
           vd.SJingDu/1000000 AS sLng, vd.SWeiDu/1000000 AS sLat,
           vd.EJingDu/1000000 AS eLng, vd.EWeiDu/1000000 AS eLat
    FROM jt808_vehicle_daily vd
    JOIN jt808_vehicle_info vi ON vi.ID = vd.VehiID
    JOIN jt808_company_info co ON co.ID = vi.CompanyID
    WHERE co.ID = 9
      AND vd.SWeiDu != 0
      AND vd.GPSDate >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)
    LIMIT 10`);
  console.log('\nDistribution rows with non-zero coords (raw):');
  match.forEach(r => {
    console.log(`  ${r.plate}  ${String(r.GPSDate).slice(0,10)}`);
    console.log(`    start: lng=${r.sLng} lat=${r.sLat}`);
    console.log(`    end:   lng=${r.eLng} lat=${r.eLat}`);
  });

  await conn.end();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });

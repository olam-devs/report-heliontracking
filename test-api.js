const http = require('http');
require('dotenv').config();

// Step 1: login, Step 2: call admin/logs
const PORT = process.env.PORT || 3002;

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost', port: PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data),
                 ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    };
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: PORT, path, method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    };
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('\n=== Step 1: Login ===');
  const login = await post('/api/auth/login', { email: 'admin@heliontracking.com', password: 'Starlink@2026' });
  console.log('Status:', login.status);
  if (!login.body.token) { console.log('Login failed:', login.body); return; }
  const token = login.body.token;
  console.log('Token OK');

  console.log('\n=== Step 2: GET /api/mechanic/admin/logs (no filter) ===');
  const all = await get('/api/mechanic/admin/logs', token);
  console.log('Status:', all.status, '| Rows:', all.body.data?.length);
  if (all.body.error) console.log('Error:', all.body.error);

  console.log('\n=== Step 3: GET /api/mechanic/admin/logs?date_from=2026-07-29&date_to=2026-08-04 ===');
  const ranged = await get('/api/mechanic/admin/logs?date_from=2026-07-29&date_to=2026-08-04', token);
  console.log('Status:', ranged.status, '| Rows:', ranged.body.data?.length);
  if (ranged.body.error) console.log('Error:', ranged.body.error);
  else console.log('First log:', ranged.body.data?.[0]?.plate, ranged.body.data?.[0]?.log_date);

  console.log('\n=== Step 4: GET /api/mechanic/admin/vehicle-history?devIdno=14682601177&plate=T770EMX ===');
  const hist = await get('/api/mechanic/admin/vehicle-history?devIdno=14682601177&plate=T770EMX', token);
  console.log('Status:', hist.status, '| Rows:', hist.body.data?.length);
  if (hist.body.error) console.log('Error:', hist.body.error);
}

main().catch(e => { console.error(e.message); process.exit(1); });

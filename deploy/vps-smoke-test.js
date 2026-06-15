console.log('[smoke] node', process.version);
console.log('[smoke] cwd', process.cwd());
try {
  require('dotenv').config();
  console.log('[smoke] dotenv ok, PORT=', process.env.PORT || '(default 3500)');
  require('express');
  console.log('[smoke] express ok');
  require('mysql2/promise');
  console.log('[smoke] mysql2 ok');
  console.log('[smoke] PASS');
} catch (e) {
  console.error('[smoke] FAIL:', e.message);
  process.exit(1);
}

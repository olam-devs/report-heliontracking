const fs = require('fs');
const path = require('path');

const READS_FILE = path.join(__dirname, '../../data/tracking/notification-reads.json');

function loadReads() {
  try {
    if (fs.existsSync(READS_FILE)) {
      return JSON.parse(fs.readFileSync(READS_FILE, 'utf8'));
    }
  } catch (_) {}
  return { users: {} };
}

function saveReads(store) {
  const dir = path.dirname(READS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(READS_FILE + '.tmp', JSON.stringify(store, null, 2));
  fs.renameSync(READS_FILE + '.tmp', READS_FILE);
}

function getLastSeen(userId) {
  const store = loadReads();
  return store.users?.[String(userId)] || null;
}

function markSeen(userId, at = new Date().toISOString()) {
  const store = loadReads();
  if (!store.users) store.users = {};
  store.users[String(userId)] = at;
  saveReads(store);
  return at;
}

module.exports = { loadReads, saveReads, getLastSeen, markSeen };

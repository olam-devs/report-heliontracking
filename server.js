require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3500;
const isProd = process.env.NODE_ENV === 'production';

const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const extraOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsOrigins = [...new Set([...defaultOrigins, ...extraOrigins])];
if (isProd) {
  corsOrigins.push('https://report.heliontracking.com');
}

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/users',     require('./src/routes/users'));
app.use('/api/drivers',   require('./src/routes/drivers'));
app.use('/api/cases',     require('./src/routes/cases'));
app.use('/api/cases',     require('./src/routes/steps'));
app.use('/api/cases',     require('./src/routes/export'));
app.use('/api/steps',     require('./src/routes/evidence'));
app.use('/api/evidence',  require('./src/routes/evidence'));
app.use('/api/templates',        require('./src/routes/templates'));
app.use('/api/report-templates', require('./src/routes/reportTemplates'));
app.use('/api/roles',           require('./src/routes/customRoles'));
app.use('/api/cases/:caseId/report', require('./src/routes/caseReports'));
app.use('/api/tracking', require('./src/routes/tracking'));

const { startNotificationScanner } = require('./src/tracking/notification-scanner.service');
const dailyLog = require('./src/tracking/lib/services/daily-log.service');
const { purgeAllUncalibratedNotifications } = require('./src/tracking/fuel-insights.engine');
const { rebuildDangerZonesFromNotifications } = require('./src/tracking/danger-zones.service');

app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Production: serve built React app (same origin as API)
const clientDist = path.join(__dirname, 'client', 'dist');
if (isProd && fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Fleet Incident Reporter  →  http://localhost:${PORT} (${isProd ? 'production' : 'development'})`);
  setImmediate(() => {
    try {
      dailyLog.refreshVehicleMetaFromDisk();
      const purged = purgeAllUncalibratedNotifications((id) => dailyLog.getVehicleMeta(id));
      if (purged > 0) console.log(`[notifications] removed ${purged} stored alert(s) for uncalibrated vehicles`);
      const dz = rebuildDangerZonesFromNotifications((id) => dailyLog.getVehicleMeta(id));
      console.log(`[danger-zones] indexed ${dz} point(s) from notifications`);
    } catch (e) {
      console.error('[startup] tracking index failed:', e.message);
    }
    startNotificationScanner();
  });
});

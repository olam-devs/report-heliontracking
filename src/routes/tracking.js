const router = require('express').Router();
const auth = require('../middleware/auth');
const { requireTracking, requireTrackingPage, requireAnyTrackingPage } = require('../middleware/auth');
const c = require('../controllers/trackingController');

const VEHICLE_PAGES = ['daily_report', 'fuel_alerts', 'calibration'];

router.use(auth, requireTracking);

router.get('/health', c.health);
router.get('/page-access', c.getTrackingPageAccess);

router.get('/vehicles', requireAnyTrackingPage(VEHICLE_PAGES, 'view'), c.vehicles);

router.get('/daily-log/report/quick', requireTrackingPage('daily_report', 'view'), c.reportQuick);
router.patch('/daily-log/report/:id', requireAnyTrackingPage(['daily_report', 'calibration'], 'edit'), c.patchVehicle);
router.post('/daily-log/entries', requireTrackingPage('daily_report', 'edit'), c.createVehicleEntry);
router.get('/daily-log/vehicle/:id/history', requireTrackingPage('daily_report', 'view'), c.vehicleHistory);
router.get('/daily-log/vehicle/:id/manual-history', requireTrackingPage('daily_report', 'view'), c.vehicleManualHistory);
router.post('/daily-log/bulk-bundle', requireTrackingPage('daily_report', 'edit'), c.bulkBundle);
router.post('/daily-log/bulk-driver', requireTrackingPage('daily_report', 'edit'), c.bulkDriver);

router.post('/analytics/run', requireTrackingPage('fuel_alerts', 'edit'), c.runFuelAnalysis);
router.get('/analytics/fuel-drops', requireTrackingPage('fuel_alerts', 'view'), c.runFuelAnalysis);

router.get('/notifications', requireTrackingPage('notifications', 'view'), c.listNotifications);
router.get('/notifications/unread-count', requireTrackingPage('notifications', 'view'), c.unreadNotificationCount);
router.post('/notifications/mark-seen', requireTrackingPage('notifications', 'view'), c.markNotificationsSeen);
router.post('/notifications/scan', requireTrackingPage('notifications', 'edit'), c.triggerNotificationScan);
router.get('/alerts/search', requireTrackingPage('notifications', 'view'), c.searchAlerts);

router.get('/settings', requireTrackingPage('fuel_alerts', 'view'), c.getTrackingSettings);
router.patch('/settings', requireTrackingPage('fuel_alerts', 'edit'), c.patchTrackingSettings);

router.get('/danger-zones', requireTrackingPage('danger_zones', 'view'), c.listDangerZones);
router.post('/danger-zones/rebuild', requireTrackingPage('danger_zones', 'edit'), c.rebuildDangerZones);
router.get('/danger-zones/:id/notifications', requireTrackingPage('danger_zones', 'view'), c.getDangerZoneNotifications);
router.patch('/danger-zones/:id', requireTrackingPage('danger_zones', 'edit'), c.patchDangerZone);

module.exports = router;

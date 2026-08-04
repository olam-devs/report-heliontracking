const M = require('../models/MechanicModel');
const cms = require('../tracking/lib/services/cmsv6.service');

const ok  = (res, data, meta = {}) => res.json({ success: true, ...meta, data });
const err = (res, msg, status = 400) => res.status(status).json({ success: false, error: msg });

// ── Mechanic: list accessible vehicles (kept for compat) ─────────────────────

exports.myVehicles = async (req, res) => {
  try {
    const grants = await M.getActiveAccessForMechanic(req.user.id);
    ok(res, grants);
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: all fleet vehicles (full-time access) ──────────────────────────

exports.allVehicles = async (req, res) => {
  try {
    const raw = await cms.getAllGPS().catch(() => []);
    ok(res, raw.map(v => ({
      devIdno: String(v.devIdno || v.id || ''),
      plate:   v.plate || v.nm || String(v.devIdno || v.id || ''),
      online:  (v.ol ?? v.online ?? 0) !== 0,
      accOn:   v.accOn ?? null,
      fuel:    v.fuel  ?? null,
    })));
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: live vehicle status ────────────────────────────────────────────

exports.vehicleStatus = async (req, res) => {
  try {
    const statuses = await cms.getAllGPS().catch(() => []);
    const s = statuses.find(x => String(x.devIdno || x.id) === String(req.params.devIdno));
    ok(res, s || null);
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: add log (no access check — full fleet access) ──────────────────

exports.addLog = async (req, res) => {
  try {
    const { devIdno, plate, note, log_date } = req.body;
    if (!note?.trim()) return err(res, 'Note is required');
    if (!devIdno) return err(res, 'devIdno is required');
    const id = await M.createLog({ mechanic_user_id: req.user.id, devIdno, plate: plate || devIdno, note: note.trim(), log_date });
    const log = await M.getLogById(id);
    ok(res, { ...log, attachments: [] }, { status: 201 });
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: upload attachment ──────────────────────────────────────────────

exports.addAttachment = async (req, res) => {
  try {
    const log = await M.getLogById(req.params.logId);
    if (!log) return err(res, 'Log not found', 404);
    if (log.mechanic_user_id !== req.user.id && req.user.role !== 'admin') return err(res, 'Forbidden', 403);
    if (!req.file) return err(res, 'No file uploaded');
    const id = await M.addAttachment({
      log_id: log.id,
      filename: req.file.filename,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
    });
    ok(res, { id, log_id: log.id, filename: req.file.filename, original_name: req.file.originalname, mime_type: req.file.mimetype });
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: get my logs for a vehicle ──────────────────────────────────────

exports.myLogs = async (req, res) => {
  try {
    const { devIdno, date } = req.query;
    const logs = await M.getLogsForVehicle({ mechanic_user_id: req.user.id, devIdno, date });
    const ids = logs.map(l => l.id);
    const attachments = ids.length ? await M.getAttachmentsForLogs(ids) : [];
    const byLog = {};
    for (const a of attachments) { (byLog[a.log_id] = byLog[a.log_id] || []).push(a); }
    ok(res, logs.map(l => ({ ...l, attachments: byLog[l.id] || [] })));
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: all vehicles I've ever worked on ────────────────────────────────

exports.myWorkedVehicles = async (req, res) => {
  try {
    const vehicles = await M.getWorkedVehicles(req.user.id);
    ok(res, vehicles);
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: get admin notes for one vehicle ─────────────────────────────────

exports.adminNotes = async (req, res) => {
  try {
    const notes = await M.getAdminNotes(req.params.devIdno);
    ok(res, notes);
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: all admin notes across all my vehicles ─────────────────────────

exports.myAllNotes = async (req, res) => {
  try {
    ok(res, await M.getAdminNotesForMechanic(req.user.id));
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: mark admin notes read for a vehicle ─────────────────────────────

exports.markNotesRead = async (req, res) => {
  try {
    await M.markNotesReadForVehicle(req.params.devIdno);
    ok(res, { marked: true });
  } catch (e) { err(res, e.message, 500); }
};

// ── Pending vehicles ──────────────────────────────────────────────────────────

exports.getPendingVehicles = async (req, res) => {
  try { ok(res, await M.getPendingVehicles()); }
  catch (e) { err(res, e.message, 500); }
};

exports.markPending = async (req, res) => {
  try {
    const { devIdno, plate, reason } = req.body;
    if (!devIdno) return err(res, 'devIdno required');
    await M.markVehiclePending({ devIdno, plate, reason, marked_by: req.user.id });
    ok(res, { marked: true });
  } catch (e) { err(res, e.message, 500); }
};

exports.unmarkPending = async (req, res) => {
  try {
    await M.unmarkVehiclePending(req.params.devIdno);
    ok(res, { unmarked: true });
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: get all active grants ─────────────────────────────────────────────

exports.adminListAccess = async (req, res) => {
  try {
    ok(res, await M.getAllActiveAccess());
  } catch (e) { err(res, e.message, 500); }
};

exports.adminGrantAccess = async (req, res) => {
  try {
    const { mechanic_user_id, devIdno, plate, can_see_status } = req.body;
    if (!mechanic_user_id || !devIdno) return err(res, 'mechanic_user_id and devIdno are required');
    const id = await M.grantAccess({ mechanic_user_id, devIdno, plate: plate || devIdno, can_see_status: !!can_see_status, granted_by: req.user.id });
    ok(res, { id });
  } catch (e) { err(res, e.message, 500); }
};

exports.adminRevokeAccess = async (req, res) => {
  try {
    await M.revokeAccess(req.params.id);
    ok(res, { revoked: true });
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: view logs ──────────────────────────────────────────────────────────

exports.adminLogs = async (req, res) => {
  try {
    let { date_from, date_to, mechanic_user_id, devIdno, plate } = req.query;
    if (date_from && date_to) {
      const diff = (new Date(date_to) - new Date(date_from)) / 86400000;
      if (diff > 6) date_to = new Date(new Date(date_from).getTime() + 6 * 86400000).toISOString().slice(0, 10);
    }
    const logs = await M.getLogsForDate({ date_from, date_to, mechanic_user_id, devIdno, plate });
    const ids = logs.map(l => l.id);
    const attachments = ids.length ? await M.getAttachmentsForLogs(ids) : [];
    const byLog = {};
    for (const a of attachments) { (byLog[a.log_id] = byLog[a.log_id] || []).push(a); }
    ok(res, logs.map(l => ({ ...l, attachments: byLog[l.id] || [] })));
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: full vehicle history (all dates) ───────────────────────────────────

exports.adminVehicleHistory = async (req, res) => {
  try {
    const { devIdno, plate, mechanic_user_id } = req.query;
    if (!devIdno && !plate) return err(res, 'devIdno or plate is required');
    const logs = await M.getLogsForVehicle({
      devIdno: devIdno || null,
      plate: plate || null,
      mechanic_user_id: mechanic_user_id || null,
    });
    const ids = logs.map(l => l.id);
    const attachments = ids.length ? await M.getAttachmentsForLogs(ids) : [];
    const byLog = {};
    for (const a of attachments) { (byLog[a.log_id] = byLog[a.log_id] || []).push(a); }
    ok(res, logs.map(l => ({ ...l, attachments: byLog[l.id] || [] })));
  } catch (e) {
    console.error('[adminVehicleHistory]', e);
    err(res, e.message, 500);
  }
};

// ── Admin: add / edit / delete note ──────────────────────────────────────────

exports.adminAddNote = async (req, res) => {
  try {
    const { devIdno, plate, note } = req.body;
    if (!devIdno || !note?.trim()) return err(res, 'devIdno and note are required');
    const id = await M.addAdminNote({ devIdno, plate: plate || devIdno, note: note.trim(), created_by: req.user.id });
    ok(res, { id });
  } catch (e) { err(res, e.message, 500); }
};

exports.adminDeleteNote = async (req, res) => {
  try {
    await M.deleteAdminNote(req.params.id);
    ok(res, { deleted: true });
  } catch (e) { err(res, e.message, 500); }
};

exports.adminEditNote = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note?.trim()) return err(res, 'Note text is required');
    await M.updateAdminNote(req.params.id, note.trim());
    ok(res, { updated: true });
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: unread logs count ──────────────────────────────────────────────────

exports.adminUnreadCount = async (req, res) => {
  try { ok(res, { count: await M.getUnreadLogsCount() }); }
  catch (e) { err(res, e.message, 500); }
};

exports.adminMarkLogsRead = async (req, res) => {
  try {
    const { ids } = req.body;
    await M.markLogsRead(ids);
    ok(res, { marked: ids?.length || 0 });
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: list mechanic users ────────────────────────────────────────────────

exports.adminMechanics = async (req, res) => {
  try {
    ok(res, await M.getMechanics());
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: all admin notes ────────────────────────────────────────────────────

exports.adminAllNotes = async (req, res) => {
  try {
    ok(res, await M.getAllAdminNotes());
  } catch (e) { err(res, e.message, 500); }
};

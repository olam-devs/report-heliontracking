const M = require('../models/MechanicModel');
const cms = require('../tracking/lib/services/cmsv6.service');

const ok  = (res, data, meta = {}) => res.json({ success: true, ...meta, data });
const err = (res, msg, status = 400) => res.status(status).json({ success: false, error: msg });

// ── Mechanic: list accessible vehicles ───────────────────────────────────────

exports.myVehicles = async (req, res) => {
  try {
    const grants = await M.getActiveAccessForMechanic(req.user.id);
    ok(res, grants);
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: live vehicle status (only if can_see_status) ───────────────────

exports.vehicleStatus = async (req, res) => {
  try {
    const grant = await M.checkAccess(req.user.id, req.params.devIdno);
    if (!grant) return err(res, 'No access to this vehicle', 403);
    if (!grant.can_see_status) return err(res, 'Status access not granted', 403);
    const statuses = await cms.getAllGPS().catch(() => []);
    const s = statuses.find(x => String(x.devIdno || x.id) === String(req.params.devIdno));
    ok(res, s || null);
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: add log ────────────────────────────────────────────────────────

exports.addLog = async (req, res) => {
  try {
    const { devIdno, plate, note, log_date } = req.body;
    if (!note?.trim()) return err(res, 'Note is required');
    if (!devIdno) return err(res, 'devIdno is required');
    const grant = await M.checkAccess(req.user.id, devIdno);
    if (!grant) return err(res, 'No access to this vehicle today', 403);
    const id = await M.createLog({ mechanic_user_id: req.user.id, devIdno, plate: plate || grant.plate, note: note.trim(), log_date });
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
    const attachments = await M.getAttachmentsForLogs(logs.map(l => l.id));
    const byLog = {};
    for (const a of attachments) { (byLog[a.log_id] = byLog[a.log_id] || []).push(a); }
    ok(res, logs.map(l => ({ ...l, attachments: byLog[l.id] || [] })));
  } catch (e) { err(res, e.message, 500); }
};

// ── Mechanic: get admin notes for a vehicle ───────────────────────────────────

exports.adminNotes = async (req, res) => {
  try {
    const notes = await M.getAdminNotes(req.params.devIdno);
    ok(res, notes);
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: get all active grants ─────────────────────────────────────────────

exports.adminListAccess = async (req, res) => {
  try {
    ok(res, await M.getAllActiveAccess());
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: grant access ───────────────────────────────────────────────────────

exports.adminGrantAccess = async (req, res) => {
  try {
    const { mechanic_user_id, devIdno, plate, can_see_status } = req.body;
    if (!mechanic_user_id || !devIdno) return err(res, 'mechanic_user_id and devIdno are required');
    const id = await M.grantAccess({ mechanic_user_id, devIdno, plate: plate || devIdno, can_see_status: !!can_see_status, granted_by: req.user.id });
    ok(res, { id });
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: revoke access ──────────────────────────────────────────────────────

exports.adminRevokeAccess = async (req, res) => {
  try {
    await M.revokeAccess(req.params.id);
    ok(res, { revoked: true });
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: view logs ──────────────────────────────────────────────────────────

exports.adminLogs = async (req, res) => {
  try {
    const { date, mechanic_user_id, devIdno } = req.query;
    const logs = await M.getLogsForDate({ date, mechanic_user_id, devIdno });
    const attachments = await M.getAttachmentsForLogs(logs.map(l => l.id));
    const byLog = {};
    for (const a of attachments) { (byLog[a.log_id] = byLog[a.log_id] || []).push(a); }
    ok(res, logs.map(l => ({ ...l, attachments: byLog[l.id] || [] })));
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: add note for mechanics ─────────────────────────────────────────────

exports.adminAddNote = async (req, res) => {
  try {
    const { devIdno, plate, note } = req.body;
    if (!devIdno || !note?.trim()) return err(res, 'devIdno and note are required');
    const id = await M.addAdminNote({ devIdno, plate: plate || devIdno, note: note.trim(), created_by: req.user.id });
    ok(res, { id });
  } catch (e) { err(res, e.message, 500); }
};

// ── Admin: delete note ────────────────────────────────────────────────────────

exports.adminDeleteNote = async (req, res) => {
  try {
    await M.deleteAdminNote(req.params.id);
    ok(res, { deleted: true });
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

const db = require('../config/db');
const DriverModel = require('../models/DriverModel');
const CaseModel = require('../models/CaseModel');

exports.list = async (req, res) => {
  try {
    const { search } = req.query;
    const allowedDriverIds = req.user.driver_access || null;

    let effectiveDriverIds = allowedDriverIds;
    if (!effectiveDriverIds && req.user.case_specific_access?.length) {
      const caseIds = req.user.case_specific_access;
      const [rows] = await db.query(
        `SELECT DISTINCT driver_id FROM case_drivers WHERE case_id IN (${caseIds.map(() => '?').join(',')})`,
        caseIds
      );
      const ids = rows.map(r => r.driver_id);
      effectiveDriverIds = ids.length ? ids : [-1];
    }

    const drivers = await DriverModel.findAll({ search, allowedDriverIds: effectiveDriverIds });
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.show = async (req, res) => {
  try {
    const driver = await DriverModel.findById(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const allowedDriverIds = req.user.driver_access;
    const allowedCaseIds   = req.user.case_specific_access;
    if (allowedDriverIds && !allowedDriverIds.includes(Number(req.params.id))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cases = await CaseModel.findAll({
      driver_id:      req.params.id,
      allowedStatuses: req.user.case_access || null,
      allowedCaseIds:  allowedCaseIds       || null,
    });
    res.json({ ...driver, cases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, vehicle_plate, employee_id, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Driver name is required' });
    const id = await DriverModel.create({ name, vehicle_plate, employee_id, notes, created_by: req.user.id });
    const driver = await DriverModel.findById(id);
    res.status(201).json(driver);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const driver = await DriverModel.findById(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    await DriverModel.update(req.params.id, req.body);
    const updated = await DriverModel.findById(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.destroy = async (req, res) => {
  try {
    const driver = await DriverModel.findById(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    await DriverModel.delete(req.params.id);
    res.json({ message: 'Driver deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.linkCase = async (req, res) => {
  try {
    const { id, caseId } = req.params;
    const caseData = await CaseModel.findById(caseId);
    if (!caseData) return res.status(404).json({ error: `Case ${caseId} not found` });
    const driver = await DriverModel.findById(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    await CaseModel.linkDriver(caseId, id);
    const cases = await CaseModel.findAll({ driver_id: id });
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.unlinkCase = async (req, res) => {
  try {
    const { id, caseId } = req.params;
    await CaseModel.unlinkDriver(caseId, id);
    res.json({ message: 'Case unlinked from driver' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

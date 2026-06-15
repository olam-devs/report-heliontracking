const CaseModel = require('../models/CaseModel');
const StepModel = require('../models/StepModel');
const EvidenceModel = require('../models/EvidenceModel');

const getAccessFilters = (user) => ({
  allowedStatuses:     user.case_access          || null,
  allowedDriverIds:    user.driver_access        || null,
  allowedCaseIds:      user.case_specific_access || null,
});

exports.list = async (req, res) => {
  try {
    const { status, severity, search, driver_id } = req.query;
    const { allowedStatuses, allowedDriverIds, allowedCaseIds } = getAccessFilters(req.user);
    const cases = await CaseModel.findAll({ status, severity, search, driver_id, allowedStatuses, allowedDriverIds, allowedCaseIds });
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.show = async (req, res) => {
  try {
    const caseData = await CaseModel.findById(req.params.id);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const { allowedCaseIds, allowedDriverIds } = getAccessFilters(req.user);
    if (allowedCaseIds && !allowedCaseIds.includes(req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!allowedCaseIds && allowedDriverIds) {
      const linkedIds = (caseData.drivers || []).map(d => d.id);
      if (!linkedIds.some(id => allowedDriverIds.includes(id))) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const steps = await StepModel.findByCaseId(req.params.id);
    for (const step of steps) {
      step.files = await EvidenceModel.findByStepId(step.id);
    }
    const generalEvidence = await EvidenceModel.findByCaseId(req.params.id);

    res.json({ ...caseData, steps, generalEvidence });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listGeneralEvidence = async (req, res) => {
  try {
    const caseData = await CaseModel.findById(req.params.caseId);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });
    const files = await EvidenceModel.findByCaseId(req.params.caseId);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const id = await CaseModel.getNextId();
    const { driver_id, title, vehicle_plate, driver_name, incident_date, status, severity } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    await CaseModel.create({ id, title, vehicle_plate, driver_name, incident_date, status, severity, created_by: req.user.id });
    if (driver_id) {
      await CaseModel.linkDriver(id, driver_id);
    }
    const created = await CaseModel.findById(id);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const caseData = await CaseModel.findById(req.params.id);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });
    await CaseModel.update(req.params.id, req.body);
    const updated = await CaseModel.findById(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.destroy = async (req, res) => {
  try {
    const caseData = await CaseModel.findById(req.params.id);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });
    await CaseModel.delete(req.params.id);
    res.json({ message: 'Case deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.linkDriver = async (req, res) => {
  try {
    const { caseId, driverId } = req.params;
    const caseData = await CaseModel.findById(caseId);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });
    await CaseModel.linkDriver(caseId, driverId);
    const drivers = await CaseModel.getLinkedDrivers(caseId);
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.unlinkDriver = async (req, res) => {
  try {
    const { caseId, driverId } = req.params;
    await CaseModel.unlinkDriver(caseId, driverId);
    res.json({ message: 'Driver unlinked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

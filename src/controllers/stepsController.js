const StepModel = require('../models/StepModel');
const EvidenceModel = require('../models/EvidenceModel');
const CaseModel = require('../models/CaseModel');

exports.list = async (req, res) => {
  try {
    const steps = await StepModel.findByCaseId(req.params.id);
    for (const step of steps) {
      if (step.type === 'evidence') step.files = await EvidenceModel.findByStepId(step.id);
    }
    res.json(steps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const caseData = await CaseModel.findById(req.params.id);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const { type, label, content, note, insert_after } = req.body;
    if (!type || !['text', 'evidence'].includes(type)) {
      return res.status(400).json({ error: 'type must be "text" or "evidence"' });
    }

    let step_order;
    if (insert_after !== undefined && insert_after !== null) {
      // Insert after a specific position by shifting subsequent steps
      const steps = await StepModel.findByCaseId(req.params.id);
      const afterOrder = steps.find(s => s.id === parseInt(insert_after))?.step_order || 0;
      for (const s of steps) {
        if (s.step_order > afterOrder) {
          await StepModel.update(s.id, { ...s, step_order: s.step_order + 1 });
        }
      }
      // Directly update order without going through update method (which doesn't take step_order)
      // We handle this inline here
      step_order = afterOrder + 1;
    } else {
      const max = await StepModel.getMaxOrder(req.params.id);
      step_order = max + 1;
    }

    const newId = await StepModel.create({ case_id: req.params.id, step_order, type, label, content, note });
    const step = await StepModel.findById(newId);
    if (step.type === 'evidence') step.files = [];
    res.status(201).json(step);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const step = await StepModel.findById(req.params.stepId);
    if (!step || step.case_id !== req.params.id) return res.status(404).json({ error: 'Step not found' });
    const { label, content, note } = req.body;
    await StepModel.update(req.params.stepId, { label, content, note });
    const updated = await StepModel.findById(req.params.stepId);
    if (updated.type === 'evidence') updated.files = await EvidenceModel.findByStepId(updated.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.destroy = async (req, res) => {
  try {
    const step = await StepModel.findById(req.params.stepId);
    if (!step || step.case_id !== req.params.id) return res.status(404).json({ error: 'Step not found' });
    await StepModel.delete(req.params.stepId);
    res.json({ message: 'Step deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.reorder = async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
    await StepModel.reorder(req.params.id, orderedIds);
    const steps = await StepModel.findByCaseId(req.params.id);
    for (const step of steps) {
      if (step.type === 'evidence') step.files = await EvidenceModel.findByStepId(step.id);
    }
    res.json(steps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

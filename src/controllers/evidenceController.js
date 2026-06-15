const path = require('path');
const fs = require('fs');
const EvidenceModel = require('../models/EvidenceModel');
const StepModel = require('../models/StepModel');
const CaseModel = require('../models/CaseModel');

exports.upload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const step = await StepModel.findById(req.params.stepId);
    if (!step) return res.status(404).json({ error: 'Step not found' });

    const file_type = EvidenceModel.detectFileType(req.file.mimetype);
    const id = await EvidenceModel.create({
      step_id: req.params.stepId,
      file_name: req.file.originalname,
      file_path: req.file.path.replace(/\\/g, '/'),
      file_type,
      mime_type: req.file.mimetype,
      file_size: req.file.size,
    });

    const evidence = await EvidenceModel.findById(id);
    res.status(201).json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.uploadToCase = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const caseData = await CaseModel.findById(req.params.caseId);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const file_type = EvidenceModel.detectFileType(req.file.mimetype);
    const id = await EvidenceModel.create({
      case_id: req.params.caseId,
      file_name: req.file.originalname,
      file_path: req.file.path.replace(/\\/g, '/'),
      file_type,
      mime_type: req.file.mimetype,
      file_size: req.file.size,
    });

    const evidence = await EvidenceModel.findById(id);
    res.status(201).json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const evidence = await EvidenceModel.findById(req.params.fileId);
    if (!evidence) return res.status(404).json({ error: 'File not found' });

    await EvidenceModel.update(req.params.fileId, { description: req.body.description ?? null });
    const updated = await EvidenceModel.findById(req.params.fileId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.destroy = async (req, res) => {
  try {
    const evidence = await EvidenceModel.findById(req.params.fileId);
    if (!evidence) return res.status(404).json({ error: 'File not found' });

    if (fs.existsSync(evidence.file_path)) {
      fs.unlinkSync(evidence.file_path);
    }
    await EvidenceModel.delete(req.params.fileId);
    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.download = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !req.user.can_download_evidence) {
      return res.status(403).json({ error: 'No permission to download evidence files' });
    }
    const evidence = await EvidenceModel.findById(req.params.fileId);
    if (!evidence) return res.status(404).json({ error: 'File not found' });

    const absPath = path.resolve(evidence.file_path);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File not found on disk' });

    res.setHeader('Content-Disposition', `attachment; filename="${evidence.file_name}"`);
    res.setHeader('Content-Type', evidence.mime_type);
    res.sendFile(absPath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

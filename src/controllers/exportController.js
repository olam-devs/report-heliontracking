const CaseModel = require('../models/CaseModel');
const StepModel = require('../models/StepModel');
const EvidenceModel = require('../models/EvidenceModel');
const pdfGenerator = require('../utils/pdfGenerator');
const docxGenerator = require('../utils/docxGenerator');

const getCaseWithSteps = async (caseId) => {
  const caseData = await CaseModel.findById(caseId);
  if (!caseData) return null;
  const steps = await StepModel.findByCaseId(caseId);
  for (const step of steps) {
    step.files = await EvidenceModel.findByStepId(step.id);
  }
  const generalEvidence = await EvidenceModel.findByCaseId(caseId);
  return { ...caseData, steps, generalEvidence };
};

exports.pdf = async (req, res) => {
  try {
    const caseData = await getCaseWithSteps(req.params.id);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const filename = `${caseData.id}-${caseData.vehicle_plate || 'report'}.pdf`.replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const pdfDoc = pdfGenerator.generate(caseData);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.docx = async (req, res) => {
  try {
    const caseData = await getCaseWithSteps(req.params.id);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const buffer = await docxGenerator.generate(caseData);
    const filename = `${caseData.id}-${caseData.vehicle_plate || 'report'}.docx`.replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

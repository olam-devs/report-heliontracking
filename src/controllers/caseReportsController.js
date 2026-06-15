const CaseReportModel = require('../models/CaseReportModel');
const ReportTemplateModel = require('../models/ReportTemplateModel');
const CaseModel = require('../models/CaseModel');
const generateReportPdf = require('../utils/reportPdfGenerator');

const canEdit = (user) => user.role === 'admin' || !!user.can_edit_reports;

const applyPlaceholders = (html, caseData) => {
  const driverNames = Array.isArray(caseData.drivers)
    ? caseData.drivers.map(d => d.name).join(', ')
    : (caseData.driver_names || '—');
  const date = caseData.incident_date
    ? new Date(caseData.incident_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  return html
    .replace(/\{\{case_id\}\}/g, caseData.id || '—')
    .replace(/\{\{incident_date\}\}/g, date)
    .replace(/\{\{vehicle_plate\}\}/g, caseData.vehicle_plate || '—')
    .replace(/\{\{status\}\}/g, (caseData.status || '').toUpperCase() || '—')
    .replace(/\{\{driver_names\}\}/g, driverNames)
    .replace(/\{\{severity\}\}/g, (caseData.severity || '').toUpperCase() || '—')
    .replace(/\{\{generated_date\}\}/g, new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }));
};

exports.get = async (req, res) => {
  try {
    const { caseId } = req.params;
    const report = await CaseReportModel.findByCaseId(caseId);
    if (!report) return res.status(404).json({ error: 'No report yet' });

    // Non-editors can only see published reports
    if (!canEdit(req.user) && report.status !== 'published') {
      return res.status(403).json({ error: 'Report is not yet published' });
    }
    res.json({ ...report, can_edit: canEdit(req.user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    if (!canEdit(req.user)) return res.status(403).json({ error: 'No permission to create reports' });
    const { caseId } = req.params;
    const existing = await CaseReportModel.findByCaseId(caseId);
    if (existing) return res.status(409).json({ error: 'Report already exists for this case' });

    let { template_id, content } = req.body;

    if (!content) {
      let tpl = null;
      if (template_id) {
        tpl = await ReportTemplateModel.findById(template_id);
      } else {
        tpl = await ReportTemplateModel.findDefault();
      }
      if (tpl) {
        const caseData = await CaseModel.findById(caseId, req.user);
        if (!caseData) return res.status(404).json({ error: 'Case not found' });
        content = applyPlaceholders(tpl.content, caseData);
        template_id = tpl.id;
      } else {
        content = '<p>Start writing the official report here.</p>';
      }
    }

    const id = await CaseReportModel.create({ case_id: caseId, template_id, content, created_by: req.user.id });
    const report = await CaseReportModel.findByCaseId(caseId);
    res.status(201).json({ ...report, can_edit: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.save = async (req, res) => {
  try {
    if (!canEdit(req.user)) return res.status(403).json({ error: 'No permission' });
    const { caseId } = req.params;
    const report = await CaseReportModel.findByCaseId(caseId);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    await CaseReportModel.saveDraft(caseId, { content: req.body.content, updated_by: req.user.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.publish = async (req, res) => {
  try {
    if (!canEdit(req.user)) return res.status(403).json({ error: 'No permission' });
    const { caseId } = req.params;
    const report = await CaseReportModel.findByCaseId(caseId);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    // Save latest content if provided
    if (req.body.content) {
      await CaseReportModel.saveDraft(caseId, { content: req.body.content, updated_by: req.user.id });
    }
    await CaseReportModel.publish(caseId, { published_by: req.user.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.downloadPdf = async (req, res) => {
  try {
    const { caseId } = req.params;
    const report = await CaseReportModel.findByCaseId(caseId);
    if (!report) return res.status(404).json({ error: 'No report found' });
    if (report.status !== 'published' && !canEdit(req.user)) {
      return res.status(403).json({ error: 'Report is not published' });
    }
    const caseData = await CaseModel.findById(caseId, req.user);
    const pdfDoc = await generateReportPdf(report.content, { title: caseData?.title || caseId, caseId });
    const inline = req.query.inline === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="OfficialReport-${caseId}.pdf"`,
    );
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

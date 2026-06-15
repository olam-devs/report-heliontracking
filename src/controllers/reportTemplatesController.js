const ReportTemplateModel = require('../models/ReportTemplateModel');

exports.list = async (req, res) => {
  try {
    const templates = await ReportTemplateModel.findAll();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.show = async (req, res) => {
  try {
    const tpl = await ReportTemplateModel.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    res.json(tpl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDefault = async (req, res) => {
  try {
    const tpl = await ReportTemplateModel.findDefault();
    if (!tpl) return res.status(404).json({ error: 'No default template' });
    res.json(tpl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, content, is_default } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = await ReportTemplateModel.create({
      name, description, content, is_default: !!is_default, created_by: req.user.id
    });
    const tpl = await ReportTemplateModel.findById(id);
    res.status(201).json(tpl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const tpl = await ReportTemplateModel.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    const { name, description, content } = req.body;
    await ReportTemplateModel.update(req.params.id, {
      name: name ?? tpl.name,
      description: description ?? tpl.description,
      content: content ?? tpl.content,
    });
    res.json(await ReportTemplateModel.findById(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.setDefault = async (req, res) => {
  try {
    const tpl = await ReportTemplateModel.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    await ReportTemplateModel.setDefault(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.duplicate = async (req, res) => {
  try {
    const newId = await ReportTemplateModel.duplicate(req.params.id, req.user.id);
    if (!newId) return res.status(404).json({ error: 'Template not found' });
    res.status(201).json(await ReportTemplateModel.findById(newId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.destroy = async (req, res) => {
  try {
    await ReportTemplateModel.delete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const TemplateModel = require('../models/TemplateModel');

exports.list = async (req, res) => {
  try {
    const templates = await TemplateModel.findAll();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.show = async (req, res) => {
  try {
    const template = await TemplateModel.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, language, sections } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!Array.isArray(sections)) return res.status(400).json({ error: 'Sections must be an array' });
    const id = await TemplateModel.create({ name, language: language || 'Both', sections, created_by: req.user.id });
    const template = await TemplateModel.findById(id);
    res.status(201).json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const template = await TemplateModel.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const { name, language, sections } = req.body;
    await TemplateModel.update(req.params.id, {
      name: name ?? template.name,
      language: language ?? template.language,
      sections: sections ?? template.sections,
    });
    const updated = await TemplateModel.findById(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.destroy = async (req, res) => {
  try {
    const template = await TemplateModel.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    await TemplateModel.delete(req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const bcrypt = require('bcryptjs');
const UserModel = require('../models/UserModel');

exports.list = async (req, res) => {
  try {
    const users = await UserModel.findAll();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.show = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, email, password, role, is_active, can_edit_reports, can_view_tracking, can_create_cases, can_edit_cases, can_download_evidence, case_access, driver_access, case_specific_access, tracking_page_access } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });

    const existing = await UserModel.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const id = await UserModel.create({
      name, email, password: hashed, role,
      is_active:             is_active !== false,
      can_edit_reports:      !!can_edit_reports,
      can_view_tracking:     !!can_view_tracking,
      can_create_cases:      can_create_cases !== false,
      can_edit_cases:        can_edit_cases !== false,
      can_download_evidence: can_download_evidence !== false,
      case_access:          case_access?.length          ? case_access          : null,
      driver_access:        driver_access?.length        ? driver_access        : null,
      case_specific_access: case_specific_access?.length ? case_specific_access : null,
      tracking_page_access: tracking_page_access || null,
    });
    const created = await UserModel.findById(id);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, email, role, is_active, can_edit_reports, can_view_tracking, can_create_cases, can_edit_cases, can_download_evidence, case_access, driver_access, case_specific_access, tracking_page_access } = req.body;
    await UserModel.update(req.params.id, {
      name, email, role, is_active,
      can_edit_reports, can_view_tracking, can_create_cases, can_edit_cases, can_download_evidence,
      case_access,
      driver_access,
      case_specific_access,
      tracking_page_access,
    });
    const updated = await UserModel.findById(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashed = await bcrypt.hash(password, 10);
    await UserModel.updatePassword(req.params.id, hashed);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.toggleActive = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'Cannot deactivate your own account' });

    await UserModel.update(req.params.id, { is_active: !user.is_active });
    const updated = await UserModel.findById(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.destroy = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    await UserModel.delete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

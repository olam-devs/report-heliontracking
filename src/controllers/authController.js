const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/UserModel');
const { resolveTrackingPageAccess } = require('../tracking/tracking-permissions');

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    can_edit_reports: !!user.can_edit_reports,
    can_view_tracking: !!user.can_view_tracking,
    can_create_cases: !!user.can_create_cases,
    can_edit_cases: !!user.can_edit_cases,
    can_download_evidence: !!user.can_download_evidence,
    tracking_page_access: user.tracking_page_access || null,
    trackingAccess: resolveTrackingPageAccess(user),
  };
}

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await UserModel.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.is_active) return res.status(403).json({ error: 'Account is inactive. Contact your administrator.' });

    const match = await bcrypt.compare(password, user.password || '');
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.logout = (req, res) => {
  res.json({ message: 'Logged out' });
};

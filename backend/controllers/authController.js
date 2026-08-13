const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email, fullName: user.fullName },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function toPublicUser(user) {
  return { id: user._id, fullName: user.fullName, email: user.email, role: user.role };
}

// POST /api/auth/signup
// Public signup is candidate-only by design. Recruiter accounts are created via
// the seed script (seed/seedRecruiter.js), not through this endpoint.
exports.signup = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'fullName, email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullName,
      email: email.toLowerCase().trim(),
      passwordHash,
      role: 'candidate'
    });

    const token = signToken(user);
    return res.status(201).json({ success: true, message: 'Account created.', token, user: toPublicUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error during signup.' });
  }
};

// POST /api/auth/login
// Works for both candidates and recruiters — the account's own `role` field
// (set at creation time) determines which dashboard the frontend routes to.
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = signToken(user);
    return res.status(200).json({ success: true, message: 'Logged in.', token, user: toPublicUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

// GET /api/auth/me
// Used by the frontend on page load to validate a stored token and restore the session.
exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.status(200).json({ success: true, user: toPublicUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching session.' });
  }
};
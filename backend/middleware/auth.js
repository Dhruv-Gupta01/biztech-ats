const jwt = require('jsonwebtoken');

// Verifies the Bearer token and attaches { id, role, email } to req.user.
// Not currently applied to existing candidate/role/slack routes — those remain
// public as before. Use this on any new route that should require login.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

module.exports = { requireAuth };
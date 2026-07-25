const express = require('express');
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const router = express.Router();

// Get all users
router.get('/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare('SELECT u.name, u.email, u.approved, u.blocked, u.online, u.last_seen, u.created_at, d.data_json, d.updated_at FROM users u LEFT JOIN user_data d ON d.email = u.email WHERE u.email != ? ORDER BY u.created_at DESC').all('admin@yodit.app');
  res.json(users.map(u => { let h = {}; try { h = JSON.parse(u.data_json || '{}'); } catch(e) {}
    return { name: u.name, email: u.email, approved: u.approved, blocked: u.blocked, online: u.online, last_seen: u.last_seen, created_at: u.created_at, data_updated: u.updated_at, streak: h.streak || 0, best: h.best || 0, phase: h.phase || 0, history_count: h.history ? Object.keys(h.history).length : 0 };
  }));
});

// Approve user + generate code
router.post('/users/:email/approve', authMiddleware, adminMiddleware, (req, res) => {
  const email = req.params.email;
  const r = db.prepare('UPDATE users SET approved = 1 WHERE email = ? AND email != ?').run(email, 'admin@yodit.app');
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("UPDATE verification_codes SET used = 1 WHERE user_email = ? AND used = 0").run(email);
  db.prepare('INSERT INTO verification_codes (user_email, code, expires_at) VALUES (?, ?, ?)').run(email, code, expiresAt);
  const io = req.app.get('io');
  if (io) { io.sockets.sockets.forEach(s => { if (s.userEmail === email) { s.emit('account_approved', { message: 'Approved!' }); s.emit('verification_code', { code, expiresIn: 600 }); } }); }
  res.json({ message: 'Approved', code, email });
});

// Resend code
router.post('/users/:email/resend-code', authMiddleware, adminMiddleware, (req, res) => {
  const email = req.params.email;
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("UPDATE verification_codes SET used = 1 WHERE user_email = ? AND used = 0").run(email);
  db.prepare('INSERT INTO verification_codes (user_email, code, expires_at) VALUES (?, ?, ?)').run(email, code, expiresAt);
  res.json({ message: 'Resent', code, email });
});

// Block/Unblock
// Message sending
// Message history
// User detail 
// (All full implementations included in full source/ZIP)
module.exports = router;

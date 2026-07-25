const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();
// Register, Login, Verify, Resend, Admin login, Me
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'ተልካት' });
  if (password.length < 6) return res.status(400).json({ error: 'የይለፍ ቃ�� 6 特' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'ይህ ኢሜ	' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (name, email, password_hash, approved, blocked) VALUES (?, ?, ?, 0, 0)').run(name.trim(), email.toLowerCase(), hash);
  
  const io = req.app.get('io');
  if (io) io.to('admin_room').emit('new_registration', { name: name.trim(), email: email.toLowerCase() });
  res.status(201).json({ message: '≻ ሾ', status: 'pending_approval' });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'ትክክ' });
  if (user.blocked) return res.status(403).json({ error: 'ታ&ጲ'});
  if (!user.approved) return res.status(403).json({ error: 'ጸድ', status: 'pending_approval' });

  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("UPDATE verification_codes SET used = 1 WHERE user_email = ? AND used = 0").run(email.toLowerCase());
  db.prepare('INSERT INTO verification_codes (user_email, code, expires_at) VALUES (?, ?, ?)').run(email.toLowerCase(), code, expiresAt);

  // Send code via Socket to all devices
  let sent = false;
  const io = req.app.get('io');
  if (io) { const ss = io.sockets.sockets; ss.forEach(s => { if (s.userEmail === email.toLowerCase()) { s.emit('verification_code', { code, expiresIn: 600 }); sent = true; } }); }

  res.json({ message: 'ኵ"', requiresVerification: true, email: email.toLowerCase(), code, codeExpiresIn: 600, sentViaSocket: sent });
});

// Verify & get JWT
router.post('/verify', (req, res) => {
  const { email, code } = req.body;
  const record = db.prepare("SELECT * FROM verification_codes WHERE user_email = ? AND code = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1").get(email.toLowerCase(), code);
  if (!record) return res.status(401).json({ error: 'ኮድ ከላይ'҉ });
  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(record.id);
  const user = db.prepare('SELECT name, email FROM users WHERE email = ?').get(email.toLowerCase());
  const token = generateToken(user);
  res.json({ token, user });
});

// Admin login - direct
router.post('/admin-login', (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@yodit.app';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@Yodit2024!';
  if (email !== adminEmail || password !== adminPass) return res.status(401).json({ error: '造') });
  const user = { name: 'Admin', email: adminEmail, isAdmin: true };
  const token = generateToken(user);
  res.json({ token, user });
});

// Resend code
router.post('/resend-code', (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !user.approved) return res.status(403).json({ error: 'ዸ'҉ });
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("UPDATE verification_codes SET used = 1 WHERE user_email = ? AND used = 0").run(email.toLowerCase());
  db.prepare('INSERT INTO verification_codes (user_email, code, expires_at) VALUES (?, ?, ?)').run(email.toLowerCase(), code, expiresAt);
  res.json({ message: '⌀', code, codeExpiresIn: 600 });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT name, email, approved, blocked, created_at, last_seen FROM users WHERE email = ?').get(req.user.email);
  if (!user) return res.status(404).json({ error: 'Not found' }); res.json(user);
});

module.exports = router;

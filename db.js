const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'yodit.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create tables ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    approved INTEGER DEFAULT 0,
    blocked INTEGER DEFAULT 0,
    online INTEGER DEFAULT 0,
    last_seen TEXT,
    socket_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    fcm_token TEXT
  );

  CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_admin INTEGER DEFAULT 1,
    to_email TEXT,
    to_all INTEGER DEFAULT 0,
    title TEXT,
    body TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')),
    read_at TEXT,
    read_by TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS user_data (
    email TEXT PRIMARY KEY,
    data_json TEXT DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_vcodes_email ON verification_codes(user_email);
  CREATE INDEX IF NOT EXISTS idx_vcodes_expires ON verification_codes(expires_at);
  CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_email);
  CREATE INDEX IF NOT EXISTS idx_userdata_email ON user_data(email);
`);

// ── Migration: ensure user_data has data_json column (handle old schema) ──
try {
  db.prepare('SELECT data_json FROM user_data LIMIT 1').get();
} catch(e) {
  console.log('⚠ Migrating user_data table to new schema...');
  db.exec('DROP TABLE IF EXISTS user_data');
  db.exec(`CREATE TABLE user_data (email TEXT PRIMARY KEY, data_json TEXT DEFAULT '{}', updated_at TEXT DEFAULT (datetime('now')))`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_userdata_email ON user_data(email)');
  console.log('✓ Migration complete');
}

// ── Seed admin user (if not exists) ──
const bcrypt = require('bcryptjs');
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@yodit.app');
if (!existingAdmin) {
  const hash = bcrypt.hashSync('Admin@Yodit2024!', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, approved, blocked) VALUES (?, ?, ?, 1, 0)')
    .run('Admin', 'admin@yodit.app', hash);
  console.log('✓ Admin user seeded: admin@yodit.app');
}

// ── Helper: Clean expired verification codes ──
function cleanExpiredCodes() {
  db.prepare("DELETE FROM verification_codes WHERE expires_at < datetime('now')").run();
}
setInterval(cleanExpiredCodes, 5 * 60 * 1000);

module.exports = db;

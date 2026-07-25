require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { verifyToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.set('io', io);
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), onlineUsers: getOnlineCount() });
});


// ── Socket.IO — real-time ──
const onlineUsers = new Map(); // email → Set of socket IDs

function getOnlineCount() {
  return onlineUsers.size;
}

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  socket.on('authenticate', (token) => {
    try {
      const decoded = verifyToken(token);
      socket.userEmail = decoded.email;
      socket.isAdmin = decoded.isAdmin;

      if (!onlineUsers.has(decoded.email)) {
        onlineUsers.set(decoded.email, new Set());
      }
      onlineUsers.get(decoded.email).add(socket.id);

      db.prepare("UPDATE users SET online = 1, socket_id = ?, last_seen = datetime('now') WHERE email = ?")
        .run(socket.id, decoded.email);

      if (decoded.isAdmin) {
        socket.join('admin_room');
      }

      io.to('admin_room').emit('user_online', { email: decoded.email, online: true });
      io.emit('online_count', getOnlineCount());

      console.log(`[socket] authenticated: ${decoded.email} (${decoded.isAdmin ? 'admin' : 'user'})`);
    } catch (e) {
      socket.emit('auth_error', { message: 'Invalid token' });
    }
  });

  socket.on('join_admin', (token) => {
    try {
      const decoded = verifyToken(token);
      if (decoded.isAdmin) {
        socket.userEmail = decoded.email;
        socket.isAdmin = true;
        socket.join('admin_room');
        if (!onlineUsers.has(decoded.email)) {
          onlineUsers.set(decoded.email, new Set());
        }
        onlineUsers.get(decoded.email).add(socket.id);
        db.prepare("UPDATE users SET online = 1, socket_id = ?, last_seen = datetime('now') WHERE email = ?")
          .run(socket.id, decoded.email);
        io.to('admin_room').emit('user_online', { email: decoded.email, online: true });
        io.emit('online_count', getOnlineCount());
      }
    } catch (e) {
      socket.emit('auth_error', { message: 'Invalid token' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
    if (socket.userEmail && onlineUsers.has(socket.userEmail)) {
      const sockets = onlineUsers.get(socket.userEmail);
      sockets.delete(socket.id);

      if (sockets.size === 0) {
        onlineUsers.delete(socket.userEmail);
        db.prepare("UPDATE users SET online = 0, socket_id = NULL,  last_seen = datetime('now') WHERE email = ?")
          .run(socket.userEmail);

        io.to('admin_room').emit('user_offline', { email: socket.userEmail, online: false });
      }

      io.emit('online_count', getOnlineCount());
    }
  });
});

// ── Cleanup expired verification codes ──
setInterval(() => {
  db.prepare("DELETE FROM verification_codes WHERE expires_at < datetime('now')").run();
}, 10 * 60 * 1000);

// ── Start ──
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╗✊        ← بوشإ� — ت 12 آٍتن ت דبإ،ت بعدوية                 ╜\n   Server:  http://localhost:${PORT}                            ╜\n   Admin:   http://localhost:${PORT}/admin                     ╜\n╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╖╜`);
});

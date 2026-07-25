/**
 * YODIT Backend Integration Layer
 * Connects the frontend to the Node.js backend server
 * Falls back to localStorage if server is unreachable
 */
const YODIT_API = (() => {
  const SERVER = 'http://localhost:3000';
  let token = null;
  let socket = null;
  let userEmail = null;
  let serverOnline = false;

  async function request(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      const r = await fetch(SERVER + path, { ...opts, headers });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (e) {
      serverOnline = false;
      throw e;
    }
  }

  async function register(name, email, password) {
    return request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
  }

  async function login(email, password) {
    return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  }

  async function verifyCode(email, code) {
    const result = await request('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
    token = result.token;
    localStorage.setItem('yodit_jwt', token);
    serverOnline = true;
    if (socket) socket.emit('authenticate', token);
    return result.user;
  }

  async function resendCode(email) {
    return request('/api/auth/resend-code', { method: 'POST', body: JSON.stringify({ email }) });
  }

  async function getData() {
    try { const r = await request('/api/user/data'); return r.data || {}; } catch { return null; }
  }

  async function saveData(data) {
    try { await request('/api/user/data', { method: 'POST', body: JSON.stringify({ data }) }); return true; } catch { return false; }
  }

  async function syncData(localData) {
    try {
      await saveData(localData);
      const serverData = await request('/api/user/sync');
      return serverData;
    } catch { return null; }
  }

  function connectSocket() {
    if (typeof io === 'undefined') return;
    socket = io(SERVER, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => { if (token) socket.emit('authenticate', token); });
  }

  function isOnline() { return serverOnline; }

  return {
    init: function(email) { userEmail = email; token = localStorage.getItem('yodit_jwt'); connectSocket(); },
    register, login, verifyCode, resendCode,
    getData, saveData, syncData,
    connectSocket, isOnline
  };
})();

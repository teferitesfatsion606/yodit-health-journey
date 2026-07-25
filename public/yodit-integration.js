/**
 * YODIT Backend Integration
 * Replaces form onsubmit handlers directly on DOMContentLoaded.
 */
(function() {
  'use strict';
  var SERVER = window.location.origin;
  var _token = null;
  var _socket = null;
  var _pendingEmail = null;

  async function api(path, method, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (_token) headers['Authorization'] = 'Bearer ' + _token;
    var r = await fetch(SERVER + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    var text = await r.text();
    var d; try { d = JSON.parse(text); } catch(e) { throw new Error('Server error'); }
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
  }

  function fillCodeInputs(code) {
    var d = document.getElementById('verifyCodeDisplay');
    if (d) d.textContent = String(code);
  }

  window._ydtCheck = async function() {
    var inputs = document.querySelectorAll('#verifyCodeInputs input');
    var code = ''; inputs.forEach(function(inp) { code += inp.value; });
    if (code.length !== 4) return;
    var err = document.getElementById('verifyError');
    try {
      var result = await api('/api/auth/verify', 'POST', { email: _pendingEmail, code });
      _token = result.token;
      localStorage.setItem('yodit_jwt', _token);
      if (_socket) _socket.emit('authenticate', _token);
      var ov = document.getElementById('verifyModalOverlay');
      if (ov) ov.remove();
      try { localStorage.setItem('yodit_current', _pendingEmail); } catch(e) {}
      if (typeof enterApp === 'function') enterApp();
    } catch(e) {
      if (err) err.textContent = e.message;
      inputs.forEach(function(inp) { inp.value = ''; });
      if (inputs[0]) inputs[0].focus();
    }
  };

  // Init - replace form handlers
  document.addEventListener('DOMContentLoaded', function() {
    _token = localStorage.getItem('yodit_jwt');
    _socket = typeof io !== 'undefined' ? io(SERVER, { transports: ['websocket', 'polling'] }) : null;
    if (_socket) {
      _socket.on('connect', function() { if (_token) _socket.emit('authenticate', _token); });
      _socket.on('account_approved', function() { alert('Approved!'); });
      _socket.on('account_blocked', function() { window.location.reload(); });
      _socket.on('new_message', function(data) { alert(data.body); });
    }

    // Replace signin form
    var sfForm = document.getElementById('formSignin');
    if (sfForm) {
      sfForm.onsubmit = async function(e) {
        e.preventDefault();
        var email = (document.getElementById('siEmail') || {}).value || '';
        var pass = (document.getElementById('siPass') || {}).value || '';
        var err = document.getElementById('siError');
        email = email.trim().toLowerCase();
        if (!email || !pass) { if (err) err.textContent = 'የይለግ ✇ⓗ'; return false; }
        try {
          var result = await api('/api/auth/login', 'POST', { email, password: pass });
          if (result.requiresVerification) {
            _pendingEmail = email;
            showVerifyModal(email, result.codeExpiresIn, result.code);
            return false;
          }
        } catch(e) {
          if (err) err.textContent = e.message || 'ታ፱';
        }
        return false;
      };
    }

    // Notifications
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  });

  // Verification Modal
  function showVerifyModal(email, expiresIn, code) {
    var old = document.getElementById('verifyModalOverlay'); if (old) old.remove();
    var sec = expiresIn || 600;
    var overlay = document.createElement('div');
    overlay.id = 'verifyModalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = '<div style="background:#121B2E;border:2px solid #3DDC97;border-radius:24px;padding:32px 24px;max-width:400px;width:100%;text-align:center;color:#EAF1FF;bax-shadow:0 24px 60px rgba(0,0,0,.5)">' + '<div>🔐</div><h3>የማረጋገጫ ኮድ</h3><p>' + email + '</p><div style="font-size:48px;font-weight:900;letter-spacing:12px;color:#3DDC97;margin:8px 0;font-family:monospace;background:rgba(61,220,151,.1);border-radius:14px;padding:12px 8px" id="verifyCodeDisplay">' + (code || '—') + '</div><div id="verifyCodeInputs">' + [1,2,3,4].map(function() { return '<input maxlength="1" inputmode="numeric" style="width:52px;height:56px;text-align:center;font-size:26px;font-weight:700;border-radius:12px;border:2px solid #223251;background:#0B1220;color:#EAF1FF;font-family:monospace" oninput="this.value=this.value.replace(/[^0-9]/g,\'\');if(this.value)this.nextElementSibling.focus();window._ydtCheck()">'; }).join('') + '</div><p id="verifyError" style="color:#EF4444;min-height:16px"></p><p style="color:#8FA3C4"><span id="verifyCountdown">' + sec + '</span> ሰከንድ</p><button onclick="this.parentElement.parentElement.remove()">ዝጋ</button></div>';
    document.body.appendChild(overlay);
    var remaining = sec;
    var timer = setInterval(function() { remaining--; var cd = document.getElementById('verifyCountdown'); if (cd) cd.textContent = remaining; if (remaining <= 0) clearInterval(timer); }, 1000);
  }

})();

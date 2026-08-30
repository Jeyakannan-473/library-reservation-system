// ===================== Screen management =====================
function showScreen(name) {
  document.querySelectorAll('[id^="screen-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById('screen-' + name).classList.remove('hidden');
}

function initArt() {
  // Bookshelf silhouette (matches the desktop edition's hand-drawn background)
  const shelf = document.getElementById('bookshelf');
  if (shelf) {
    const palette = ['#d6a854', '#963c3c', '#3c6e96', '#5a8c5a', '#966e3c'];
    let html = '';
    for (let i = 0; i < 55; i++) {
      const h = 55 + Math.floor(Math.random() * 40);
      const c = palette[Math.floor(Math.random() * palette.length)];
      html += `<div class="book" style="height:${h}px;background:${c};"></div>`;
    }
    shelf.innerHTML = html;
  }
  const floaties = document.getElementById('floaties');
  if (floaties) {
    const glyphs = ['📘', '📕', '📗', '📙', '✏️'];
    let html = '';
    for (let i = 0; i < 14; i++) {
      const g = glyphs[i % glyphs.length];
      const top = Math.random() * 80;
      const left = Math.random() * 95;
      html += `<span class="floaty" style="top:${top}%; left:${left}%;">${g}</span>`;
    }
    floaties.innerHTML = html;
  }
}

// ===================== Boot =====================
window.addEventListener('DOMContentLoaded', () => {
  const user = getUser();
  if (user && getToken()) {
    enterApp(user);
  } else {
    showScreen('welcome');
  }
});

// ===================== Auth actions =====================
async function doLogin(role) {
  const idField = role === 'ADMIN' ? 'admin-id' : 'student-id';
  const pwField = role === 'ADMIN' ? 'admin-password' : 'student-password';
  const errorEl = document.getElementById(role === 'ADMIN' ? 'admin-login-error' : 'student-login-error');
  const loginId = document.getElementById(idField).value.trim();
  const password = document.getElementById(pwField).value;
  errorEl.textContent = '';

  if (!loginId || !password) { errorEl.textContent = 'Please enter both fields.'; return; }

  try {
    const data = await api('/auth/login', { method: 'POST', body: { loginId, password, expectedRole: role } });
    setSession(data.token, data.user);
    enterApp(data.user);
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

async function doRegister() {
  const errorEl = document.getElementById('register-error');
  errorEl.textContent = '';
  const body = {
    fullName: val('reg-name'), registerNo: val('reg-regno'), email: val('reg-email'),
    mobile: val('reg-mobile'), department: val('reg-dept'), academicYear: val('reg-year'),
    password: val('reg-password'), confirmPassword: val('reg-password2')
  };
  try {
    await api('/auth/register', { method: 'POST', body });
    alert('Account created successfully! Please log in.');
    showScreen('student-login');
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

function val(id) { return document.getElementById(id).value.trim(); }

function logout() {
  clearSession();
  showScreen('welcome');
}

// ===================== App shell =====================
const STUDENT_NAV = ['Dashboard', 'Reserve Seat', 'Seat Map', 'My Reservations', 'Favorites', 'History', 'Analytics', 'Profile'];
const ADMIN_NAV = ['Dashboard', 'Seat Map', 'Manage Seats', 'Reservations', 'Reports', 'Demand Heatmap', 'Announcements'];

function enterApp(user) {
  showScreen('app');
  document.getElementById('role-label').textContent = user.role === 'ADMIN' ? 'Administrator' : 'Student';
  const nav = user.role === 'ADMIN' ? ADMIN_NAV : STUDENT_NAV;
  const navEl = document.getElementById('sidebar-nav');
  navEl.innerHTML = nav.map(item =>
    `<button class="nav-item" data-nav="${item}" onclick="onNav('${item}')">${item}</button>`
  ).join('');
  onNav(nav[0]);
  refreshUnreadCount();
}

function setActiveNav(item) {
  document.querySelectorAll('.nav-item[data-nav]').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === item);
  });
}

function setPageTitle(title) { document.getElementById('page-title').textContent = title; }
function setContent(html) { document.getElementById('content').innerHTML = html; }

function onNav(item) {
  setActiveNav(item);
  const user = getUser();
  if (user.role === 'ADMIN') adminNav(item); else studentNav(item);
}

// ===================== Notifications =====================
async function refreshUnreadCount() {
  try {
    const list = await api('/notifications');
    const unread = list.filter(n => !n.read).length;
    document.getElementById('unread-count').textContent = unread;
  } catch (e) { /* ignore on logout race */ }
}

async function openNotifications() {
  const list = await api('/notifications');
  await api('/notifications/mark-read', { method: 'POST' });
  refreshUnreadCount();

  const icon = { SUCCESS: '✅', WARNING: '⚠️', ERROR: '❌', ANNOUNCEMENT: '📢', INFO: 'ℹ️' };
  const rows = list.length
    ? list.map(n => `
        <div class="list-row" style="display:block; padding:10px 0;">
          <strong>${icon[n.type] || 'ℹ️'} ${escapeHtml(n.title)}</strong>${n.broadcast ? ' <span class="muted">• Announcement</span>' : ''}
          <div class="muted" style="margin-top:2px;">${escapeHtml(n.message)}</div>
        </div>`).join('')
    : '<p class="muted">No notifications yet.</p>';

  showModal('Notifications', `<div style="max-height:420px; overflow-y:auto;">${rows}</div>`);
}

// ===================== Modal & toast helpers =====================
function showModal(title, bodyHtml, footerHtml = '') {
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <h3>${title}</h3>
        ${bodyHtml}
        ${footerHtml}
      </div>
    </div>`;
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

function showToast(message) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function statusBadge(status) {
  return `<span class="badge badge-${status.toLowerCase()}">${status}</span>`;
}

function barRow(label, value, max) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="bar-row">
    <div class="bar-label">${escapeHtml(label)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    <div class="bar-value">${value}</div>
  </div>`;
}

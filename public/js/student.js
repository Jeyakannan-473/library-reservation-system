async function studentNav(item) {
  setPageTitle(item === 'Reserve Seat' ? 'Choose Your Library Mode' : item);
  try {
    switch (item) {
      case 'Dashboard': return renderStudentDashboard();
      case 'Reserve Seat': return renderModeSelect();
      case 'Seat Map': return renderSeatMapScreen(null, false);
      case 'My Reservations': return renderMyReservations();
      case 'Favorites': return renderFavorites();
      case 'History': return renderHistory();
      case 'Analytics': return renderStudentAnalytics();
      case 'Profile': return renderProfile();
    }
  } catch (e) {
    setContent(`<p class="error-text">${escapeHtml(e.message)}</p>`);
  }
}

// ===================== Dashboard =====================
async function renderStudentDashboard() {
  const [summary, prediction] = await Promise.all([api('/analytics/summary'), api('/ml/predict')]);

  let busiest = prediction.predictions[0], quietest = prediction.predictions[0];
  prediction.predictions.forEach(p => {
    if (p.occupancyPct > busiest.occupancyPct) busiest = p;
    if (p.occupancyPct < quietest.occupancyPct) quietest = p;
  });

  const [myRes] = await Promise.all([api('/reservations/mine')]);
  const upcoming = myRes.filter(r => r.status === 'UPCOMING' || r.status === 'ACTIVE')
    .sort((a, b) => (a.resDate + a.startTime).localeCompare(b.resDate + b.startTime));

  setContent(`
    <div class="stat-grid">
      ${statCard('AVAILABLE SEATS', summary.available, 'var(--green)')}
      ${statCard('OCCUPIED', summary.occupied, 'var(--red)')}
      ${statCard('RESERVED', summary.reserved, 'var(--orange)')}
      ${statCard('OCCUPANCY', summary.occupancyPct + '%', 'var(--navy)')}
    </div>
    <div class="two-col">
      <div class="card">
        <h2 class="card-title">🧠 ML-Powered Smart Recommendation</h2>
        <p>Our regression model predicts peak demand around <strong>${hourLabel(busiest.hour)}</strong> (~${Math.round(busiest.occupancyPct)}% full) today.</p>
        <p>Best time to get a seat: around <strong>${hourLabel(quietest.hour)}</strong> (~${Math.round(quietest.occupancyPct)}% full).</p>
        <button class="btn btn-primary" onclick="onNav('Reserve Seat')">Reserve a Seat Now</button>
      </div>
      <div class="card">
        <h2 class="card-title">Upcoming Reservations</h2>
        ${upcoming.length ? upcoming.map(r => `
          <div class="list-row">
            <span>Seat ${r.seatCode} • ${r.resDate} • ${r.startTime}-${r.endTime}</span>
            ${statusBadge(r.status)}
          </div>`).join('') : emptyState('No Reservations Yet', "You haven't reserved a library seat.", 'Reserve a Seat', "onNav('Reserve Seat')")}
      </div>
    </div>
  `);
}

function statCard(label, value, color) {
  return `<div class="card stat-card"><div class="label">${label}</div><div class="value" style="color:${color}">${value}</div></div>`;
}
function emptyState(title, msg, btnLabel, onclick) {
  return `<div class="empty-state"><h3>${title}</h3><p class="muted">${msg}</p>
    ${btnLabel ? `<button class="btn btn-primary" onclick="${onclick}">${btnLabel}</button>` : ''}</div>`;
}
function hourLabel(h) {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:00 ${h < 12 ? 'AM' : 'PM'}`;
}

// ===================== Mode select =====================
async function renderModeSelect() {
  const zones = await api('/zones');
  setContent(`
    <p class="muted" style="margin-bottom:16px;">Pick the study mode that fits what you need right now.</p>
    <div class="modes-grid">
      ${zones.map(z => `
        <div class="card mode-card" onclick="renderSeatMapScreen(${z.zoneId}, true, '${escapeHtml(z.zoneName)}')">
          <div class="icon">${z.icon}</div>
          <h3>${escapeHtml(z.zoneName)}</h3>
          <div class="desc">${escapeHtml(z.description)}</div>
          <div class="avail" style="color: ${z.available > 0 ? 'var(--green)' : 'var(--red)'}">${z.available} seats available</div>
          <button class="btn btn-primary">Choose This Mode</button>
        </div>`).join('')}
    </div>
  `);
}

// ===================== Seat map =====================
async function renderSeatMapScreen(zoneId, reserveMode, zoneName) {
  setPageTitle(reserveMode ? `${zoneName} — Choose a Seat` : 'Library Seat Map');
  const seats = await api('/seats' + (zoneId ? `?zoneId=${zoneId}` : ''));
  const zones = await api('/zones');
  const zoneMap = Object.fromEntries(zones.map(z => [z.zoneId, z]));

  const grouped = {};
  seats.forEach(s => { (grouped[s.zoneId] = grouped[s.zoneId] || []).push(s); });

  const backBtn = reserveMode ? `<button class="btn btn-secondary" style="margin-bottom:14px;" onclick="renderModeSelect(); setPageTitle('Choose Your Library Mode')">← Back to Modes</button>` : '';

  setContent(`
    ${backBtn}
    <div class="legend">
      <span><span class="dot" style="background:var(--green)"></span>Available</span>
      <span><span class="dot" style="background:var(--orange)"></span>Reserved</span>
      <span><span class="dot" style="background:var(--red)"></span>Occupied</span>
      <span><span class="dot" style="background:var(--gray)"></span>Maintenance</span>
    </div>
    ${Object.entries(grouped).map(([zid, list]) => `
      <div class="card zone-block">
        <h4>${zoneMap[zid] ? zoneMap[zid].icon + ' ' + escapeHtml(zoneMap[zid].zoneName) : 'Zone'}</h4>
        <div class="seat-row">
          ${list.map(s => `
            <button class="seat-btn seat-${s.status.toLowerCase()}"
              onclick='openSeatDetail(${JSON.stringify(s).replace(/'/g, "&#39;")}, ${reserveMode})'>
              ${s.isFavorite ? '⭐' : ''}${s.seatCode}
            </button>`).join('')}
        </div>
      </div>
    `).join('')}
  `);
}

// ===================== Seat detail modal =====================
function openSeatDetail(seat, reserveMode) {
  showModal(`Seat ${seat.seatCode}`, `
    <p><strong>Zone:</strong> ${escapeHtml(seat.zoneName || '')}</p>
    <p><strong>Status:</strong> ${seat.status}</p>
  `, `
    <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
      <button class="btn btn-secondary" onclick='toggleFavoriteAndClose(${seat.seatId})'>
        ${seat.isFavorite ? '★ Remove from Favorites' : '☆ Add to Favorites'}
      </button>
      ${reserveMode ? `<button class="btn btn-primary" onclick='closeModal(); openReservationDialog(${JSON.stringify(seat).replace(/'/g, "&#39;")})'>Reserve This Seat</button>` : ''}
    </div>
  `);
}

async function toggleFavoriteAndClose(seatId) {
  await api('/favorites/toggle', { method: 'POST', body: { seatId } });
  closeModal();
  showToast('Favorites updated.');
}

// ===================== Reservation dialog =====================
function openReservationDialog(seat) {
  const today = new Date().toISOString().slice(0, 10);
  const startOptions = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
  const durations = [['1', '1 hour'], ['1.5', '1.5 hours'], ['2', '2 hours'], ['3', '3 hours'], ['4', '4 hours']];

  showModal(`Reserve Seat ${seat.seatCode}`, `
    <p class="muted">${escapeHtml(seat.zoneName || '')}</p>
    <label class="field-label">Date</label>
    <input class="field-input" type="date" id="res-date" value="${today}" min="${today}">
    <label class="field-label">Start Time</label>
    <select class="field-input" id="res-start">${startOptions.map(t => `<option>${t}</option>`).join('')}</select>
    <label class="field-label">Duration</label>
    <select class="field-input" id="res-duration">${durations.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    <div class="error-text" id="res-error"></div>
  `, `
    <div style="display:flex; flex-direction:column; gap:8px; margin-top:14px;">
      <button class="btn btn-primary" onclick="confirmReservation(${seat.seatId})">Confirm Reservation</button>
      <button class="btn btn-secondary hidden" id="waitlist-btn" onclick="joinWaitlistAction(${seat.seatId})">Join Waitlist Instead</button>
    </div>
  `);
}

function computeEndTime(start, durationHours) {
  const [h, m] = start.split(':').map(Number);
  const totalMin = h * 60 + m + durationHours * 60;
  const eh = Math.floor(totalMin / 60) % 24;
  const em = totalMin % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

async function confirmReservation(seatId) {
  const resDate = val('res-date');
  const startTime = val('res-start');
  const duration = parseFloat(val('res-duration'));
  const endTime = computeEndTime(startTime, duration);
  const errorEl = document.getElementById('res-error');
  errorEl.textContent = '';

  try {
    await api('/reservations', { method: 'POST', body: { seatId, resDate, startTime, endTime } });
    closeModal();
    alert(`Reservation Confirmed!\n\nDate: ${resDate}\nTime: ${startTime} - ${endTime}\nStatus: Confirmed`);
    onNav('My Reservations');
  } catch (e) {
    errorEl.textContent = e.message;
    if (e.payload && e.payload.conflict) {
      document.getElementById('waitlist-btn').classList.remove('hidden');
      document.getElementById('waitlist-btn').dataset.date = resDate;
      document.getElementById('waitlist-btn').dataset.start = startTime;
      document.getElementById('waitlist-btn').dataset.end = endTime;
    }
  }
}

async function joinWaitlistAction(seatId) {
  const btn = document.getElementById('waitlist-btn');
  await api('/reservations/waitlist', {
    method: 'POST',
    body: { seatId, resDate: btn.dataset.date, startTime: btn.dataset.start, endTime: btn.dataset.end }
  });
  closeModal();
  showToast("You've been added to the waitlist. We'll book it automatically if it frees up.");
}

// ===================== My reservations =====================
async function renderMyReservations() {
  const all = await api('/reservations/mine');
  const mine = all.filter(r => r.status === 'UPCOMING' || r.status === 'ACTIVE')
    .sort((a, b) => (a.resDate + a.startTime).localeCompare(b.resDate + b.startTime));

  if (!mine.length) {
    return setContent(emptyState('No Active Reservations', 'You have no upcoming or active reservations right now.', 'Reserve a Seat', "onNav('Reserve Seat')"));
  }

  setContent(mine.map(r => `
    <div class="card" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <strong>Seat ${r.seatCode}</strong> • ${r.resDate}<br>
        <span class="muted">${r.startTime} - ${r.endTime} • Status: ${r.status}</span>
      </div>
      <div style="display:flex; gap:8px;">
        ${r.status === 'UPCOMING' ? `
          <button class="btn btn-secondary" onclick="cancelReservation(${r.reservationId})">Cancel</button>
          <button class="btn btn-primary" onclick="checkInAction(${r.reservationId})">CHECK IN</button>
        ` : `
          <span class="muted">Checked in: ${new Date(r.checkinTime).toLocaleTimeString()}</span>
          <button class="btn btn-primary" onclick="checkOutAction(${r.reservationId})">CHECK OUT</button>
        `}
      </div>
    </div>
  `).join(''));
}

async function cancelReservation(id) {
  await api(`/reservations/${id}/cancel`, { method: 'POST' });
  onNav('My Reservations');
}
async function checkInAction(id) {
  try {
    await api(`/reservations/${id}/checkin`, { method: 'POST' });
    onNav('My Reservations');
  } catch (e) { alert(e.message); }
}
async function checkOutAction(id) {
  await api(`/reservations/${id}/checkout`, { method: 'POST' });
  onNav('My Reservations');
}

// ===================== Favorites =====================
async function renderFavorites() {
  const favs = await api('/favorites');
  if (!favs.length) {
    return setContent(emptyState('No Favorite Seats', 'Star a seat from the seat map to quick-book it here.', 'Browse Seat Map', "onNav('Seat Map')"));
  }
  setContent(favs.map(s => `
    <div class="card" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
      <strong>⭐ Seat ${s.seatCode} • ${escapeHtml(s.zoneName)} • ${s.status}</strong>
      <button class="btn btn-primary" onclick='openReservationDialog(${JSON.stringify(s).replace(/'/g, "&#39;")})'>Quick Book</button>
    </div>
  `).join(''));
}

// ===================== History =====================
async function renderHistory() {
  const all = await api('/reservations/mine');
  if (!all.length) return setContent(emptyState('No Reservations Yet', 'Your booking history will appear here.', null, ''));

  setContent(`
    <div class="card">
      <table>
        <thead><tr><th>ID</th><th>Seat</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
        <tbody>
          ${all.map(r => `<tr><td>#${r.reservationId}</td><td>${r.seatCode}</td><td>${r.resDate}</td><td>${r.startTime}-${r.endTime}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `);
}

// ===================== Analytics =====================
async function renderStudentAnalytics() {
  const [prediction, zones] = await Promise.all([api('/ml/predict'), api('/analytics/zones')]);
  const max = Math.max(...zones.map(z => z.reservationCount), 1);

  setContent(`
    <div class="card" style="margin-bottom:16px;">
      <h2 class="card-title">ML-Predicted Occupancy — Today</h2>
      ${prediction.predictions.filter(p => p.hour % 2 === 0).map(p => barRow(hourLabel(p.hour), Math.round(p.occupancyPct), 100)).join('')}
      <p class="muted" style="margin-top:10px;">Model: linear regression trained from scratch on historical occupancy (hour + day-of-week features).</p>
    </div>
    <div class="card">
      <h2 class="card-title">Zone Utilization (all-time reservations)</h2>
      ${zones.map(z => barRow(z.zoneName, z.reservationCount, max)).join('')}
    </div>
  `);
}

// ===================== Profile =====================
async function renderProfile() {
  const user = getUser();
  const all = await api('/reservations/mine');
  const completed = all.filter(r => r.status === 'COMPLETED').length;
  const totalMinutes = all.reduce((sum, r) => sum + (r.durationMinutes || 0), 0);

  setContent(`
    <div class="card">
      <div class="two-col">
        ${profileField('Full Name', user.fullName)}
        ${profileField('Student ID', user.registerNo)}
        ${profileField('Department', user.department)}
        ${profileField('Academic Year', user.academicYear)}
        ${profileField('Email', user.loginId)}
        ${profileField('Mobile', user.mobile)}
        ${profileField('Completed Sessions', completed)}
        ${profileField('No-show Count', user.noShowCount || 0)}
        ${profileField('Total Library Usage', Math.floor(totalMinutes / 60) + 'h ' + (totalMinutes % 60) + 'm')}
      </div>
    </div>
  `);
}
function profileField(label, value) {
  return `<div><div class="muted" style="font-size:11px; text-transform:uppercase;">${label}</div><div style="font-weight:700;">${value ?? '-'}</div></div>`;
}

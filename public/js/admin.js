async function adminNav(item) {
  setPageTitle(item);
  try {
    switch (item) {
      case 'Dashboard': return renderAdminDashboard();
      case 'Seat Map': return renderSeatMapScreen(null, false);
      case 'Manage Seats': return renderManageSeats();
      case 'Reservations': return renderAllReservations();
      case 'Reports': return renderReports();
      case 'Demand Heatmap': return renderHeatmap();
      case 'Announcements': return renderAnnouncements();
    }
  } catch (e) {
    setContent(`<p class="error-text">${escapeHtml(e.message)}</p>`);
  }
}

// ===================== Dashboard =====================
async function renderAdminDashboard() {
  const summary = await api('/analytics/summary');
  setContent(`
    <div class="stat-grid cols-3">
      ${statCard('TOTAL STUDENTS', summary.totalStudents, 'var(--navy)')}
      ${statCard('TOTAL SEATS', summary.totalSeats, 'var(--navy)')}
      ${statCard('ACTIVE RESERVATIONS', summary.reserved + summary.occupied, 'var(--orange)')}
      ${statCard('CURRENT OCCUPANCY', summary.occupancyPct + '%', 'var(--red)')}
      ${statCard("TODAY'S CHECK-INS", summary.todaysCheckins, 'var(--green)')}
      ${statCard("TODAY'S NO-SHOWS", summary.todaysNoShows, 'var(--gray)')}
    </div>
    <div class="two-col">
      <div class="card">
        <h2 class="card-title">Quick Actions</h2>
        <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-start;">
          <button class="btn btn-primary" onclick="onNav('Manage Seats')">+ Add Seat</button>
          <button class="btn btn-secondary" onclick="onNav('Reservations')">View Reservations</button>
          <button class="btn btn-secondary" onclick="onNav('Demand Heatmap')">View Demand Heatmap</button>
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">Live Insights</h2>
        <p>Historical peak hour: <strong>${summary.peakHour ? formatTimeLabel(summary.peakHour) : 'N/A'}</strong></p>
        <p>Seats under maintenance: <strong>${summary.maintenance}</strong></p>
        <p>Today's reservations so far: <strong>${summary.todaysReservations}</strong></p>
        <p>Students on waitlists: <strong>${summary.waitlistCount}</strong></p>
      </div>
    </div>
  `);
}
function formatTimeLabel(hhmm) {
  const [h] = hhmm.split(':').map(Number);
  return hourLabel(h);
}

// ===================== Manage seats =====================
async function renderManageSeats() {
  const [seats, zones] = await Promise.all([api('/seats'), api('/zones')]);
  const zoneMap = Object.fromEntries(zones.map(z => [z.zoneId, z.zoneName]));

  setContent(`
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <label>Seat Code: <input class="field-input" style="width:100px; display:inline-block;" id="new-seat-code"></label>
        <label>Zone:
          <select class="field-input" style="display:inline-block; width:auto;" id="new-seat-zone">
            ${zones.map(z => `<option value="${z.zoneId}">${escapeHtml(z.zoneName)}</option>`).join('')}
          </select>
        </label>
        <button class="btn btn-primary" onclick="addSeat()">Add Seat</button>
      </div>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Seat</th><th>Zone</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${seats.map(s => `
            <tr>
              <td>${s.seatCode}</td>
              <td>${escapeHtml(zoneMap[s.zoneId] || '-')}</td>
              <td>${s.status}</td>
              <td>
                <button class="btn-link" onclick="viewSeatBookings(${s.seatId}, '${escapeHtml(s.seatCode)}')">View Bookings</button> ·
                <button class="btn-link" onclick='editSeat(${JSON.stringify(s).replace(/'/g, "&#39;")})'>Edit</button> ·
                ${s.status !== 'MAINTENANCE'
                  ? `<button class="btn-link" onclick="setSeatStatus(${s.seatId}, 'MAINTENANCE')">Maintenance</button>`
                  : `<button class="btn-link" onclick="setSeatStatus(${s.seatId}, 'AVAILABLE')">Mark Available</button>`} ·
                <button class="btn-link" style="color:var(--red);" onclick="removeSeat(${s.seatId})">Remove</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `);
}

async function addSeat() {
  const seatCode = val('new-seat-code');
  const zoneId = parseInt(document.getElementById('new-seat-zone').value, 10);
  if (!seatCode) return;
  try {
    await api('/seats', { method: 'POST', body: { seatCode, zoneId } });
    showToast(`Seat ${seatCode.toUpperCase()} added — students will see it immediately.`);
    renderManageSeats();
  } catch (e) { alert(e.message); }
}

async function setSeatStatus(seatId, status) {
  await api(`/seats/${seatId}`, { method: 'PUT', body: { status } });
  renderManageSeats();
}

async function removeSeat(seatId) {
  if (!confirm('Remove this seat permanently?')) return;
  await api(`/seats/${seatId}`, { method: 'DELETE' });
  renderManageSeats();
}

function editSeat(seat) {
  showModal(`Edit Seat ${seat.seatCode}`, `
    <label class="field-label">Seat Code</label>
    <input class="field-input" id="edit-seat-code" value="${seat.seatCode}">
    <label class="field-label">Zone</label>
    <select class="field-input" id="edit-seat-zone-id" data-current="${seat.zoneId}"></select>
  `, `<button class="btn btn-primary" style="margin-top:14px;" onclick="saveSeatEdit(${seat.seatId})">Save</button>`);

  api('/zones').then(zones => {
    const sel = document.getElementById('edit-seat-zone-id');
    sel.innerHTML = zones.map(z => `<option value="${z.zoneId}" ${z.zoneId === seat.zoneId ? 'selected' : ''}>${escapeHtml(z.zoneName)}</option>`).join('');
  });
}

async function saveSeatEdit(seatId) {
  const seatCode = val('edit-seat-code');
  const zoneId = parseInt(document.getElementById('edit-seat-zone-id').value, 10);
  await api(`/seats/${seatId}`, { method: 'PUT', body: { seatCode, zoneId } });
  closeModal();
  renderManageSeats();
}

async function viewSeatBookings(seatId, seatCode) {
  const bookings = await api(`/seats/${seatId}/bookings`);
  const rows = bookings.length ? bookings.map(b => `
    <div class="list-row">
      <div>
        <strong>${escapeHtml(b.studentName)}</strong><br>
        <span class="muted">${b.resDate} • ${b.startTime}-${b.endTime} • ${b.status}</span>
      </div>
      ${(b.status === 'UPCOMING' || b.status === 'ACTIVE')
        ? `<button class="btn btn-secondary" onclick="adminCancelBooking(${b.reservationId}, ${seatId}, '${escapeHtml(seatCode)}')">Admin Cancel</button>`
        : ''}
    </div>`).join('') : '<p class="muted">No bookings for this seat yet.</p>';
  showModal(`Bookings for Seat ${seatCode}`, `<div style="max-height:400px; overflow-y:auto;">${rows}</div>`);
}

async function adminCancelBooking(reservationId, seatId, seatCode) {
  await api(`/reservations/${reservationId}/cancel`, { method: 'POST' });
  viewSeatBookings(seatId, seatCode);
}

// ===================== All reservations =====================
async function renderAllReservations() {
  const all = await api('/reservations');
  if (!all.length) return setContent(emptyState('No Reservations', 'No reservations have been made yet.', null, ''));
  setContent(`
    <div class="card">
      <table>
        <thead><tr><th>ID</th><th>Student</th><th>Seat</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
        <tbody>
          ${all.map(r => `<tr><td>#${r.reservationId}</td><td>${escapeHtml(r.studentName)}</td><td>${r.seatCode}</td><td>${r.resDate}</td><td>${r.startTime}-${r.endTime}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `);
}

// ===================== Reports =====================
async function renderReports() {
  const summary = await api('/analytics/summary');
  setContent(`
    <div class="card" style="margin-bottom:16px;">
      <h2 class="card-title">Daily Report — ${new Date().toLocaleDateString()}</h2>
      <p>Total reservations today: <strong>${summary.todaysReservations}</strong></p>
      <p>Total check-ins today: <strong>${summary.todaysCheckins}</strong></p>
      <p>No-shows today: <strong>${summary.todaysNoShows}</strong></p>
      <p>Current occupancy: <strong>${summary.occupancyPct}%</strong></p>
      <p>Historical peak hour: <strong>${summary.peakHour ? formatTimeLabel(summary.peakHour) : 'N/A'}</strong></p>
    </div>
    <div class="card">
      <h2 class="card-title">Export</h2>
      <button class="btn btn-primary" onclick="exportCsv()">Export Reservations to CSV</button>
    </div>
  `);
}

function exportCsv() {
  fetch('/api/reports/reservations.csv', { headers: { Authorization: 'Bearer ' + getToken() } })
    .then(res => res.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'reservations_report.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
}

// ===================== Demand heatmap =====================
async function renderHeatmap() {
  const data = await api('/ml/heatmap');
  setContent(`
    <div class="card" style="margin-bottom:16px;">
      <h2 class="card-title">Model Transparency (linear regression, trained from scratch)</h2>
      <p class="muted">${escapeHtml(data.explain)}</p>
      <button class="btn btn-secondary" style="margin-top:10px;" onclick="retrainModel()">Retrain Model</button>
    </div>
    <div class="card">
      <table class="heatmap-table">
        <thead><tr><th></th>${data.days.map(d => `<th>${d.label}</th>`).join('')}</tr></thead>
        <tbody>
          ${data.hours.map((h, hi) => `
            <tr>
              <th>${hourLabel(h)}</th>
              ${data.days.map(d => {
                const pct = d.cells[hi].occupancyPct;
                return `<td><div class="heatmap-cell" style="background:${demandColor(pct)}">${Math.round(pct)}%</div></td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="display:flex; gap:18px; margin-top:14px; font-size:12px;">
        <span><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${demandColor(20)}"></span> Low demand</span>
        <span><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${demandColor(55)}"></span> Medium demand</span>
        <span><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${demandColor(85)}"></span> High demand</span>
      </div>
    </div>
  `);
}
function demandColor(pct) {
  if (pct < 40) return '#229954';
  if (pct < 70) return '#e6a821';
  return '#c63737';
}
async function retrainModel() {
  await api('/ml/retrain', { method: 'POST' });
  showToast('Model retrained.');
  renderHeatmap();
}

// ===================== Announcements =====================
function renderAnnouncements() {
  setContent(`
    <div class="card">
      <h2 class="card-title">Send an announcement to all students</h2>
      <textarea class="field-input" id="broadcast-message" rows="6" style="resize:vertical;"></textarea>
      <button class="btn btn-primary" style="margin-top:12px;" onclick="sendBroadcast()">Send to All Students</button>
    </div>
  `);
}
async function sendBroadcast() {
  const message = val('broadcast-message');
  if (!message) return;
  await api('/notifications/broadcast', { method: 'POST', body: { message } });
  document.getElementById('broadcast-message').value = '';
  showToast('Announcement sent to all students.');
}

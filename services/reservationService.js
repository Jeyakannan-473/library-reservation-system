const { db } = require('../db/init');

function getSetting(key, fallback) {
  const row = db.prepare(`SELECT setting_value FROM library_settings WHERE setting_key = ?`).get(key);
  return row ? row.setting_value : fallback;
}

function graceMinutes() { return parseInt(getSetting('grace_minutes', '15'), 10); }
function openTime() { return getSetting('open_time', '08:00'); }
function closeTime() { return getSetting('close_time', '22:00'); }

function nowIso() { return new Date().toISOString(); }

function addNotification(userId, title, message, type = 'INFO') {
  db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`)
    .run(userId, title, message, type);
}

function hasConflict(seatId, resDate, startTime) {
  const row = db.prepare(`
    SELECT 1 FROM reservations
    WHERE seat_id = ? AND res_date = ? AND start_time = ? AND status IN ('UPCOMING','ACTIVE')
  `).get(seatId, resDate, startTime);
  return !!row;
}

/** Promotes the earliest matching waitlist entry into a real reservation once a slot frees up. */
function promoteWaitlist(seatId, resDate, startTime, endTime) {
  const entry = db.prepare(`
    SELECT * FROM waitlist WHERE seat_id = ? AND res_date = ? AND start_time = ?
    ORDER BY joined_at ASC LIMIT 1
  `).get(seatId, resDate, startTime);
  if (!entry) return;

  db.prepare(`DELETE FROM waitlist WHERE waitlist_id = ?`).run(entry.waitlist_id);
  const result = createReservation(entry.student_id, seatId, resDate, startTime, endTime, true);
  if (result.ok) {
    const seat = db.prepare(`SELECT seat_code FROM seats WHERE seat_id = ?`).get(seatId);
    addNotification(entry.student_id, 'Waitlist Promoted!',
      `Good news — seat ${seat.seat_code} opened up and has been automatically booked for you on ${resDate} at ${startTime}.`,
      'SUCCESS');
  }
}

function createReservation(studentId, seatId, resDate, startTime, endTime, skipPastCheck = false) {
  const seat = db.prepare(`SELECT * FROM seats WHERE seat_id = ?`).get(seatId);
  if (!seat) return { ok: false, error: 'Seat not found.' };
  if (seat.status === 'MAINTENANCE') return { ok: false, error: 'This seat is under maintenance and cannot be booked.' };

  const today = new Date().toISOString().slice(0, 10);
  if (!skipPastCheck && resDate < today) return { ok: false, error: 'You cannot book a seat in the past.' };
  if (startTime < openTime() || endTime > closeTime()) {
    return { ok: false, error: `Please choose a time within library hours (${openTime()} - ${closeTime()}).` };
  }
  if (endTime <= startTime) return { ok: false, error: 'End time must be after start time.' };
  if (hasConflict(seatId, resDate, startTime)) {
    return { ok: false, error: 'Unable to complete reservation. The selected seat is no longer available for that slot.', conflict: true };
  }

  const info = db.prepare(`
    INSERT INTO reservations (student_id, seat_id, res_date, start_time, end_time, status)
    VALUES (?, ?, ?, ?, ?, 'UPCOMING')
  `).run(studentId, seatId, resDate, startTime, endTime);

  if (resDate === today) {
    db.prepare(`UPDATE seats SET status = 'RESERVED' WHERE seat_id = ?`).run(seatId);
  }
  addNotification(studentId, 'Reservation Confirmed',
    `Seat ${seat.seat_code} booked for ${resDate}, ${startTime} - ${endTime}.`, 'SUCCESS');

  return { ok: true, reservationId: info.lastInsertRowid };
}

function cancelReservation(reservationId, isAdmin = false) {
  const r = db.prepare(`SELECT * FROM reservations WHERE reservation_id = ?`).get(reservationId);
  if (!r) return { ok: false, error: 'Reservation not found.' };
  db.prepare(`UPDATE reservations SET status = 'CANCELLED' WHERE reservation_id = ?`).run(reservationId);
  const seat = db.prepare(`SELECT * FROM seats WHERE seat_id = ?`).get(r.seat_id);
  if (seat && seat.status === 'RESERVED') {
    db.prepare(`UPDATE seats SET status = 'AVAILABLE' WHERE seat_id = ?`).run(seat.seat_id);
  }
  addNotification(r.student_id, 'Reservation Cancelled',
    `Your reservation for seat ${seat ? seat.seat_code : '?'} has been cancelled${isAdmin ? ' by the library administrator' : ''}.`,
    'INFO');
  promoteWaitlist(r.seat_id, r.res_date, r.start_time, r.end_time);
  return { ok: true };
}

function checkIn(reservationId) {
  const r = db.prepare(`SELECT * FROM reservations WHERE reservation_id = ?`).get(reservationId);
  if (!r) return { ok: false, error: 'Reservation not found.' };
  if (r.status !== 'UPCOMING') return { ok: false, error: 'This reservation cannot be checked in.' };

  const startDt = new Date(`${r.res_date}T${r.start_time}:00`);
  const graceEnd = new Date(startDt.getTime() + graceMinutes() * 60000);
  if (new Date() >= graceEnd) return { ok: false, error: 'Check-in window has passed for this reservation.' };

  db.prepare(`UPDATE reservations SET status = 'ACTIVE', checkin_time = ? WHERE reservation_id = ?`).run(nowIso(), reservationId);
  db.prepare(`UPDATE seats SET status = 'OCCUPIED' WHERE seat_id = ?`).run(r.seat_id);
  const seat = db.prepare(`SELECT seat_code FROM seats WHERE seat_id = ?`).get(r.seat_id);
  addNotification(r.student_id, 'Checked In', `You have checked in to seat ${seat.seat_code}.`, 'SUCCESS');
  return { ok: true };
}

function checkOut(reservationId) {
  const r = db.prepare(`SELECT * FROM reservations WHERE reservation_id = ?`).get(reservationId);
  if (!r) return { ok: false, error: 'Reservation not found.' };
  if (r.status !== 'ACTIVE') return { ok: false, error: 'This reservation is not currently active.' };

  const checkoutTime = nowIso();
  const durationMinutes = Math.round((new Date(checkoutTime) - new Date(r.checkin_time)) / 60000);
  db.prepare(`UPDATE reservations SET status = 'COMPLETED', checkout_time = ?, duration_minutes = ? WHERE reservation_id = ?`)
    .run(checkoutTime, durationMinutes, reservationId);
  db.prepare(`UPDATE seats SET status = 'AVAILABLE' WHERE seat_id = ?`).run(r.seat_id);
  const seat = db.prepare(`SELECT seat_code FROM seats WHERE seat_id = ?`).get(r.seat_id);
  addNotification(r.student_id, 'Checked Out', `Session complete. Duration: ${durationMinutes} minutes.`, 'INFO');
  promoteWaitlist(r.seat_id, r.res_date, r.start_time, r.end_time);
  return { ok: true, durationMinutes };
}

/** Sweeps UPCOMING reservations whose grace period has elapsed without check-in. */
function autoExpireStale() {
  const grace = graceMinutes();
  const stale = db.prepare(`
    SELECT * FROM reservations
    WHERE status = 'UPCOMING'
      AND datetime(res_date || ' ' || start_time, '+' || ? || ' minutes') < datetime('now', 'localtime')
  `).all(grace);

  for (const r of stale) {
    db.prepare(`UPDATE reservations SET status = 'EXPIRED' WHERE reservation_id = ?`).run(r.reservation_id);
    const seat = db.prepare(`SELECT * FROM seats WHERE seat_id = ?`).get(r.seat_id);
    if (seat && seat.status === 'RESERVED') {
      db.prepare(`UPDATE seats SET status = 'AVAILABLE' WHERE seat_id = ?`).run(seat.seat_id);
    }
    db.prepare(`UPDATE users SET no_show_count = no_show_count + 1 WHERE user_id = ?`).run(r.student_id);
    addNotification(r.student_id, 'Reservation Expired',
      `Your reservation for seat ${seat ? seat.seat_code : '?'} expired because check-in was not completed within the allowed ${grace}-minute grace period.`,
      'WARNING');
    promoteWaitlist(r.seat_id, r.res_date, r.start_time, r.end_time);
  }
}

function joinWaitlist(studentId, seatId, resDate, startTime, endTime) {
  db.prepare(`INSERT INTO waitlist (student_id, seat_id, res_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)`)
    .run(studentId, seatId, resDate, startTime, endTime);
  const seat = db.prepare(`SELECT seat_code FROM seats WHERE seat_id = ?`).get(seatId);
  addNotification(studentId, 'Added to Waitlist',
    `We'll automatically book seat ${seat.seat_code} for you on ${resDate} at ${startTime} if it becomes free.`, 'INFO');
}

module.exports = {
  createReservation, cancelReservation, checkIn, checkOut, autoExpireStale,
  joinWaitlist, promoteWaitlist, hasConflict, addNotification,
  graceMinutes, openTime, closeTime
};

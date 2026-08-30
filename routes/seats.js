const express = require('express');
const { db } = require('../db/init');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { hasConflict } = require('../services/reservationService');

const router = express.Router();

router.get('/zones', requireAuth, (req, res) => {
  const zones = db.prepare(`SELECT * FROM zones ORDER BY zone_id`).all();
  const withCounts = zones.map(z => {
    const available = db.prepare(`SELECT COUNT(*) c FROM seats WHERE zone_id = ? AND status = 'AVAILABLE'`).get(z.zone_id).c;
    const total = db.prepare(`SELECT COUNT(*) c FROM seats WHERE zone_id = ?`).get(z.zone_id).c;
    return { zoneId: z.zone_id, zoneName: z.zone_name, description: z.description, icon: z.icon, available, total };
  });
  res.json(withCounts);
});

router.get('/seats', requireAuth, (req, res) => {
  const { zoneId } = req.query;
  let seats;
  if (zoneId) {
    seats = db.prepare(`
      SELECT s.*, z.zone_name FROM seats s JOIN zones z ON s.zone_id = z.zone_id
      WHERE s.zone_id = ? ORDER BY s.seat_code
    `).all(zoneId);
  } else {
    seats = db.prepare(`
      SELECT s.*, z.zone_name FROM seats s JOIN zones z ON s.zone_id = z.zone_id ORDER BY s.zone_id, s.seat_code
    `).all();
  }
  const favSet = new Set(
    db.prepare(`SELECT seat_id FROM favorites WHERE student_id = ?`).all(req.user.userId).map(r => r.seat_id)
  );
  res.json(seats.map(s => ({
    seatId: s.seat_id, seatCode: s.seat_code, zoneId: s.zone_id, zoneName: s.zone_name,
    status: s.status, isFavorite: favSet.has(s.seat_id)
  })));
});

router.post('/seats', requireAuth, requireAdmin, (req, res) => {
  const { seatCode, zoneId } = req.body;
  if (!seatCode || !zoneId) return res.status(400).json({ error: 'Seat code and zone are required.' });
  try {
    const info = db.prepare(`INSERT INTO seats (seat_code, zone_id) VALUES (?, ?)`).run(seatCode.toUpperCase(), zoneId);
    res.json({ ok: true, seatId: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'A seat with that code already exists.' });
  }
});

router.put('/seats/:id', requireAuth, requireAdmin, (req, res) => {
  const { seatCode, zoneId, status } = req.body;
  const seat = db.prepare(`SELECT * FROM seats WHERE seat_id = ?`).get(req.params.id);
  if (!seat) return res.status(404).json({ error: 'Seat not found.' });
  db.prepare(`UPDATE seats SET seat_code = ?, zone_id = ?, status = ? WHERE seat_id = ?`).run(
    (seatCode || seat.seat_code).toUpperCase(), zoneId || seat.zone_id, status || seat.status, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/seats/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare(`DELETE FROM seats WHERE seat_id = ?`).run(req.params.id);
  res.json({ ok: true });
});

router.get('/seats/:id/bookings', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.full_name FROM reservations r JOIN users u ON r.student_id = u.user_id
    WHERE r.seat_id = ? ORDER BY r.res_date DESC, r.start_time DESC
  `).all(req.params.id);
  res.json(rows.map(mapReservationRow));
});

router.post('/favorites/toggle', requireAuth, (req, res) => {
  const { seatId } = req.body;
  const existing = db.prepare(`SELECT 1 FROM favorites WHERE student_id = ? AND seat_id = ?`).get(req.user.userId, seatId);
  if (existing) {
    db.prepare(`DELETE FROM favorites WHERE student_id = ? AND seat_id = ?`).run(req.user.userId, seatId);
    res.json({ ok: true, favorite: false });
  } else {
    db.prepare(`INSERT INTO favorites (student_id, seat_id) VALUES (?, ?)`).run(req.user.userId, seatId);
    res.json({ ok: true, favorite: true });
  }
});

router.get('/favorites', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, z.zone_name FROM favorites f
    JOIN seats s ON f.seat_id = s.seat_id JOIN zones z ON s.zone_id = z.zone_id
    WHERE f.student_id = ?
  `).all(req.user.userId);
  res.json(rows.map(s => ({ seatId: s.seat_id, seatCode: s.seat_code, zoneName: s.zone_name, status: s.status })));
});

function mapReservationRow(r) {
  return {
    reservationId: r.reservation_id, studentId: r.student_id, studentName: r.full_name,
    seatId: r.seat_id, resDate: r.res_date, startTime: r.start_time, endTime: r.end_time,
    status: r.status, checkinTime: r.checkin_time, checkoutTime: r.checkout_time, durationMinutes: r.duration_minutes
  };
}

module.exports = router;

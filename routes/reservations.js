const express = require('express');
const { db } = require('../db/init');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const rs = require('../services/reservationService');

const router = express.Router();

function mapRow(r) {
  return {
    reservationId: r.reservation_id, studentId: r.student_id, studentName: r.full_name,
    seatId: r.seat_id, seatCode: r.seat_code, resDate: r.res_date, startTime: r.start_time,
    endTime: r.end_time, status: r.status, checkinTime: r.checkin_time, checkoutTime: r.checkout_time,
    durationMinutes: r.duration_minutes
  };
}

const SELECT_JOIN = `
  SELECT r.*, s.seat_code, u.full_name FROM reservations r
  JOIN seats s ON r.seat_id = s.seat_id
  JOIN users u ON r.student_id = u.user_id
`;

router.post('/', requireAuth, (req, res) => {
  rs.autoExpireStale();
  const { seatId, resDate, startTime, endTime } = req.body;
  if (!seatId || !resDate || !startTime || !endTime) return res.status(400).json({ error: 'Missing booking details.' });
  const result = rs.createReservation(req.user.userId, seatId, resDate, startTime, endTime);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.post('/waitlist', requireAuth, (req, res) => {
  const { seatId, resDate, startTime, endTime } = req.body;
  rs.joinWaitlist(req.user.userId, seatId, resDate, startTime, endTime);
  res.json({ ok: true });
});

router.get('/mine', requireAuth, (req, res) => {
  rs.autoExpireStale();
  const rows = db.prepare(`${SELECT_JOIN} WHERE r.student_id = ? ORDER BY r.res_date DESC, r.start_time DESC`).all(req.user.userId);
  res.json(rows.map(mapRow));
});

router.get('/', requireAuth, requireAdmin, (req, res) => {
  rs.autoExpireStale();
  const rows = db.prepare(`${SELECT_JOIN} ORDER BY r.res_date DESC, r.start_time DESC`).all();
  res.json(rows.map(mapRow));
});

router.post('/:id/checkin', requireAuth, (req, res) => {
  const result = rs.checkIn(req.params.id);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.post('/:id/checkout', requireAuth, (req, res) => {
  const result = rs.checkOut(req.params.id);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const reservation = db.prepare(`SELECT * FROM reservations WHERE reservation_id = ?`).get(req.params.id);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
  if (reservation.student_id !== req.user.userId && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'You can only cancel your own reservations.' });
  }
  const result = rs.cancelReservation(req.params.id, req.user.role === 'ADMIN' && reservation.student_id !== req.user.userId);
  res.json(result);
});

module.exports = router;

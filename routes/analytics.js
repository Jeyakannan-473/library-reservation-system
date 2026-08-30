const express = require('express');
const { db } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/summary', requireAuth, (req, res) => {
  const total = db.prepare(`SELECT COUNT(*) c FROM seats`).get().c;
  const available = db.prepare(`SELECT COUNT(*) c FROM seats WHERE status='AVAILABLE'`).get().c;
  const occupied = db.prepare(`SELECT COUNT(*) c FROM seats WHERE status='OCCUPIED'`).get().c;
  const reserved = db.prepare(`SELECT COUNT(*) c FROM seats WHERE status='RESERVED'`).get().c;
  const maintenance = db.prepare(`SELECT COUNT(*) c FROM seats WHERE status='MAINTENANCE'`).get().c;
  const today = new Date().toISOString().slice(0, 10);
  const todaysReservations = db.prepare(`SELECT COUNT(*) c FROM reservations WHERE res_date = ?`).get(today).c;
  const todaysCheckins = db.prepare(`SELECT COUNT(*) c FROM reservations WHERE res_date = ? AND checkin_time IS NOT NULL`).get(today).c;
  const todaysNoShows = db.prepare(`SELECT COUNT(*) c FROM reservations WHERE res_date = ? AND status = 'EXPIRED'`).get(today).c;
  const totalStudents = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'STUDENT'`).get().c;
  const waitlistCount = db.prepare(`SELECT COUNT(*) c FROM waitlist`).get().c;

  const peakRow = db.prepare(`
    SELECT start_time, COUNT(*) c FROM reservations GROUP BY start_time ORDER BY c DESC LIMIT 1
  `).get();

  res.json({
    totalSeats: total, available, occupied, reserved, maintenance,
    occupancyPct: total ? Math.round((occupied / total) * 1000) / 10 : 0,
    todaysReservations, todaysCheckins, todaysNoShows, totalStudents, waitlistCount,
    peakHour: peakRow ? peakRow.start_time : null
  });
});

router.get('/zones', requireAuth, (req, res) => {
  const zones = db.prepare(`SELECT * FROM zones ORDER BY zone_id`).all();
  const result = zones.map(z => {
    const count = db.prepare(`
      SELECT COUNT(*) c FROM reservations r JOIN seats s ON r.seat_id = s.seat_id WHERE s.zone_id = ?
    `).get(z.zone_id).c;
    return { zoneName: z.zone_name, reservationCount: count };
  });
  res.json(result);
});

module.exports = router;

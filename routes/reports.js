const express = require('express');
const { db } = require('../db/init');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/reservations.csv', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT r.reservation_id, u.full_name, s.seat_code, r.res_date, r.start_time, r.end_time, r.status
    FROM reservations r JOIN users u ON r.student_id = u.user_id JOIN seats s ON r.seat_id = s.seat_id
    ORDER BY r.res_date DESC, r.start_time DESC
  `).all();

  let csv = 'ReservationID,Student,Seat,Date,StartTime,EndTime,Status\n';
  for (const r of rows) {
    csv += `${r.reservation_id},"${r.full_name}",${r.seat_code},${r.res_date},${r.start_time},${r.end_time},${r.status}\n`;
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reservations_report.csv"');
  res.send(csv);
});

module.exports = router;

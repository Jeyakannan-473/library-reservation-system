require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { init } = require('./db/init');
const { autoExpireStale } = require('./services/reservationService');

init();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/seats'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/ml', require('./routes/ml'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reports', require('./routes/reports'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Serve the frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Sweep expired reservations every minute
setInterval(() => {
  try { autoExpireStale(); } catch (e) { console.error('auto-expire sweep failed', e); }
}, 60 * 1000);
autoExpireStale();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Smart Library Reservation System running at http://localhost:${PORT}`);
  console.log('Demo admin:   ADMIN1001 / Admin@123');
  console.log('Demo student: student@library.edu / Student@123');
});

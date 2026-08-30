const express = require('express');
const { db } = require('../db/init');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const MLDemandModel = require('../services/mlModel');

const router = express.Router();

let cachedModel = null;

function getModel() {
  if (!cachedModel) {
    cachedModel = new MLDemandModel();
    const rows = db.prepare(`SELECT log_date, log_hour, occupancy_pct FROM occupancy_logs`).all();
    cachedModel.train(rows);
  }
  return cachedModel;
}

router.get('/predict', requireAuth, (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const model = getModel();
  const predictions = [];
  for (let h = 8; h <= 21; h++) {
    predictions.push({ hour: h, occupancyPct: Math.round(model.predict(targetDate, h) * 10) / 10 });
  }
  res.json({ date: targetDate, predictions, explain: model.explain() });
});

router.get('/heatmap', requireAuth, (req, res) => {
  const model = getModel();
  const hours = [8, 10, 12, 14, 16, 18, 20];
  const days = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);
    const cells = hours.map(h => ({ hour: h, occupancyPct: Math.round(model.predict(dateStr, h) * 10) / 10 }));
    days.push({ date: dateStr, label: date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }), cells });
  }
  res.json({ hours, days, explain: model.explain() });
});

router.post('/retrain', requireAuth, requireAdmin, (req, res) => {
  cachedModel = new MLDemandModel();
  const rows = db.prepare(`SELECT log_date, log_hour, occupancy_pct FROM occupancy_logs`).all();
  cachedModel.train(rows);
  res.json({ ok: true, explain: cachedModel.explain() });
});

module.exports = router;

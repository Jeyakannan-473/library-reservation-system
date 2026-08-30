const express = require('express');
const { db } = require('../db/init');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? OR user_id = 0 ORDER BY created_at DESC LIMIT 50
  `).all(req.user.userId);
  res.json(rows.map(n => ({
    notificationId: n.notification_id, title: n.title, message: n.message,
    type: n.type, read: !!n.is_read, createdAt: n.created_at, broadcast: n.user_id === 0
  })));
});

router.post('/mark-read', requireAuth, (req, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id = 0`).run(req.user.userId);
  res.json({ ok: true });
});

router.post('/broadcast', requireAuth, requireAdmin, (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message cannot be empty.' });
  db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (0, 'Library Announcement', ?, 'ANNOUNCEMENT')`)
    .run(message.trim());
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/init');
const { signToken } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$/;
const MOBILE_RE = /^(\+91[-\s]?)?[6-9]\d{9}$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=]).{8,}$/;

function publicUser(u) {
  return {
    userId: u.user_id, fullName: u.full_name, loginId: u.login_id, role: u.role,
    mobile: u.mobile, registerNo: u.register_no, department: u.department,
    academicYear: u.academic_year, noShowCount: u.no_show_count, designation: u.designation
  };
}

router.post('/register', (req, res) => {
  const { fullName, registerNo, email, mobile, department, academicYear, password, confirmPassword } = req.body;

  if (![fullName, registerNo, email, mobile, department, academicYear, password].every(Boolean)) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid college email address.' });
  if (!MOBILE_RE.test(mobile)) return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number.' });
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
  if (!PASSWORD_RE.test(password)) {
    return res.status(400).json({ error: 'Password must be 8+ characters with upper, lower, digit & special character.' });
  }

  const existingEmail = db.prepare(`SELECT 1 FROM users WHERE login_id = ?`).get(email);
  if (existingEmail) return res.status(400).json({ error: 'This email is already registered.' });
  const existingReg = db.prepare(`SELECT 1 FROM users WHERE register_no = ?`).get(registerNo);
  if (existingReg) return res.status(400).json({ error: 'This Student ID / Register Number is already registered.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO users (full_name, login_id, password_hash, role, mobile, register_no, department, academic_year)
    VALUES (?, ?, ?, 'STUDENT', ?, ?, ?, ?)
  `).run(fullName, email, hash, mobile, registerNo, department, academicYear);

  db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`)
    .run(info.lastInsertRowid, 'Welcome!', 'Your library account has been created successfully.', 'SUCCESS');

  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const { loginId, password, expectedRole } = req.body;
  if (!loginId || !password) return res.status(400).json({ error: 'Please enter both fields.' });

  const user = db.prepare(`SELECT * FROM users WHERE login_id = ? AND is_active = 1`).get(loginId);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials. Please try again.' });
  }
  if (expectedRole && user.role !== expectedRole) {
    return res.status(403).json({
      error: expectedRole === 'ADMIN' ? 'This is not an admin account.' : 'Please use the Admin Portal to log in.'
    });
  }

  const token = signToken(user);
  res.json({ ok: true, token, user: publicUser(user) });
});

module.exports = router;

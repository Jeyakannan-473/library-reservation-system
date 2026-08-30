const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'library.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function tableExists(name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

function init() {
  const fresh = !tableExists('users');

  db.exec(`
    CREATE TABLE IF NOT EXISTS library_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      login_id TEXT NOT NULL UNIQUE,      -- college email for students, Admin ID for admins
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('STUDENT','ADMIN')),
      mobile TEXT,
      register_no TEXT,
      department TEXT,
      academic_year TEXT,
      no_show_count INTEGER DEFAULT 0,
      designation TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS zones (
      zone_id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_name TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT
    );

    CREATE TABLE IF NOT EXISTS seats (
      seat_id INTEGER PRIMARY KEY AUTOINCREMENT,
      seat_code TEXT NOT NULL UNIQUE,
      zone_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','RESERVED','OCCUPIED','MAINTENANCE')),
      FOREIGN KEY (zone_id) REFERENCES zones(zone_id)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      reservation_id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      seat_id INTEGER NOT NULL,
      res_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK(status IN ('UPCOMING','ACTIVE','COMPLETED','CANCELLED','EXPIRED')),
      checkin_time TEXT,
      checkout_time TEXT,
      duration_minutes INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(user_id),
      FOREIGN KEY (seat_id) REFERENCES seats(seat_id)
    );

    -- Only one UPCOMING/ACTIVE reservation may occupy a given seat/date/time —
    -- cancelled, expired, or completed rows for the same slot don't conflict.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_slot ON reservations(seat_id, res_date, start_time)
      WHERE status IN ('UPCOMING','ACTIVE');

    CREATE TABLE IF NOT EXISTS waitlist (
      waitlist_id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      seat_id INTEGER NOT NULL,
      res_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favorites (
      student_id INTEGER NOT NULL,
      seat_id INTEGER NOT NULL,
      PRIMARY KEY (student_id, seat_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,          -- 0 = broadcast to everyone
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'INFO',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS occupancy_logs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT NOT NULL,
      log_hour INTEGER NOT NULL,
      occupancy_pct REAL NOT NULL,
      UNIQUE(log_date, log_hour)
    );

    CREATE INDEX IF NOT EXISTS idx_res_date ON reservations(res_date);
    CREATE INDEX IF NOT EXISTS idx_res_status ON reservations(status);
    CREATE INDEX IF NOT EXISTS idx_occ_date ON occupancy_logs(log_date);
  `);

  if (fresh) seed();
}

function seed() {
  console.log('Seeding fresh demo data...');

  db.prepare(`INSERT INTO library_settings (setting_key, setting_value) VALUES (?, ?)`).run('institution_name', 'Nationwide Institute of Technology');
  db.prepare(`INSERT INTO library_settings (setting_key, setting_value) VALUES (?, ?)`).run('open_time', '08:00');
  db.prepare(`INSERT INTO library_settings (setting_key, setting_value) VALUES (?, ?)`).run('close_time', '22:00');
  db.prepare(`INSERT INTO library_settings (setting_key, setting_value) VALUES (?, ?)`).run('grace_minutes', '15');

  const zoneDefs = [
    ['Silent Study Zone', 'No talking — deep focus reading', '🤫'],
    ['Discussion Zone', 'Group work & collaborative study', '💬'],
    ['Smart Digital Zone', 'Power outlets & monitor access', '💻'],
    ['General Reading Area', 'Open, relaxed reading space', '📖'],
    ['Reference Section', 'Near the reference collection', '📚']
  ];
  const insertZone = db.prepare(`INSERT INTO zones (zone_name, description, icon) VALUES (?, ?, ?)`);
  const zoneIds = zoneDefs.map(z => insertZone.run(...z).lastInsertRowid);

  const insertSeat = db.prepare(`INSERT INTO seats (seat_code, zone_id) VALUES (?, ?)`);
  const prefixes = ['A', 'B', 'C', 'D', 'E'];
  zoneIds.forEach((zoneId, zi) => {
    for (let i = 1; i <= 10; i++) {
      const code = prefixes[zi] + String(i).padStart(2, '0');
      insertSeat.run(code, zoneId);
    }
  });
  // a couple under maintenance for realism
  db.prepare(`UPDATE seats SET status='MAINTENANCE' WHERE seat_code IN ('A05','E10')`).run();

  const insertUser = db.prepare(`
    INSERT INTO users (full_name, login_id, password_hash, role, mobile, register_no, department, academic_year, designation)
    VALUES (@full_name, @login_id, @password_hash, @role, @mobile, @register_no, @department, @academic_year, @designation)
  `);
  insertUser.run({
    full_name: 'Library Administrator', login_id: 'ADMIN1001',
    password_hash: bcrypt.hashSync('Admin@123', 10), role: 'ADMIN',
    mobile: null, register_no: null, department: null, academic_year: null, designation: 'Chief Librarian'
  });
  insertUser.run({
    full_name: 'Demo Student', login_id: 'student@library.edu',
    password_hash: bcrypt.hashSync('Student@123', 10), role: 'STUDENT',
    mobile: '9876543210', register_no: 'CS21B045', department: 'Computer Science & Engineering',
    academic_year: '3rd Year', designation: null
  });

  // Historical occupancy for ML training (30 days back, hourly)
  const insertLog = db.prepare(`INSERT OR IGNORE INTO occupancy_logs (log_date, log_hour, occupancy_pct) VALUES (?, ?, ?)`);
  const today = new Date();
  for (let d = 1; d <= 30; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    for (let h = 8; h <= 21; h++) {
      let base;
      if (h >= 11 && h <= 16) base = 70 + Math.random() * 25;
      else if (h >= 9 && h <= 10) base = 40 + Math.random() * 20;
      else if (h >= 17 && h <= 19) base = 45 + Math.random() * 25;
      else base = 15 + Math.random() * 20;
      if (isWeekend) base *= 0.6;
      insertLog.run(dateStr, h, Math.min(base, 100));
    }
  }

  console.log('Seed complete. Demo admin: ADMIN1001 / Admin@123 | Demo student: student@library.edu / Student@123');
}

module.exports = { db, init };

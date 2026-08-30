# Smart Library Seat Reservation System — Full Web App (Frontend + Backend)

A complete client-server web application, split into a proper backend
(Express REST API + SQLite database + a from-scratch ML demand model) and a
proper frontend (plain HTML/CSS/JS — no build step, no framework required).
Admin and student both talk to the same backend/database, so anything the
admin changes is visible to students immediately.

```
library-web-app/
├── server.js                 # app entry point — wires everything together
├── package.json
├── .env.example               # copy to .env before deploying
├── db/
│   └── init.js                # SQLite schema + demo data seeding
├── services/
│   ├── mlModel.js              # linear regression demand model (from scratch)
│   └── reservationService.js  # booking, cancellation, waitlist, auto-expiry
├── middleware/
│   └── auth.js                 # JWT issuing + verification
├── routes/
│   ├── auth.js, seats.js, reservations.js, analytics.js,
│   └── ml.js, notifications.js, reports.js     # the REST API
└── public/                     # <-- THE FRONTEND
    ├── index.html
    ├── css/style.css
    └── js/
        ├── api.js               # fetch wrapper + auth token handling
        ├── app.js                # screens, navigation, notifications, modals
        ├── student.js            # student dashboard, booking flow, etc.
        └── admin.js               # admin dashboard, seat management, etc.
```

## Run it locally

```bash
npm install
node server.js
```

Open **http://localhost:3000**. The database (`library.db`) is created and
seeded automatically on first run — nothing else to configure.

## Demo accounts

| Role    | Login ID              | Password     |
|---------|------------------------|--------------|
| Admin   | ADMIN1001              | Admin@123    |
| Student | student@library.edu    | Student@123  |

## What's implemented

- Role-based login (separate Admin ID / Student Email portals) with a
  graphics-forward welcome screen (drawn bookshelf silhouette, gradient).
- Library "modes" — Silent Study, Discussion, Smart Digital, General
  Reading, Reference — picked before seeing that zone's seat map.
- Flexible reservations (any date/time/duration within library hours) with
  live conflict detection.
- **Waitlist with automatic promotion** — join a waitlist for a taken seat;
  the moment it's freed (cancelled or expired), the next person in line is
  booked automatically and notified.
- Favorites for one-click quick-booking.
- Check-in / check-out with a configurable grace period and automatic
  expiry of no-shows (swept every minute in the background).
- Notifications, including admin **broadcast announcements** to everyone.
- Admin seat & zone management (add/edit/maintenance/remove), per-seat
  booking history with admin-cancel, CSV report export.
- A real **machine learning model** — linear regression trained by gradient
  descent from scratch (no ML library) on cyclical hour/day-of-week
  features — powering the "best time to book" recommendation and a 7-day
  demand heatmap. Coefficients and training error are shown in the UI, so
  it's a fully explainable model, not a black box.

## Two ways to host this

### Option A — one server hosts both (simplest, recommended)

This is the default setup: `server.js` serves the API *and* the static
files in `public/`. Deploy this one project to any Node host:

**Render / Railway / Fly.io**
1. Push this folder to a Git repo.
2. Create a new "Web Service" pointing at the repo.
3. Build command: `npm install`. Start command: `node server.js` (or `npm start`).
4. Set the `JWT_SECRET` environment variable to a long random string
   (generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
5. Make sure the platform gives you a **persistent disk** for `library.db`
   to survive restarts (Render and Railway both support this; check your
   plan's disk settings). Fly.io volumes work the same way.
6. Deploy. Your app is live at the URL the platform gives you — frontend
   and backend both, from that one URL.

**A plain VPS**
```bash
git clone <your-repo>
cd library-web-app
npm install
cp .env.example .env   # then edit .env with a real JWT_SECRET
npm install -g pm2
pm2 start server.js --name library-app
```
Put Nginx or Caddy in front for HTTPS and a custom domain.

### Option B — frontend and backend hosted separately

If you'd rather host the frontend as a static site (Vercel, Netlify,
GitHub Pages, Cloudflare Pages) and the backend as its own service:

1. Deploy everything **except** the `public/` folder as your backend
   (Render/Railway/Fly.io as above). Note its URL, e.g.
   `https://your-backend.onrender.com`.
2. Deploy the `public/` folder as a static site on Vercel/Netlify/etc.
3. In `public/index.html`, set:
   ```html
   <script>window.API_BASE_URL = 'https://your-backend.onrender.com';</script>
   ```
4. On the backend, set the `CORS_ORIGIN` environment variable to your
   frontend's exact URL (e.g. `https://your-app.vercel.app`) so the browser
   is allowed to call the API cross-origin.

Either option works — Option A is simpler for a first deployment; Option B
is useful if you want the frontend on a CDN or want to scale the two
independently.

## Important before going live

- **Set `JWT_SECRET`.** The default value in the code is a placeholder and
  is not safe to use in production — anyone who reads the source could
  forge login tokens with it.
- **SQLite needs persistent disk.** Serverless platforms (Vercel/Netlify
  *functions*, AWS Lambda) don't give you a writable, persistent
  filesystem between invocations, so `library.db` won't survive. Use a
  platform with persistent disk (Render, Railway, Fly.io, a VPS), or swap
  `better-sqlite3` for a hosted Postgres database if you need serverless.
- **Back up `library.db`** periodically if you're on a VPS without managed
  backups.

## Extending it

The frontend talks to the backend purely through the REST API under
`/api/...` (see the `routes/` folder for the full list of endpoints). That
means you can build an entirely different frontend — a mobile app, a
different admin dashboard — against the same backend without touching any
server-side code.

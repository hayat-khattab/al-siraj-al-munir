# السِّرَاج المُنِير — Al-Siraj Al-Munir

مسابقة يومية في السيرة النبوية: ربيع الأنوار 1448، مع عدّاد ٣٠ دقيقة من لحظة فتح السؤال، وتقييم تلقائي للإجابات.

## Architecture

```
App-Seraj-Monir/
├─ server/   Express + TypeScript + better-sqlite3 + Vitest (API)
└─ web/      Vite + React + TypeScript (RTL Arabic SPA)
```

## Getting started

### 1. Backend

```bash
cd server
npm install
npm run dev        # http://localhost:4000/api  (tsx watch)
```

The server seeds the 30-question calendar automatically on first boot (admin + dev OTP reveal included in development).

### 2. Frontend

```bash
cd web
npm install
npm run dev        # http://localhost:5173  (proxies /api to :4000)
```

### 3. Tests

```bash
cd server
npm test           # Vitest unit/integration suites
npm run build      # typecheck (tsc)
cd ../web
npm run build      # typecheck + production bundle
```

## Deploy to Render (public URL for phones)

The production build serves the frontend **and** the API from a single server, so the app works at one URL over HTTPS — which is what phones require to install it as a PWA.

1. Push this repository to GitHub.
2. On [render.com](https://render.com), click **New → Blueprint**, and select the repository.
3. Render reads `render.yaml` and creates the web service automatically (free plan, persistent disk at `/data` for the SQLite database, auto-deploys on every push).
4. After the first deploy, set these env vars in the service's dashboard:
   - `ADMIN_FULL_NAME` — your real 3-part name (must be 3 words).
   - `ADMIN_WHATSAPP_NUMBER` — your real WhatsApp number (this is your admin login).
   - `JWT_SECRET` — Render generates one automatically; you can rotate it.
   - (Optional) `COMPETITION_START_DATE` — a fixed `YYYY-MM-DD` for day 1; otherwise the calendar rolls from the first boot.
5. Open the service URL (e.g. `https://seraj-al-munir.onrender.com`).

**Delivering OTP codes:** in production `ENABLE_OTP_REVEAL` is off, and `OTP_PROVIDER=console` prints each 6-digit code in the Render **Logs** tab. For a real rollout, plug a WhatsApp/SMS gateway into `server/src/modules/auth/otp.ts` (`getOtpProvider`) and set `OTP_PROVIDER` accordingly.

## Install the app on a phone (PWA)

1. Open the deployed HTTPS URL in the phone's browser (Chrome/Edge on Android, Safari on iPhone).
2. **Android (Chrome):** tap the ⋮ menu → **Add to Home screen** (or **Install app**). An icon appears on the home screen and the app opens full-screen.
3. **iPhone (Safari):** tap **Share** → **Add to Home Screen**.
4. Share the URL with anyone — they install the same way. The service worker caches the shell so the app opens offline; the API needs internet.

The web manifest and install icons live in `web/public/` (regenerate icons with `npm run icons` in `web/`).

## Configuration (`server/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `JWT_SECRET` | dev fallback | Set a strong secret in production |
| `DB_PATH` | `./data/seraj.db` | SQLite file (`:memory:` for tests) |
| `COMPETITION_DAYS` | `30` | Length of the calendar |
| `COMPETITION_START_DATE` | — | First competition date (`YYYY-MM-DD`); defaults to yesterday at first boot |
| `COMPETITION_TIMEZONE` | `Africa/Cairo` | IANA timezone for day boundaries |
| `ANSWER_TIME_MINUTES` | `30` | Per-question answer window |
| `OTP_PROVIDER` | `console` | `console` (logs code), `wa` (WhatsApp) or `null` |
| `ENABLE_OTP_REVEAL` | `true` | Returns `otpReveal` in responses (dev convenience — disable in production) |
| `ADMIN_FULL_NAME` / `ADMIN_WHATSAPP_NUMBER` | — | Bootstrap admin account, created on first boot |

## Rules (as built)

1. A 30-day Hijri calendar; each day's question opens at its day's start (timezone-aware) and closes at end of that day.
2. From the moment a participant opens the question, a **30-minute** countdown runs (server-authoritative, monotonic on the client).
3. One answer per question. Accepted if it matches the reference answer after Arabic normalization (removing tashkeel, tatweel, punctuation and common prefixes like «السيد / أبي / ابن»), plus optional accepted variants.
4. Evaluation is automatic at submission; the admin panel can re-evaluate any answer.

## Development notes

- OTPs are bcrypt-hashed, single-use, expire in 10 minutes, and are rate-limited.
- The correct answer is never exposed by the API until the participant has answered.
- The client timer is anchored to the server's `remainingSeconds` and counts down with `performance.now()`, so device clock changes cannot extend the time.
- In production, serve the built `web/dist` behind the API (or a reverse proxy) so `/api` resolves to the backend.

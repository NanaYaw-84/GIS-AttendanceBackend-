# Attendance API

A Next.js API backing a GPS + face-recognition attendance system for bank
officers. Officers clock in/out either manually or by face match; the
mobile app also consumes officer directory, branch location, and file
upload endpoints.

**API reference for the mobile client:** [docs/API.md](docs/API.md)

## Stack

- **Next.js 16** (App Router, API routes only — no rendered frontend)
- **Supabase** — Postgres (officers/attendance tables) + Storage (face and
  upload images)
- **Face++** — primary face detection/matching provider
- **`face-engine/`** — a standalone Python/Flask + DeepFace service, an
  alternate/self-hosted face matcher (not wired into the Next.js routes by
  default; run separately if needed)

## Getting started

```bash
npm install
cp .env.local.example .env.local   # see Environment variables below
npm run dev
```

Runs on plain HTTP via `next dev`. For local HTTPS (matching how this is
deployed — see `server.mjs`), you need a cert/key pair; see
[TLS certs](#tls-certs) below.

```bash
npm run build   # production build + typecheck
npm run start   # run the production build
npm run lint
node server.mjs # custom HTTPS server (reads private.key/certificate.crt)
```

## Environment variables

None of these are committed — `.env.local` is gitignored. Required to run:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase keys (kept for reference; the API itself no longer uses these for DB access — see below) |
| `SUPABASE_SECRET_KEY` | Service-role/secret key from Supabase dashboard → Project Settings → API. **Required** — every route uses this server-side; RLS denies the anon key by default (see `supabase/migrations/`) |
| `ADMIN_TOKEN_SECRET` | Signs the admin bearer token issued at login for `role: "admin"` officers. Any random 32+ byte string |
| `FACE_API_KEY` / `FACE_API_SECRET` | Face++ credentials |
| `FACESET_OUTER_ID` | Face++ faceset name attendance faces are matched against |
| `FACE_CONFIDENCE_THRESHOLD` | Minimum Face++ match confidence to accept (0–100) |
| `SUPABASE_FACE_BUCKET` | Storage bucket for officer face images (default `face-images`) |
| `SUPABASE_UPLOAD_BUCKET` | Storage bucket for generic uploads (default `uploads`) |

Optional, needed only for specific endpoints:

| Variable | Purpose |
|---|---|
| `MAIL_USER` / `MAIL_PASS` | SMTP auth for `POST /api/notification/send-email` |
| `WIREPICK_CLIENT` / `WIREPICK_PASSWORD` / `WIREPICK_SENDER_ID` | `lib/sendsms.ts` (Wirepick) — not currently wired to any route |

## Database

Schema lives in `supabase.sql` (base tables/policies) and
`supabase/migrations/` (incremental changes — run these in order, in the
Supabase SQL editor, after deploying matching code changes; see comments in
each migration file for sequencing notes).

After running `supabase/migrations/001_security_hardening.sql`, promote at
least one officer to admin so someone can approve registrations and reset
passwords:

```sql
UPDATE public.officers SET role = 'admin' WHERE officer_id = '<officer_id>';
```

## TLS certs

`server.mjs` reads `private.key` and `certificate.crt` from the repo root
for local HTTPS. These are gitignored — provide your own (self-signed is
fine for dev). Don't reuse any cert/key that was previously committed to
this repo's git history; treat it as compromised.

## Project structure

```
app/api/          Route handlers (see docs/API.md for the full list)
lib/               Shared server-side helpers (Supabase clients, auth, logging, mail/SMS)
face-engine/       Standalone Python DeepFace matcher (optional, separate service)
supabase.sql       Base schema
supabase/migrations/  Incremental schema changes
docs/API.md        API reference for frontend/mobile consumers
```

## Known limitations

See the "Known limitations" section at the bottom of
[docs/API.md](docs/API.md) — in short: attendance endpoints trust whatever
`officer_id` the client sends (no per-request auth), `send-sms` isn't
functional yet, and a few endpoints return static placeholder data.

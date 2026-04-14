# SATORI — Samsara Listener

GramJS-based Telegram user-account listener that monitors the **"Manas Express
Samsara Alerts"** group and forwards all SafetyMonitor bot messages into SATORI
as structured situations.

---

## How it works

```
Telegram group → GramJS (MTProto) → parser.ts → /api/samsara/ingest → SATORI pipeline
                                  ↗
                       Supabase Storage (media)
```

1. Connects to Telegram using Rebeca's account credentials via **StringSession**
2. Watches for new messages in the Samsara alerts group
3. Filters to messages from the **SafetyMonitor** bot only
4. Parses 6 alert types into structured data
5. Downloads any video/photo → uploads to `samsara-media` Supabase Storage bucket
6. POSTs to `POST /api/samsara/ingest` which inserts into the `messages` table
7. Rate-limited to **1 request/second** to avoid overloading the SATORI API

---

## Setup

### 1. Get Telegram API credentials

1. Go to [https://my.telegram.org](https://my.telegram.org) and log in with Rebeca's phone number
2. Click **API development tools**
3. Create an app (any name/platform)
4. Copy `App api_id` → `TG_API_ID`
5. Copy `App api_hash` → `TG_API_HASH`

### 2. Generate a session string

Run this **locally** (NOT in Docker):

```bash
cd samsara-listener
npm install
cp .env.example .env
# Fill in TG_API_ID and TG_API_HASH in .env
npx tsx generate-session.ts
```

Follow the prompts: enter the phone number, verification code, and 2FA password
(if enabled). Copy the printed `TG_SESSION_STRING`.

### 3. Create the Supabase storage bucket

In the Supabase dashboard → **Storage**, create a bucket named `samsara-media`.
Set it to **private** (the listener uses the service role key to upload).

### 4. Run the SQL migration

In the Supabase dashboard → **SQL Editor**, run:

```sql
-- from supabase/migrations/20260414_samsara.sql
```

This inserts the Samsara source record into the `sources` table.

### 5. Set SATORI environment variables

In Vercel (or wherever SATORI is deployed), add:

```
SAMSARA_INGEST_SECRET=your_random_secret
```

---

## Deployment on Railway

### Environment variables to set in Railway:

| Variable | Value |
|---|---|
| `TG_API_ID` | From my.telegram.org |
| `TG_API_HASH` | From my.telegram.org |
| `TG_SESSION_STRING` | From generate-session.ts |
| `SUPABASE_URL` | `https://xemjopqbdxgudryiuich.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase dashboard |
| `NEXT_PUBLIC_APP_URL` | Your SATORI Vercel URL |
| `SAMSARA_INGEST_SECRET` | Same secret set in Vercel |

### Deploy steps:

1. Push this `samsara-listener/` directory as a separate Railway service
2. Railway will detect the `Dockerfile` automatically
3. Set all environment variables above
4. The service will start and connect to Telegram immediately

---

## Alert types parsed

| Type | Trigger keywords |
|---|---|
| `speeding` | speed, mph |
| `engine_idle` | engine idle, idling, idle time |
| `driver_distraction` | distraction, phone, drowsy |
| `vehicle_fault` | fault, dtc, check engine |
| `fuel_low` | fuel low, low fuel |
| `harsh_braking` | harsh braking, brake |

---

## Local development

```bash
cd samsara-listener
npm install
cp .env.example .env
# Fill in all values
npm run dev
```

The listener will connect and print received messages to stdout.

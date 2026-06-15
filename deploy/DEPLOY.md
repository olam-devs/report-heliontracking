# Deploy fleet-incident-reporter to report.heliontracking.com

This replaces the old **report-portal** on the VPS with the full **Fleet Incident Reporter** app (cases + fleet tracking + notifications + danger zones).

## Will you lose local data?

**No — if you follow this order:**

| Data | What happens |
|------|----------------|
| **Notifications** (`data/tracking/notifications.json`) | Copied to VPS via data pack — **not** in git, never overwritten by code deploy |
| **Danger zones, coverage, reads** | Same — included in data pack |
| **Daily fleet log** | Choose: import your local copy, or keep VPS `daily-log.json` if it is more up to date |
| **MySQL** (cases, users) | Separate database on VPS — run migrations only, **do not** re-run `seed.sql` on production |
| **Case evidence** (`uploads/`) | Copy separately if you have files locally |

Code deploy (`vps-deploy.cmd`) **never deletes** `C:\helion\fleet-incident-reporter\data\`.

---

## VPS layout

```
C:\helion\_repo\fleet-incident-reporter\   ← git clone (source)
C:\helion\fleet-incident-reporter\         ← live app (PM2)
C:\helion\_import\fleet-data-pack.zip      ← your local data (first time)
C:\helion\_backup\                         ← automatic backups
```

**URL:** https://report.heliontracking.com → nginx → `127.0.0.1:3002`  
**PM2 name:** `helion-fleet-reporter` (replaces `helion-report-portal`)

---

## Step 1 — On your PC: export local data

```powershell
cd "C:\DISK D\fleet-incident-reporter"
powershell -ExecutionPolicy Bypass -File deploy\local-export-data-for-vps.ps1
```

Creates `deploy\out\fleet-data-pack.zip` with notifications, daily-log, geocode cache, danger zones.

Copy that zip to the VPS: `C:\helion\_import\fleet-data-pack.zip`

---

## Step 2 — On VPS: get the code

```cmd
mkdir C:\helion\_repo 2>nul
cd C:\helion\_repo
git clone https://github.com/olam-devs/report-heliontracking.git fleet-incident-reporter
```

Updates later:

```cmd
C:\helion\_repo\fleet-incident-reporter\deploy\vps-git-pull-deploy.cmd
```

**Alternative (no git):** copy `deploy\out\fleet-code.zip` and run `vps-extract-code.cmd`.

---

## Step 2 (legacy zip) — On VPS: get the code

## Step 3 — On VPS: configure `.env`

```cmd
copy C:\helion\_repo\fleet-incident-reporter\deploy\.env.vps.example C:\helion\fleet-incident-reporter\.env
notepad C:\helion\fleet-incident-reporter\.env
```

Set: `DB_*`, `JWT_SECRET`, `CMSV6_USERNAME`, `CMSV6_PASSWORD`.

Create MySQL database if needed:

```cmd
mysql -u root -p < C:\helion\_repo\fleet-incident-reporter\db\schema.sql
```

---

## Step 4 — On VPS: import your local data (first time only)

```powershell
cd C:\helion\_repo\fleet-incident-reporter
powershell -ExecutionPolicy Bypass -File deploy\vps-import-data.ps1
```

- Imports notifications and tracking JSON from your PC.
- To **keep VPS daily-log** instead of local: add `-SkipDailyLog`

---

## Step 5 — On VPS: deploy

```cmd
C:\helion\_repo\fleet-incident-reporter\deploy\vps-deploy.cmd
```

This will:

1. Backup existing `data/` and `.env`
2. Sync code (excluding `data/`, `.env`, `uploads/`)
3. `npm install` + build React UI
4. Run DB migrations (`apply-v6` for tracking page permissions)
5. PM2 start on port **3002**

---

## Step 6 — Nginx for report.heliontracking.com

1. Copy `deploy\nginx-report.heliontracking.com.conf` into your nginx config (or replace the old report-portal server block).
2. Ensure DNS `report.heliontracking.com` points to the VPS.
3. Reload nginx:

```cmd
cd C:\nginx\nginx-1.30.0
nginx -t
nginx -s reload
```

The config proxies HTTPS → `http://127.0.0.1:3002` with long timeouts for CMS analytics.

---

## Verify

```cmd
curl http://127.0.0.1:3002/api/health
pm2 status
pm2 logs helion-fleet-reporter --lines 30
```

Open https://report.heliontracking.com and log in.

---

## Later updates (code only)

```cmd
cd C:\helion\_repo\fleet-incident-reporter
git pull
deploy\vps-deploy.cmd
```

Your notifications and daily-log on the VPS stay intact.

---

## Optional: shared daily-log with old helion layout

If you still use `C:\helion\data\daily-log.json` from middleware, set in `.env`:

```
DAILY_LOG_FILE=C:/helion/data/daily-log.json
GEOCODE_CACHE_FILE=C:/helion/data/geocode-cache.json
```

Tracking notifications always live in `fleet-incident-reporter\data\tracking\`.

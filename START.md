# Fleet Incident Reporter — Quick Start

## Prerequisites
- MySQL running on localhost:3306
- Node.js 18+

## 1. Create the Database

Open MySQL Workbench or any MySQL client and run:

```sql
source C:/DISK D/fleet-incident-reporter/db/schema.sql
source C:/DISK D/fleet-incident-reporter/db/seed.sql
```

Or via command line:
```
mysql -u root -p < db/schema.sql
mysql -u root -p < db/seed.sql
```

## 2. Configure .env (if needed)

Edit `.env` in the project root if your MySQL credentials differ:
```
DB_USER=root
DB_PASS=your_password_here
```

## 3. Start the Backend API

```
npm run dev
```
→ API on http://localhost:3500

## 4. Start the Frontend (new terminal)

**Important:** Install must be run from a path without spaces.

If already installed:
```
cd client
npx vite
```

If node_modules is missing:
```
subst Z: "C:\DISK D"
cd Z:\fleet-incident-reporter\client
npm install
npx vite
```

→ UI on http://localhost:5173

## 5. Login

| Email | Password | Role |
|---|---|---|
| admin@heliontracking.com | admin123 | admin |
| manager@heliontracking.com | admin123 | manager |
| hr@heliontracking.com | admin123 | hr |

## Test Case
INC-001 (Kajembe) is pre-seeded — open it immediately to test the timeline builder and PDF export.

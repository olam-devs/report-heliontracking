# Fleet Incident Reporting System — Project Brief
> Drop this file in your project root. Claude Code will read it before writing any code.

---

## Overview

Build a full-stack **Fleet Incident Reporting System** for **Olam Technologies** to be used internally by fleet managers and administrators. The system allows staff to document vehicle incidents in a structured, step-by-step narrative format with inline evidence attachments, generate formal PDF reports, and manage reusable report templates in both Swahili and English.

This system will be used by the **Helion Tracking** fleet management team and integrated alongside the existing FleetVu/CMSV6 middleware platform.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express.js |
| Database | MySQL |
| Frontend | React (Vite) |
| File Storage | Local disk (`/uploads`) or configurable S3 |
| PDF Generation | `pdfmake` or `puppeteer` |
| Word Export | `docx` npm package |
| Auth | JWT (simple role-based) |
| Process Manager | PM2 |

---

## Database Schema

### `cases`
```sql
id             VARCHAR(20) PRIMARY KEY   -- e.g. INC-001
title          VARCHAR(255)
vehicle_plate  VARCHAR(50)
driver_name    VARCHAR(100)
incident_date  DATE
status         ENUM('open','investigating','closed')
severity       ENUM('low','medium','high')
created_by     INT
created_at     TIMESTAMP
updated_at     TIMESTAMP
```

### `steps`
```sql
id          INT AUTO_INCREMENT PRIMARY KEY
case_id     VARCHAR(20) REFERENCES cases(id)
step_order  INT
type        ENUM('text','evidence')
label       VARCHAR(255)        -- step title / evidence label
content     TEXT                -- narrative text (for type=text)
note        TEXT                -- caption/description (for type=evidence)
created_at  TIMESTAMP
```

### `evidence_files`
```sql
id          INT AUTO_INCREMENT PRIMARY KEY
step_id     INT REFERENCES steps(id)
file_name   VARCHAR(255)
file_path   VARCHAR(500)
file_type   ENUM('image','video','document','audio')
mime_type   VARCHAR(100)
file_size   BIGINT
uploaded_at TIMESTAMP
```

### `templates`
```sql
id          INT AUTO_INCREMENT PRIMARY KEY
name        VARCHAR(255)
language    ENUM('Swahili','English','Both')
sections    JSON               -- array of section name strings
created_by  INT
created_at  TIMESTAMP
```

### `users`
```sql
id          INT AUTO_INCREMENT PRIMARY KEY
name        VARCHAR(100)
email       VARCHAR(150) UNIQUE
password    VARCHAR(255)       -- bcrypt hashed
role        ENUM('reporter','manager','hr','admin')
created_at  TIMESTAMP
```

---

## API Routes

### Cases
```
GET    /api/cases              — list all cases (with filters: status, severity, vehicle)
POST   /api/cases              — create new case
GET    /api/cases/:id          — get case with all steps and evidence
PUT    /api/cases/:id          — update case metadata
DELETE /api/cases/:id          — delete case
```

### Steps (Timeline)
```
GET    /api/cases/:id/steps            — get all steps for a case
POST   /api/cases/:id/steps            — add a step (text or evidence)
PUT    /api/cases/:id/steps/:stepId    — update a step
DELETE /api/cases/:id/steps/:stepId    — delete a step
PATCH  /api/cases/:id/steps/reorder    — reorder steps (drag and drop)
```

### Evidence Files
```
POST   /api/steps/:stepId/evidence     — upload file to a step (multipart/form-data)
DELETE /api/evidence/:fileId           — delete an evidence file
GET    /api/evidence/:fileId/download  — download/stream a file
```

### Templates
```
GET    /api/templates          — list all templates
POST   /api/templates          — create template
PUT    /api/templates/:id      — update template
DELETE /api/templates/:id      — delete template
```

### Export
```
GET    /api/cases/:id/export/pdf       — generate and download PDF report
GET    /api/cases/:id/export/docx      — generate and download Word document
```

### Auth
```
POST   /api/auth/login         — login, returns JWT
POST   /api/auth/logout
GET    /api/auth/me
```

---

## Frontend Pages & Views

### 1. Cases List (`/cases`)
- Table/card list of all incidents
- Columns: Case ID, Title, Vehicle, Driver, Date, Status, Severity
- Filters: status dropdown, severity, date range, search by vehicle or driver
- "New Case" button

### 2. Case Detail (`/cases/:id`)
The most important screen. It has two panels:

**Left / Top — Case Metadata**
- Case ID, title, vehicle plate, driver name, incident date, status, severity
- All fields editable inline

**Main — Incident Timeline Builder**
- Ordered list of steps displayed as a vertical timeline
- Each step is one of two types:

  **Text Step:**
  - Label/title field (e.g. "Tukio la Awali")
  - Large textarea for narrative content
  - Example: "Dereva aliondoka Dar es Salaam tarehe 23 Januari 2026 kuelekea Mtwara..."

  **Evidence Step:**
  - Label field (e.g. "GPS Track – Jan 23")
  - File upload area — accepts: `.jpg .png .gif .mp4 .mov .pdf .doc .docx .xlsx`
  - After upload: show filename, file type icon, file size
  - Caption/note textarea
  - If image: show thumbnail preview inline
  - If video: show video player inline
  - If PDF/doc: show file icon + name + download link

- Between each step, show an "Insert here" button with options: [Add Text Step] [Attach Evidence]
- Drag-and-drop reordering of steps
- Auto-save draft every 30 seconds

**Right Panel — Actions**
- Save Draft
- Change Status (open → investigating → closed)
- Generate PDF Report
- Generate Word Report
- Apply Template (replaces empty steps with template section headings)

### 3. Export Preview (`/cases/:id/preview`)
- Read-only formatted view of the full report
- Styled to match the Kajembe report format (see Reference Report section below)
- Print-friendly CSS
- "Download PDF" and "Download Word" buttons

### 4. Templates (`/templates`)
- List of all templates with language badge and section count
- Create/edit/delete templates
- Each template has: name, language, ordered list of section names
- "Use Template" applies it to a new or existing case

### 5. Auth (`/login`)
- Simple email + password login
- Role-based UI: reporters can create/edit their own cases; managers can see all; HR can approve/sign off

---

## PDF Report Format

The generated PDF must match the style of the official Tanzanian administrative incident report. Structure:

```
[Company Logo / Header]
────────────────────────────────────
TAARIFA RASMI YA TUKIO (INCIDENT REPORT)
[Case Title]
Case ID | Vehicle | Driver | Date
────────────────────────────────────

[For each step in order:]

  If TEXT step:
    [Bold label/heading]
    [Narrative paragraph text]

  If EVIDENCE step:
    ┌─────────────────────────────┐
    │ [USHAHIDI] [Label]          │
    │ [Thumbnail if image]        │
    │ [File name + type if other] │
    │ [Caption/note in italics]   │
    └─────────────────────────────┘

────────────────────────────────────
Signature Block (3 columns):
  Imeandaliwa na:     Imepitiwa na (Meneja):     Imeidhinishwa na (HR):
  _______________     ______________________     _____________________
  Jina/Cheo/Sahihi    Jina/Cheo/Sahihi           Jina/Cheo/Sahihi
  Tarehe: ___/___ /__ Tarehe: ___/___/___        Tarehe: ___/___/___
```

---

## Reference Report — Kajembe Incident

This is the real-world example the system must be able to reproduce. Use this as your test case.

**Case Metadata:**
- Case ID: INC-001
- Title: Matumizi Mabaya ya Gari la Kampuni — Safari Zilizofanywa Nje ya Makusudi ya Biashara
- Vehicle: T.623 EMB
- Driver: Bw. Richard Kajembe
- Date Range: 23/01/2026 – 20/02/2026
- Status: Investigating

**Steps / Timeline:**

1. **[TEXT]** Label: "Utangulizi"
   Content: Taarifa hii imeandaliwa kwa madhumuni ya uchunguzi wa ndani na kumbukumbu za kiutawala kuhusu safari za dereva Bw. Richard Kajembe anae endesha gari namba T.623 EMB, ambapo uchunguzi inaonesha kwamba Bw. Kajembe amefanya safari za ziada Mkoani Mtwara kinyume na maelekezo ya kampuni.

2. **[TEXT]** Label: "Muhtasari wa Safari: Dar es Salaam – Mtwara"
   Content: Safari ya msingi ilikuwa ya kupeleka mzigo kwa mteja Luponde wa Mtwara, ambapo dereva tajwa aliondoka Dar es Salaam tarehe 23 Januari 2026 na kurejea tarehe 20 Februari 2026. Hata hivyo, ndani ya kipindi cha mwezi mmoja, gari lilifanya mizunguko mingi ya ziada (Lilombe, Chingungwe, Kilangala Lindi, Masasi, Msimbati, Tandahimba, n.k.) ambazo hazikuwa sehemu ya ratiba rasmi ya kampuni.

3. **[EVIDENCE]** Label: "Kumbukumbu za GPS/Tracking"
   Note: Jedwali lenye muhtasari wa safari zote, Dispatch notes na delivery records zinaonyesha safari za ziada.

4. **[TEXT]** Label: "Makosa Yanayodaiwa"
   Content:
   - Kufanya safari nje ya maelekezo bila idhini
   - Kutotii ratiba ya dispatch na taratibu za kampuni
   - Kutumia muda mrefu safarini bila maelezo ya kuridhisha
   - Kukosa uwazi kuhusu madhumuni ya safari na matumizi ya gari

5. **[EVIDENCE]** Label: "Maelezo ya Afisa Masoko"
   Note: Ushuhuda wa Bw. Suleiman Juma Ngwale, Afisa Masoko wa Mtwara.

6. **[TEXT]** Label: "Athari kwa Kampuni"
   Content:
   - Kuongezeka kwa gharama za mafuta na uchakavu wa gari
   - Kupungua kwa uwajibikaji na usimamizi wa rasilimali
   - Hatari ya kuchelewesha kazi rasmi na matumizi mabaya ya mali za kampuni

7. **[TEXT]** Label: "Mapendekezo"
   Content:
   - Dereva atoe maelezo ya maandishi kuhusu safari zote zisizoidhinishwa
   - Kampuni ilinganishe maelezo hayo na rekodi za GPS na dispatch
   - Hatua za kinidhamu zichukuliwe endapo maelezo hayatakuwa ya kuridhisha

---

## Built-in Seed Templates

Seed these templates on first run:

**Template 1: Taarifa ya Matumizi Mabaya (Swahili)**
Sections: Utangulizi, Muhtasari wa Safari, Makosa Yanayodaiwa, Ushahidi, Athari kwa Kampuni, Mapendekezo, Tamko la Uhakiki

**Template 2: Vehicle Incident Report (English)**
Sections: Introduction, Incident Summary, Alleged Violations, Evidence, Impact on Company, Recommendations, Verification Statement

**Template 3: Taarifa ya Ajali ya Gari (Swahili)**
Sections: Utangulizi, Maelezo ya Ajali, Hali ya Gari Baada ya Ajali, Ushahidi wa Picha/Video, Ushuhuda wa Mashahidi, Tathmini ya Uharibifu, Hatua Zinazoshauriwa

---

## File Upload Constraints

- Max file size: 50MB per file
- Accepted types: `image/jpeg, image/png, image/gif, video/mp4, video/quicktime, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Storage path: `./uploads/cases/:caseId/:stepId/`
- Return a public URL or signed download URL per file

---

## Environment Variables (`.env`)

```
PORT=3500
DB_HOST=localhost
DB_PORT=3306
DB_NAME=fleet_incidents
DB_USER=root
DB_PASS=
JWT_SECRET=change_this_secret
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=50
```

---

## Project Folder Structure

```
fleet-incident-reporter/
├── BRIEF.md                  ← this file
├── .env
├── .gitignore
├── package.json
├── server.js                 ← Express entry point
├── src/
│   ├── config/
│   │   └── db.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── upload.js         ← multer config
│   ├── routes/
│   │   ├── cases.js
│   │   ├── steps.js
│   │   ├── evidence.js
│   │   ├── templates.js
│   │   ├── export.js
│   │   └── auth.js
│   ├── controllers/          ← one per route file
│   ├── models/               ← MySQL query helpers
│   └── utils/
│       ├── pdfGenerator.js
│       └── docxGenerator.js
├── client/                   ← React Vite frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── CasesList.jsx
│   │   │   ├── CaseDetail.jsx
│   │   │   ├── ExportPreview.jsx
│   │   │   ├── Templates.jsx
│   │   │   └── Login.jsx
│   │   ├── components/
│   │   │   ├── TimelineBuilder.jsx
│   │   │   ├── StepBlock.jsx
│   │   │   ├── EvidenceBlock.jsx
│   │   │   └── SignatureBlock.jsx
│   │   └── api/              ← axios API client
│   └── index.html
├── uploads/                  ← file storage (gitignored)
└── db/
    ├── schema.sql
    └── seed.sql              ← seed templates + test case (Kajembe)
```

---

## Important Notes for Claude Code

1. **Start with `db/schema.sql` and `db/seed.sql`** — get the database right first
2. **The timeline builder is the most critical UI** — steps must be reorderable and evidence must show inline previews
3. **PDF export must embed images** — not just link to them
4. **The Kajembe case should be in the seed data** so it can be tested immediately
5. **Swahili text must render correctly** in PDFs — use a font that supports extended Latin characters
6. **Auto-save** the timeline every 30 seconds using a debounced PUT request
7. **Do not use React Router v6 `<Form>`** — use standard controlled components
8. Run backend on port 3500, frontend dev server on port 5173 with proxy to backend

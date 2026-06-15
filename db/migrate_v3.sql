USE fleet_incidents;

-- Add report-edit permission to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit_reports TINYINT(1) NOT NULL DEFAULT 0;

-- Report templates (admin-managed, for official reports)
CREATE TABLE IF NOT EXISTS report_templates (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  content     LONGTEXT,
  is_default  TINYINT(1) NOT NULL DEFAULT 0,
  created_by  INT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Official case reports (one active report per case, draft/published)
CREATE TABLE IF NOT EXISTS case_reports (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  case_id      VARCHAR(20) NOT NULL,
  template_id  INT,
  content      LONGTEXT,
  status       ENUM('draft','published') NOT NULL DEFAULT 'draft',
  created_by   INT,
  updated_by   INT,
  published_by INT,
  published_at TIMESTAMP NULL DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id)      REFERENCES cases(id)            ON DELETE CASCADE,
  FOREIGN KEY (template_id)  REFERENCES report_templates(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)   REFERENCES users(id)            ON DELETE SET NULL,
  FOREIGN KEY (updated_by)   REFERENCES users(id)            ON DELETE SET NULL,
  FOREIGN KEY (published_by) REFERENCES users(id)            ON DELETE SET NULL
);

-- Seed the default template (matches Kajembe incident report format)
INSERT INTO report_templates (name, description, is_default, created_by, content)
SELECT
  'Official Incident Report (Default)',
  'Standard incident report template — Helion Tracking format',
  1,
  (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
  '<div style="font-family: Arial, sans-serif; max-width: 780px; margin: 0 auto; padding: 20px;">

<div style="text-align: center; margin-bottom: 20px;">
  <h2 style="margin: 0; font-size: 16px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase;">OLAM TECHNOLOGIES — HELION TRACKING</h2>
  <h1 style="margin: 4px 0; font-size: 18px; font-weight: bold; text-transform: uppercase;">TAARIFA RASMI YA TUKIO / INCIDENT REPORT</h1>
  <hr style="border: 2px solid #1a1a2e; margin: 12px 0 0;">
</div>

<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
  <colgroup>
    <col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%">
  </colgroup>
  <tbody>
    <tr>
      <td style="padding: 6px 8px; font-weight: bold; background: #f5f5f5; border: 1px solid #ccc;">Case ID:</td>
      <td style="padding: 6px 8px; border: 1px solid #ccc;">{{case_id}}</td>
      <td style="padding: 6px 8px; font-weight: bold; background: #f5f5f5; border: 1px solid #ccc;">Date:</td>
      <td style="padding: 6px 8px; border: 1px solid #ccc;">{{incident_date}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 8px; font-weight: bold; background: #f5f5f5; border: 1px solid #ccc;">Vehicle:</td>
      <td style="padding: 6px 8px; border: 1px solid #ccc;">{{vehicle_plate}}</td>
      <td style="padding: 6px 8px; font-weight: bold; background: #f5f5f5; border: 1px solid #ccc;">Status:</td>
      <td style="padding: 6px 8px; border: 1px solid #ccc;">{{status}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 8px; font-weight: bold; background: #f5f5f5; border: 1px solid #ccc;">Driver(s):</td>
      <td style="padding: 6px 8px; border: 1px solid #ccc;">{{driver_names}}</td>
      <td style="padding: 6px 8px; font-weight: bold; background: #f5f5f5; border: 1px solid #ccc;">Severity:</td>
      <td style="padding: 6px 8px; border: 1px solid #ccc;">{{severity}}</td>
    </tr>
  </tbody>
</table>

<h3 style="font-size: 14px; font-weight: bold; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px;">1. Maelezo ya Jumla / General Description</h3>
<p style="font-size: 13px; line-height: 1.6; margin: 0 0 16px;">Andika maelezo ya jumla ya tukio hapa / Write a general description of the incident here.</p>

<h3 style="font-size: 14px; font-weight: bold; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px;">2. Matokeo ya Uchunguzi / Investigation Findings</h3>
<p style="font-size: 13px; line-height: 1.6; margin: 0 0 16px;">Andika matokeo ya uchunguzi hapa / Write investigation findings here.</p>

<h3 style="font-size: 14px; font-weight: bold; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px;">3. Hatua Zilizochukuliwa / Action Taken</h3>
<p style="font-size: 13px; line-height: 1.6; margin: 0 0 16px;">Andika hatua zilizochukuliwa hapa / Write action taken here.</p>

<h3 style="font-size: 14px; font-weight: bold; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px;">4. Mapendekezo / Recommendations</h3>
<p style="font-size: 13px; line-height: 1.6; margin: 0 0 16px;">Andika mapendekezo hapa / Write recommendations here.</p>

<h3 style="font-size: 14px; font-weight: bold; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px;">5. Hitimisho / Conclusion</h3>
<p style="font-size: 13px; line-height: 1.6; margin: 0 0 24px;">Andika hitimisho hapa / Write conclusion here.</p>

<hr style="border: 1px solid #ccc; margin: 24px 0 16px;">

<h3 style="font-size: 14px; font-weight: bold; margin: 0 0 16px;">Sahihi / Signatures</h3>

<table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px;">
  <tbody>
    <tr>
      <td style="width: 33%; padding: 8px; text-align: center; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">Imeandaliwa na / Prepared by</td>
      <td style="width: 33%; padding: 8px; text-align: center; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">Imepitiwa na / Reviewed by (Meneja)</td>
      <td style="width: 33%; padding: 8px; text-align: center; border: 1px solid #ccc; font-weight: bold; background: #f5f5f5;">Imeidhinishwa na / Approved by (HR)</td>
    </tr>
    <tr>
      <td style="padding: 32px 8px 8px; text-align: center; border: 1px solid #ccc;">
        <p style="margin: 0 0 4px; border-top: 1px solid #333; padding-top: 4px;">Jina / Cheo / Sahihi</p>
        <p style="margin: 0; font-size: 11px; color: #555;">Tarehe: ___/___/______</p>
      </td>
      <td style="padding: 32px 8px 8px; text-align: center; border: 1px solid #ccc;">
        <p style="margin: 0 0 4px; border-top: 1px solid #333; padding-top: 4px;">Jina / Cheo / Sahihi</p>
        <p style="margin: 0; font-size: 11px; color: #555;">Tarehe: ___/___/______</p>
      </td>
      <td style="padding: 32px 8px 8px; text-align: center; border: 1px solid #ccc;">
        <p style="margin: 0 0 4px; border-top: 1px solid #333; padding-top: 4px;">Jina / Cheo / Sahihi</p>
        <p style="margin: 0; font-size: 11px; color: #555;">Tarehe: ___/___/______</p>
      </td>
    </tr>
  </tbody>
</table>

<p style="font-size: 10px; color: #888; text-align: center; margin-top: 24px;">
  HELION TRACKING — Confidential / Siri · Generated: {{generated_date}}
</p>
</div>'
WHERE NOT EXISTS (SELECT 1 FROM report_templates WHERE is_default = 1);

USE fleet_incidents;

-- New permission columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_create_cases TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit_cases   TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_download_evidence TINYINT(1) NOT NULL DEFAULT 1;

-- Custom roles (admin-managed)
CREATE TABLE IF NOT EXISTS custom_roles (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(50) NOT NULL UNIQUE,
  is_system  TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT IGNORE INTO custom_roles (name, is_system) VALUES
  ('admin', 1), ('manager', 0), ('hr', 0), ('reporter', 0);

-- Update the default template with the exact Kajembe incident report content
UPDATE report_templates SET content = '
<div style="max-width:780px;margin:0 auto;padding:24px;">

<div style="text-align:center;margin-bottom:8px;">
  <p style="margin:0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#555;">OLAM TECHNOLOGIES — HELION TRACKING</p>
  <h2 style="margin:6px 0 4px;font-size:15px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;">TAARIFA RASMI YA TUKIO</h2>
  <h3 style="margin:0 0 4px;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">(INCIDENT REPORT)</h3>
  <hr style="border:none;border-top:2px solid #1a1a2e;margin:10px 0 6px;">
</div>

<h3 style="text-align:center;font-size:13px;font-weight:bold;margin:0 0 20px;text-transform:uppercase;">MATUMIZI MABAYA YA GARI LA KAMPUNI:<br>SAFARI ZILIZOFANYWA NJE YA MAKUSUDI YA BIASHARA YA KAMPUNI</h3>

<p style="font-size:11px;color:#666;margin:0 0 16px;"><strong>Kesi / Case:</strong> {{case_id}} &nbsp;|&nbsp; <strong>Dereva / Driver:</strong> {{driver_names}} &nbsp;|&nbsp; <strong>Gari / Vehicle:</strong> {{vehicle_plate}} &nbsp;|&nbsp; <strong>Tarehe / Date:</strong> {{incident_date}}</p>

<h3 style="font-size:13px;font-weight:bold;margin:18px 0 6px;">1. Utangulizi</h3>
<p style="font-size:12px;line-height:1.7;margin:0 0 12px;">Taarifa hii imeandaliwa kwa madhumuni ya uchunguzi wa ndani na kumbukumbu za kiutawala kuhusu safari za dereva Bw. Richard Kajembe anae endesha gari namba, T.623 EMB, ambapo uchunguzi inaonesha kwamba Bw. Kajembe amefanya safari za ziada Mkoani Mtwara kinyume na maelekezo ya kampuni.</p>

<h3 style="font-size:13px;font-weight:bold;margin:18px 0 6px;">2. Muhtasari wa Safari: Dar es Salaam — Mtwara (23/01/2026 – 20/02/2026)</h3>
<p style="font-size:12px;line-height:1.7;margin:0 0 12px;">Safari ya msingi ilikuwa ya kupeleka mzigo kwa mteja Luponde wa Mtwara, ambapo dereva tajwa aliondoka Dar es Salaam tarehe 23 Januari, 2026 na kurejea tarehe 20 Februari, 2026. Hata hivyo, ndani ya kipindi cha mwezi mmoja, gari lilifanya mizunguko mingi ya ziada (Lilombe, Chingungwe, Kilangala Lindi, Masasi, Msimbati, Tandahimba, n.k.) ambazo hazikuwa sehemu ya ratiba rasmi ya kampuni.</p>

<h3 style="font-size:13px;font-weight:bold;margin:18px 0 6px;">3. Makosa Yanayodaiwa</h3>
<ul style="font-size:12px;line-height:1.8;margin:0 0 12px;padding-left:24px;">
  <li>Kufanya safari nje ya maelekezo bila idhini.</li>
  <li>Kutotii ratiba ya dispatch na taratibu za kampuni.</li>
  <li>Kutumia muda mrefu safarini bila maelezo ya kuridhisha.</li>
  <li>Kukosa uwazi kuhusu madhumuni ya safari na matumizi ya gari.</li>
</ul>

<h3 style="font-size:13px;font-weight:bold;margin:18px 0 6px;">4. Ushahidi</h3>
<ul style="font-size:12px;line-height:1.8;margin:0 0 12px;padding-left:24px;">
  <li>Maelezo ya Afisa Masoko wa Mtwara — Bw. Suleiman Juma Ngwale.</li>
  <li>Kumbukumbu za GPS/tracking — Jedwali lenye muhtasari wa safari zote, Dispatch notes na delivery records.</li>
</ul>

<h3 style="font-size:13px;font-weight:bold;margin:18px 0 6px;">5. Athari kwa Kampuni</h3>
<ul style="font-size:12px;line-height:1.8;margin:0 0 12px;padding-left:24px;">
  <li>Kuongezeka kwa gharama za mafuta na uchakavu wa gari.</li>
  <li>Kupungua kwa uwajibikaji na usimamizi wa rasilimali.</li>
  <li>Hatari ya kuchelewesha kazi rasmi na matumizi mabaya ya mali za kampuni.</li>
</ul>

<h3 style="font-size:13px;font-weight:bold;margin:18px 0 6px;">6. Mapendekezo</h3>
<ul style="font-size:12px;line-height:1.8;margin:0 0 12px;padding-left:24px;">
  <li>Dereva atoe maelezo ya maandishi kuhusu safari zote zisizoidhinishwa.</li>
  <li>Kampuni ilinganishe maelezo hayo na rekodi za GPS na dispatch.</li>
  <li>Hatua za kinidhamu zichukuliwe endapo maelezo hayatakuwa ya kuridhisha.</li>
</ul>

<h3 style="font-size:13px;font-weight:bold;margin:18px 0 6px;">7. Tamko la Uhakiki</h3>
<p style="font-size:12px;line-height:1.7;margin:0 0 20px;">Taarifa hii imeandaliwa kwa uaminifu kulingana na taarifa zilizopatikana hadi sasa. Vielelezo vya ziada vinaweza kuongezwa kadri uchunguzi utakavyoendelea.</p>

<hr style="border:none;border-top:1px solid #ccc;margin:24px 0 16px;">

<table style="width:100%;border-collapse:collapse;font-size:11px;">
  <tbody>
    <tr>
      <td style="width:33%;padding:6px 8px;border:1px solid #ccc;font-weight:bold;background:#f5f5f5;text-align:center;">Imeandaliwa na</td>
      <td style="width:33%;padding:6px 8px;border:1px solid #ccc;font-weight:bold;background:#f5f5f5;text-align:center;">Imepitiwa na (Meneja)</td>
      <td style="width:33%;padding:6px 8px;border:1px solid #ccc;font-weight:bold;background:#f5f5f5;text-align:center;">Imeidhinishwa na (HR/Utawala)</td>
    </tr>
    <tr>
      <td style="padding:28px 8px 8px;border:1px solid #ccc;text-align:center;">
        <div style="border-top:1px solid #333;margin-bottom:4px;"></div>
        <p style="margin:2px 0;font-size:10px;">Jina: ________________________</p>
        <p style="margin:2px 0;font-size:10px;">Cheo/Idara: ___________________</p>
        <p style="margin:2px 0;font-size:10px;">Sahihi: ______________________</p>
        <p style="margin:2px 0;font-size:10px;">Tarehe: ____/____/________</p>
      </td>
      <td style="padding:28px 8px 8px;border:1px solid #ccc;text-align:center;">
        <div style="border-top:1px solid #333;margin-bottom:4px;"></div>
        <p style="margin:2px 0;font-size:10px;">Jina: ________________________</p>
        <p style="margin:2px 0;font-size:10px;">Cheo/Idara: ___________________</p>
        <p style="margin:2px 0;font-size:10px;">Sahihi: ______________________</p>
        <p style="margin:2px 0;font-size:10px;">Tarehe: ____/____/________</p>
      </td>
      <td style="padding:28px 8px 8px;border:1px solid #ccc;text-align:center;">
        <div style="border-top:1px solid #333;margin-bottom:4px;"></div>
        <p style="margin:2px 0;font-size:10px;">Jina: ________________________</p>
        <p style="margin:2px 0;font-size:10px;">Cheo/Idara: ___________________</p>
        <p style="margin:2px 0;font-size:10px;">Sahihi: ______________________</p>
        <p style="margin:2px 0;font-size:10px;">Tarehe: ____/____/________</p>
      </td>
    </tr>
  </tbody>
</table>

<p style="font-size:9px;color:#999;text-align:center;margin-top:16px;">HELION TRACKING — Siri / Confidential &nbsp;·&nbsp; Imetolewa: {{generated_date}}</p>
</div>
', updated_at = NOW()
WHERE is_default = 1;

USE fleet_incidents;

-- Default users (all passwords: admin123)
INSERT IGNORE INTO users (id, name, email, password, role, is_active, can_edit_reports, can_view_tracking, can_create_cases, can_edit_cases, can_download_evidence) VALUES
(1, 'System Admin',  'admin@heliontracking.com',   '$2a$10$1fF5NTOflxbUmDQE3plh1unUs1HRb.DrDGZHpYIwyu3R6PIpI6PsK', 'admin',   1, 1, 1, 1, 1, 1),
(2, 'Fleet Manager', 'manager@heliontracking.com', '$2a$10$1fF5NTOflxbUmDQE3plh1unUs1HRb.DrDGZHpYIwyu3R6PIpI6PsK', 'manager', 1, 1, 1, 1, 1, 1),
(3, 'HR Officer',    'hr@heliontracking.com',      '$2a$10$1fF5NTOflxbUmDQE3plh1unUs1HRb.DrDGZHpYIwyu3R6PIpI6PsK', 'hr',      1, 0, 0, 1, 0, 1);

-- Built-in templates
INSERT IGNORE INTO templates (id, name, language, sections, created_by) VALUES
(1, 'Taarifa ya Matumizi Mabaya', 'Swahili',
  JSON_ARRAY('Utangulizi','Muhtasari wa Safari','Makosa Yanayodaiwa','Ushahidi','Athari kwa Kampuni','Mapendekezo','Tamko la Uhakiki'),
  1),
(2, 'Vehicle Incident Report', 'English',
  JSON_ARRAY('Introduction','Incident Summary','Alleged Violations','Evidence','Impact on Company','Recommendations','Verification Statement'),
  1),
(3, 'Taarifa ya Ajali ya Gari', 'Swahili',
  JSON_ARRAY('Utangulizi','Maelezo ya Ajali','Hali ya Gari Baada ya Ajali','Ushahidi wa Picha/Video','Ushuhuda wa Mashahidi','Tathmini ya Uharibifu','Hatua Zinazoshauriwa'),
  1);

-- Kajembe driver profile
INSERT IGNORE INTO drivers (id, name, vehicle_plate, created_by) VALUES
(1, 'Bw. Richard Kajembe', 'T.623 EMB', 1);

-- Kajembe reference case
INSERT IGNORE INTO cases (id, driver_id, title, vehicle_plate, driver_name, incident_date, status, severity, created_by) VALUES
('INC-001', 1,
 'Matumizi Mabaya ya Gari la Kampuni — Safari Zilizofanywa Nje ya Makusudi ya Biashara',
 'T.623 EMB', 'Bw. Richard Kajembe', '2026-01-23', 'ongoing', 'high', 1);

-- Steps for INC-001
INSERT IGNORE INTO steps (id, case_id, step_order, type, label, content, note) VALUES
(1, 'INC-001', 1, 'text', 'Utangulizi',
 'Taarifa hii imeandaliwa kwa madhumuni ya uchunguzi wa ndani na kumbukumbu za kiutawala kuhusu safari za dereva Bw. Richard Kajembe anae endesha gari namba T.623 EMB, ambapo uchunguzi inaonesha kwamba Bw. Kajembe amefanya safari za ziada Mkoani Mtwara kinyume na maelekezo ya kampuni.',
 NULL),
(2, 'INC-001', 2, 'text', 'Muhtasari wa Safari: Dar es Salaam – Mtwara',
 'Safari ya msingi ilikuwa ya kupeleka mzigo kwa mteja Luponde wa Mtwara, ambapo dereva tajwa aliondoka Dar es Salaam tarehe 23 Januari 2026 na kurejea tarehe 20 Februari 2026. Hata hivyo, ndani ya kipindi cha mwezi mmoja, gari lilifanya mizunguko mingi ya ziada (Lilombe, Chingungwe, Kilangala Lindi, Masasi, Msimbati, Tandahimba, n.k.) ambazo hazikuwa sehemu ya ratiba rasmi ya kampuni.',
 NULL),
(3, 'INC-001', 3, 'evidence', 'Kumbukumbu za GPS/Tracking',
 NULL,
 'Jedwali lenye muhtasari wa safari zote, Dispatch notes na delivery records zinaonyesha safari za ziada.'),
(4, 'INC-001', 4, 'text', 'Makosa Yanayodaiwa',
 'Kufanya safari nje ya maelekezo bila idhini\nKutotii ratiba ya dispatch na taratibu za kampuni\nKutumia muda mrefu safarini bila maelezo ya kuridhisha\nKukosa uwazi kuhusu madhumuni ya safari na matumizi ya gari',
 NULL),
(5, 'INC-001', 5, 'evidence', 'Maelezo ya Afisa Masoko',
 NULL,
 'Ushuhuda wa Bw. Suleiman Juma Ngwale, Afisa Masoko wa Mtwara.'),
(6, 'INC-001', 6, 'text', 'Athari kwa Kampuni',
 'Kuongezeka kwa gharama za mafuta na uchakavu wa gari\nKupungua kwa uwajibikaji na usimamizi wa rasilimali\nHatari ya kuchelewesha kazi rasmi na matumizi mabaya ya mali za kampuni',
 NULL),
(7, 'INC-001', 7, 'text', 'Mapendekezo',
 'Dereva atoe maelezo ya maandishi kuhusu safari zote zisizoidhinishwa\nKampuni ilinganishe maelezo hayo na rekodi za GPS na dispatch\nHatua za kinidhamu zichukuliwe endapo maelezo hayatakuwa ya kuridhisha',
 NULL);

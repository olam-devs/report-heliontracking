/**
 * Apply professional styling to Fleet_Routes_Analytics.xlsx
 * Reads the raw VPS-generated file and produces a polished coloured version.
 *
 * Usage:
 *   node scripts/style_routes_excel.js [input.xlsx] [output.xlsx]
 *
 * Defaults:
 *   input  → Fleet_Routes_Analytics.xlsx  (repo root)
 *   output → Fleet_Routes_Analytics_Styled.xlsx  (repo root)
 */

const ExcelJS = require('exceljs');
const path    = require('path');
let XLSX;
try { XLSX = require('xlsx'); }
catch { XLSX = require('C:/Users/USER/AppData/Roaming/npm/node_modules/xlsx'); }

const srcPath = process.argv[2] ||
  path.join(__dirname, '..', 'Fleet_Routes_Analytics.xlsx');
const outPath = process.argv[3] ||
  path.join(__dirname, '..', 'Fleet_Routes_Analytics_Styled.xlsx');

// ─── COLOUR PALETTE ──────────────────────────────────────────────────────────
const C = {
  navyBg:      'FF1B3A5C',   // dark navy — header background
  navyText:    'FFFFFFFF',   // white — header text
  steelBg:     'FF2E6DA4',   // medium blue — sub-headers / rankings header
  tealBg:      'FF0D7377',   // teal — section title rows
  rowEven:     'FFEEF4FB',   // very light blue — alternating row A
  rowOdd:      'FFFFFFFF',   // white — alternating row B
  greenBg:     'FFD6F5D6',   // light green — Excellent
  greenTxt:    'FF1A5C1A',
  goodBg:      'FFE8F5E9',   // slightly lighter green — Good
  goodTxt:     'FF2E7D32',
  amberBg:     'FFFFF8DC',   // pale amber — Slightly High
  amberTxt:    'FF7A5300',
  redBg:       'FFFFE4E1',   // rose — Above Normal
  redTxt:      'FF8B0000',
  driveBg:     'FFDFF5E0',   // light green tint — driving day cells
  idleBg:      'FFFFF0D0',   // light orange tint — idle day cells
  borderColor: 'FFB8C9D9',   // soft blue-grey border
  fuelRefuel:  'FFFE F3CD',  // light gold — refueled column
  fuelStart:   'FFEBF5EB',
  fuelEnd:     'FFEBF5EB',
  totalFuelBg: 'FFDDEEFF',
};

// ─── STYLE HELPERS ───────────────────────────────────────────────────────────
function headerCell(bg = C.navyBg, fg = C.navyText, size = 11) {
  return {
    font:      { bold: true, color: { argb: fg }, size, name: 'Calibri' },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
    border:    thinBorder(),
  };
}

function dataCell(bg, fg, align = 'center', bold = false) {
  return {
    font:      { color: { argb: fg || 'FF000000' }, size: 10, name: 'Calibri', bold },
    fill:      bg ? { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } } : undefined,
    alignment: { vertical: 'middle', horizontal: align },
    border:    thinBorder(),
  };
}

function thinBorder() {
  const s = { style: 'thin', color: { argb: C.borderColor } };
  return { top: s, left: s, bottom: s, right: s };
}

function ratingStyle(ratingStr) {
  const r = String(ratingStr || '');
  if (r.includes('Too Low'))                                  return dataCell('FFFFF0D0', 'FF8B6914', 'center');       // bad data — amber/gold
  if (r.includes('Below Budget') || r.includes('Excellent')) return dataCell('FFD4EDDA', C.greenTxt, 'center', true); // best — green
  if (r.includes('Within') || r.includes('Good'))            return dataCell(C.goodBg,   C.goodTxt,  'center', true); // on target
  if (r.includes('Slightly'))  return dataCell(C.amberBg, C.amberTxt, 'center');
  if (r.includes('Over Budget') || r.includes('Above') || r.includes('🔴')) return dataCell(C.redBg, C.redTxt, 'center', true);
  return dataCell(null, null, 'center');
}

// Per-route allocation thresholds
const ROUTE_ALLOC = {
  'Mboga → Port (Direct)':     { min: 0.20, max: 0.45, best: 0.30 },
  'Mboga → Port (via Ubungo)': { min: 0.20, max: 0.45, best: 0.30 },
  'Port → Vikindu':            { min: 0.20, max: 0.45, best: 0.35 },
  'Vikindu → Port':            { min: 0.20, max: 0.30, best: 0.25 },
};

// Recompute correct rating from L/km + direction (overrides whatever the source file says)
function computeRating(lkm, direction) {
  const v = Number(lkm);
  if (!isFinite(v) || lkm == null) return '—';
  const a = ROUTE_ALLOC[direction] || { min: 0.20, max: 0.45, best: 0.30 };
  if (v < a.min)        return '⚠️ Too Low — Check Data';
  if (v < a.best)       return '🏆 Below Budget — Best';
  if (v <= a.max)       return '✅ Within Allocation';
  if (v <= a.max + 0.10) return '⚠️ Slightly Over Budget';
  return                        '🔴 Over Budget — Investigate';
}

function lkmStyle(val, direction) {
  const v = Number(val);
  if (!isFinite(v) || val == null) return dataCell(null, null, 'center');
  const alloc = ROUTE_ALLOC[direction] || { min: 0.20, max: 0.45, best: 0.30 };
  if (v < alloc.min)         return dataCell('FFFFF0D0', 'FF8B6914', 'center');        // too low — bad data
  if (v < alloc.best)        return dataCell('FFD4EDDA', C.greenTxt, 'center', true); // below budget — best
  if (v <= alloc.max)        return dataCell(C.goodBg,   C.goodTxt,  'center');        // within allocation
  if (v <= alloc.max + 0.10) return dataCell(C.amberBg,  C.amberTxt, 'center');        // slightly over
  return                            dataCell(C.redBg,    C.redTxt,   'center', true);  // over budget
}

const numFmt2 = '0.00';
const numFmt3 = '0.000';
const dateFmt = 'yyyy-mm-dd';

// ─── APPLY ONE DATA SHEET ────────────────────────────────────────────────────
function styleDataSheet(ws, rows, colDefs) {
  if (!rows.length) return;

  // Header row
  const headers = colDefs.map((c) => c.header);
  const hRow = ws.addRow(headers);
  hRow.height = 32;
  hRow.eachCell((cell, ci) => {
    const def = colDefs[ci - 1];
    Object.assign(cell, headerCell(def?.headerBg || C.navyBg, C.navyText));
  });

  // Medal icons for rank rows (Rank col = colDefs[0] when key is 'Rank')
  const hasRankCol = colDefs[0]?.key === 'Rank';
  const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

  // Data rows
  rows.forEach((row, ri) => {
    const isEven = ri % 2 === 0;
    const rank   = hasRankCol ? Number(row['Rank']) : null;
    const medal  = MEDALS[rank] || null;

    const rowValues = colDefs.map((c) => {
      if (c.key === 'Rank' && medal) return `${medal} ${row[c.key] ?? ''}`;
      // Always recompute Rating from L/km + Direction so source errors don't carry over
      if (c.key === 'Rating') {
        const lkm = row['L/km'] ?? row['Avg L/km'];
        return computeRating(lkm, row['Direction']);
      }
      return row[c.key] ?? null;
    });
    const dr = ws.addRow(rowValues);
    dr.height = medal ? 20 : 18;
    dr.eachCell({ includeEmpty: true }, (cell, ci) => {
      const def  = colDefs[ci - 1];
      const val  = row[def?.key];

      // Top-3 rank rows get a gold background override (rankings sheets only)
      const goldBg = medal === '🥇' ? 'FFFFF8DC' :
                     medal === '🥈' ? 'FFF5F5F5' :
                     medal === '🥉' ? 'FFFFF0E0' : null;

      const rowDir = row['Direction'] || null;

      let style;
      if (def?.type === 'rating') {
        style = ratingStyle(val);
      } else if (def?.type === 'lkm') {
        style = goldBg ? dataCell(goldBg, null, 'center', true) : lkmStyle(val, rowDir);
      } else if (def?.type === 'drive') {
        style = dataCell(goldBg || C.driveBg, null, 'center', !!goldBg);
      } else if (def?.type === 'idle') {
        style = dataCell(goldBg || C.idleBg, null, 'center');
      } else if (def?.type === 'fuel') {
        style = dataCell(goldBg || (isEven ? C.rowEven : null), null, 'right', !!goldBg);
      } else if (def?.type === 'refuel') {
        style = dataCell('FFFFF3CD', 'FF7A5300', 'right');
      } else {
        style = dataCell(goldBg || (isEven ? C.rowEven : null), null, def?.align || 'center', !!goldBg);
      }

      if (style.font)      cell.font      = style.font;
      if (style.fill)      cell.fill      = style.fill;
      if (style.alignment) cell.alignment = style.alignment;
      if (style.border)    cell.border    = style.border;

      if (def?.numFmt && val != null) cell.numFmt = def.numFmt;
    });
  });

  // Column widths
  colDefs.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width || 16;
  });

  // Freeze header
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2' }];

  // Auto-filter
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colDefs.length } };
}

// ─── COLUMN DEFINITIONS ──────────────────────────────────────────────────────
const TRIP_COLS = [
  { key: 'Departure Date',       header: 'Departure',         width: 13, numFmt: dateFmt, align: 'center' },
  { key: 'Arrival Date',         header: 'Arrival',           width: 13, numFmt: dateFmt, align: 'center' },
  { key: 'Direction',            header: 'Direction',         width: 24, align: 'left'   },
  { key: 'Via Ubungo',           header: 'Via Ubungo',        width: 11, align: 'center' },
  { key: 'Vehicle',              header: 'Vehicle',           width: 13, align: 'center' },
  { key: 'Company',              header: 'Company',           width: 18, align: 'left'   },
  { key: 'Start Fuel (L)',       header: 'Start\nFuel (L)',   width: 11, type: 'fuel',   numFmt: numFmt2 },
  { key: 'Refueled (L)',         header: 'Refueled\n(L)',     width: 11, type: 'refuel', numFmt: numFmt2 },
  { key: 'End Fuel (L)',         header: 'End\nFuel (L)',     width: 11, type: 'fuel',   numFmt: numFmt2 },
  { key: 'Total Fuel (L)',       header: 'Total\nFuel (L)',   width: 12, type: 'fuel',   numFmt: numFmt2, headerBg: C.steelBg },
  { key: 'Driving Days',         header: 'Driving\nDays',    width: 11, type: 'drive',  align: 'center' },
  { key: 'Idle Days',            header: 'Idle\nDays',       width: 10, type: 'idle',   align: 'center' },
  { key: 'Idle Fuel (L)',        header: 'Idle\nFuel (L)',    width: 12, type: 'idle',   numFmt: numFmt2 },
  { key: 'Drive Time (hrs)',     header: 'Drive\nTime (h)',   width: 11, type: 'drive',  numFmt: numFmt2 },
  { key: 'Idle Time (hrs)',      header: 'Idle\nTime (h)',    width: 11, type: 'idle',   numFmt: numFmt2 },
  { key: 'Odometer (km)',        header: 'Odom\n(km)',        width: 11, numFmt: numFmt2 },
  { key: 'Road Dist (km)',       header: 'Road\nDist (km)',   width: 11, numFmt: numFmt2 },
  { key: 'L/km',                 header: 'L/km',              width: 12, type: 'lkm',    numFmt: numFmt3, headerBg: C.tealBg },
  { key: 'Rating',               header: 'Rating',            width: 26, type: 'rating'  },
];

const RANK_COLS = [
  { key: 'Rank',                       header: 'Rank',                  width:  7,  align: 'center', headerBg: C.tealBg },
  { key: 'Vehicle',                    header: 'Vehicle',               width: 14,  align: 'center' },
  { key: 'Company',                    header: 'Company',               width: 20,  align: 'left'   },
  { key: 'Direction',                  header: 'Direction',             width: 26,  align: 'left'   },
  { key: 'Trips',                      header: 'Trips',                 width:  8,  align: 'center' },
  { key: 'Total Fuel Used (L)',        header: 'Total\nFuel (L)',       width: 12,  type: 'fuel',   numFmt: numFmt2 },
  { key: 'Total Idle Fuel (L)',        header: 'Total Idle\nFuel (L)',  width: 13,  type: 'idle',   numFmt: numFmt2 },
  { key: 'Avg Driving Days/Trip',      header: 'Avg Drive\nDays/Trip',  width: 13,  type: 'drive',  numFmt: numFmt2 },
  { key: 'Avg Idle Days/Trip',         header: 'Avg Idle\nDays/Trip',   width: 13,  type: 'idle',   numFmt: numFmt2 },
  { key: 'Avg Fuel/Trip (L)',          header: 'Avg Fuel\n/Trip (L)',   width: 13,  type: 'fuel',   numFmt: numFmt2 },
  { key: 'Road Dist/Trip (km)',        header: 'Road Dist\n/Trip (km)', width: 13,  numFmt: numFmt2 },
  { key: 'Total Dist (km)',            header: 'Total\nDist (km)',      width: 12,  numFmt: numFmt2 },
  { key: 'Avg L/km',                   header: 'L/km',                  width: 12,  type: 'lkm',    numFmt: numFmt3, headerBg: C.tealBg },
  { key: 'Avg L/100km',               header: 'L/100km',               width: 13,  type: 'lkm',    numFmt: numFmt2 },
  { key: 'Rating',                     header: 'Rating',                width: 24,  type: 'rating'  },
];

// Rank cols for overall sheet (different key names than per-direction ranking)
const RANK_OVERALL_COLS = RANK_COLS.map((c) => {
  const map = {
    'Total Fuel Used (L)':  'Total Fuel (L)',
    'Total Idle Fuel (L)':  'Total Idle Fuel (L)',
    'Road Dist/Trip (km)':  'Total Road Dist (km)',
    'Total Dist (km)':      'Total Road Dist (km)',
  };
  return { ...c, key: map[c.key] || c.key };
});

// ─── MAIN ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Reading source:', srcPath);
  const srcWb = XLSX.readFile(srcPath);

  function readSheet(name) {
    const ws = srcWb.Sheets[name];
    if (!ws) return null;
    return XLSX.utils.sheet_to_json(ws, { defval: null });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Helion Tracking — Fleet Analytics';
  wb.created  = new Date();
  wb.modified = new Date();

  // Sort trip rows: best L/km first (ascending), nulls last
  function sortByLkm(rows) {
    return [...rows].sort((a, b) => {
      const ka = Number(a['L/km'] ?? a['Avg L/km']) || 999;
      const kb = Number(b['L/km'] ?? b['Avg L/km']) || 999;
      return ka - kb;
    });
  }

  // ── Helper: add styled sheet ───────────────────────────────────────────────
  function addStyledSheet(name, srcName, colDefs, sortFn) {
    let rows = readSheet(srcName);
    if (!rows) { console.warn(`  ⚠️  Sheet not found: ${srcName}`); return; }
    if (sortFn) rows = sortFn(rows);
    const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: 'FF1B3A5C' } } });
    styleDataSheet(ws, rows, colDefs);
    console.log(`  ✅  ${name} (${rows.length} rows)`);
  }

  // ── Overall Rankings ───────────────────────────────────────────────────────
  addStyledSheet('📊 Overall Rankings',       '📊 Overall Rankings',    RANK_OVERALL_COLS);

  // ── By Direction Rankings ──────────────────────────────────────────────────
  addStyledSheet('📊 By Direction Rankings',  '📊 By Direction Rankings', RANK_COLS);

  // ── All Trips ──────────────────────────────────────────────────────────────
  addStyledSheet('🗺 All Trips',              '🗺 All Trips',            TRIP_COLS, sortByLkm);

  // ── Route sheets ──────────────────────────────────────────────────────────
  const routeSheets = [
    ['🚚 Mboga→Port Ubungo', '🚚 Mboga→Port Ubungo'],
    ['🚚 Mboga→Port Direct', '🚚 Mboga→Port Direct'],
    ['⚓ Port→Vikindu',      '⚓ Port→Vikindu'],
    ['⚓ Vikindu→Port',      '⚓ Vikindu→Port'],
  ];
  for (const [name, src] of routeSheets) {
    addStyledSheet(name, src, TRIP_COLS, sortByLkm);
  }

  // ── Per-vehicle sheets ─────────────────────────────────────────────────────
  for (const sn of srcWb.SheetNames) {
    if (!sn.startsWith('🚛')) continue;
    addStyledSheet(sn, sn, TRIP_COLS, sortByLkm);
  }

  // ── Cover / Summary sheet ─────────────────────────────────────────────────
  const cover = wb.addWorksheet('📋 Summary', { properties: { tabColor: { argb: C.tealBg.slice(2) } } });
  cover.views = [{ showGridLines: false }];

  const allRows  = readSheet('🗺 All Trips') || [];
  const rankRows = readSheet('📊 Overall Rankings') || [];

  function coverTitle(row, text, bg, fg = 'FFFFFFFF', size = 14) {
    const r = cover.getRow(row);
    r.height = 28;
    const cell = r.getCell(1);
    cell.value = text;
    cell.font  = { bold: true, size, name: 'Calibri', color: { argb: fg } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cover.mergeCells(row, 1, row, 5);
  }
  function coverKV(row, label, value, valueBg) {
    const r = cover.getRow(row);
    r.height = 20;
    const lc = r.getCell(1);
    lc.value     = label;
    lc.font      = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF1B3A5C' } };
    lc.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 };
    cover.mergeCells(row, 1, row, 3);

    const vc = r.getCell(4);
    vc.value     = value;
    vc.font      = { size: 10, name: 'Calibri', bold: true };
    vc.alignment = { vertical: 'middle', horizontal: 'center' };
    if (valueBg) vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: valueBg } };
    cover.mergeCells(row, 4, row, 5);
  }

  // Tally ratings from All Trips
  const ratingCounts = {};
  let noGpsCount = 0;
  for (const r of allRows) {
    const rt = String(r['Rating'] || '—');
    ratingCounts[rt] = (ratingCounts[rt] || 0) + 1;
    if (!r['Driving Fuel Est (L)']) noGpsCount++;
  }

  const totalFuelAll = allRows.reduce((s, r) => s + (Number(r['Total Fuel (L)']) || 0), 0);
  const idleFuelAll  = allRows.reduce((s, r) => s + (Number(r['Idle Fuel Est (L)']) || 0), 0);
  const driveFuelAll = allRows.reduce((s, r) => s + (Number(r['Driving Fuel Est (L)']) || 0), 0);

  coverTitle(1,  '  HELION TRACKING — FLEET ROUTE ANALYTICS',      C.navyBg,  'FFFFFFFF', 16);
  coverTitle(2,  '  SEMI Fleet  |  Dar es Salaam Routes',           C.steelBg, 'FFFFFFFF', 12);
  cover.getRow(3).height = 8;
  coverTitle(4,  '  TRIP SUMMARY',                                  C.tealBg,  'FFFFFFFF', 11);
  coverKV(5,  'Total Trips Analysed',   allRows.length, 'FFD6E4F7');
  coverKV(6,  'Total Fuel Consumed (L)', Math.round(totalFuelAll).toLocaleString(), 'FFD6E4F7');
  coverKV(7,  'Est. Driving Fuel (L)',   Math.round(driveFuelAll).toLocaleString(), C.driveBg);
  coverKV(8,  'Est. Idle/Loading Fuel (L)', Math.round(idleFuelAll).toLocaleString(), 'FFFFF0D0');
  cover.getRow(9).height = 8;
  coverTitle(10, '  RATING BREAKDOWN',  C.tealBg, 'FFFFFFFF', 11);
  let rRow = 11;
  for (const [rt, cnt] of Object.entries(ratingCounts).sort((a, b) => b[1] - a[1])) {
    let bg = 'FFEEEEEE';
    if (rt.includes('Excellent')) bg = C.greenBg;
    else if (rt.includes('Good')) bg = C.goodBg;
    else if (rt.includes('Slightly')) bg = C.amberBg;
    else if (rt.includes('Above') || rt.includes('🔴')) bg = C.redBg;
    coverKV(rRow++, rt, cnt, bg);
  }
  rRow++;
  coverTitle(rRow++, '  VEHICLE RANKINGS (best → worst L/km driving)', C.tealBg, 'FFFFFFFF', 11);
  for (const r of rankRows.slice(0, 15)) {
    coverKV(rRow++, `${r['Rank']}. ${r['Vehicle']}  (${r['Direction'] || 'All'})`,
      `${r['Avg L/km'] ?? '—'} L/km  |  ${r['Trips']} trips`,
      'FFE8F4FB');
  }

  cover.getColumn(1).width = 38;
  cover.getColumn(2).width = 14;
  cover.getColumn(3).width = 14;
  cover.getColumn(4).width = 20;
  cover.getColumn(5).width = 14;

  // Move cover to front — ExcelJS: reorder by splicing worksheets array
  const idx = wb.worksheets.findIndex((s) => s.name === '📋 Summary');
  if (idx > 0) {
    const [sht] = wb._worksheets.splice(idx + 1, 1); // _worksheets is 1-indexed (index 0 is undefined)
    wb._worksheets.splice(1, 0, sht);
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  await wb.xlsx.writeFile(outPath);
  console.log('\n✅ Saved:', outPath);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

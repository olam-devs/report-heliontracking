/** Client-side fleet row order (mirrors middleware daily-report-sort.js). */

const SPECIAL_DEV_ORDER = {
  14682601265: 0, // T245 EHC
  14682601263: 1, // T406
  14682601266: 2, // T407
  14682601267: 3, // T162
  14682601264: 4, // T972
};

function normPlate(plate) {
  return String(plate || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function isDeviceIdRow(plate, devIdno) {
  const d = String(devIdno || "");
  const p = normPlate(plate);
  return d.startsWith("0134000") || p.startsWith("0134000");
}

const SPECIAL_PLATE_ORDER = [
  (p) => /T245/.test(p),
  (p) => /T406/.test(p),
  (p) => /T407/.test(p),
  (p) => /T162/.test(p),
  (p) => /T972/.test(p),
];

function rowSortKey(plate, devIdno) {
  const p = normPlate(plate);
  const d = String(devIdno || "");
  if (isDeviceIdRow(plate, devIdno)) {
    return { tier: 3, sub: p || d };
  }
  if (SPECIAL_DEV_ORDER[d] != null) {
    return { tier: 2, sub: SPECIAL_DEV_ORDER[d] };
  }
  for (let i = 0; i < SPECIAL_PLATE_ORDER.length; i++) {
    if (SPECIAL_PLATE_ORDER[i](p)) return { tier: 2, sub: i };
  }
  return { tier: 1, sub: p };
}

function compareRowKeys(a, b) {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.tier === 2) return b.sub - a.sub;
  return String(a.sub).localeCompare(String(b.sub), "en", {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortReportRows(rows) {
  const sorted = [...(rows || [])].sort((a, b) => {
    const plateA = a.plate || a.nm || a.devIdno || "";
    const plateB = b.plate || b.nm || b.devIdno || "";
    return compareRowKeys(
      rowSortKey(plateA, a.devIdno),
      rowSortKey(plateB, b.devIdno),
    );
  });
  sorted.forEach((row, i) => {
    row.no = i + 1;
  });
  return sorted;
}

/** Preserve manual fields when live CMS sync rows omit them. */
const MANUAL_ROW_FIELDS = [
  "vehicleComment",
  "driverPhone",
  "driverComment",
  "sim",
  "bundlePurchasedDate",
  "bundleDurationDays",
  "bundleDaysLeft",
  "bundleEndsOn",
  "bundleLow",
];

export function mergeManualRowFields(prevRows, newRows) {
  if (!prevRows?.length || !newRows?.length) return newRows || [];
  const prev = new Map(prevRows.map((r) => [r.devIdno, r]));
  return newRows.map((r) => {
    const p = prev.get(r.devIdno);
    if (!p) return r;
    const out = { ...r };
    for (const f of MANUAL_ROW_FIELDS) {
      const nv = out[f];
      const pv = p[f];
      if ((nv == null || nv === "") && pv != null && pv !== "") {
        out[f] = pv;
      }
    }
    return out;
  });
}

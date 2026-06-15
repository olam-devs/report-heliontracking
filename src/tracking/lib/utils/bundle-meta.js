/** Bundle validity: purchased date + duration (days) → days left until expiry. */

const WARN_DAYS = parseInt(process.env.BUNDLE_WARN_DAYS || '', 10) || 5;

function attachBundleFields(row, meta) {
  if (!row) return row;
  const m = meta || {};
  row.bundlePurchasedDate = m.bundlePurchasedDate || null;
  row.bundleDurationDays =
    m.bundleDurationDays != null && m.bundleDurationDays !== ''
      ? Number(m.bundleDurationDays)
      : null;
  row.sim = m.simPhone || row.sim || '';

  if (!row.bundlePurchasedDate || !row.bundleDurationDays || row.bundleDurationDays <= 0) {
    row.bundleEndsOn = null;
    row.bundleDaysLeft = null;
    row.bundleLow = false;
    return row;
  }

  const start = new Date(`${row.bundlePurchasedDate}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + row.bundleDurationDays);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86400000);
  row.bundleEndsOn = end.toISOString().slice(0, 10);
  row.bundleDaysLeft = daysLeft;
  row.bundleLow = daysLeft <= WARN_DAYS;
  return row;
}

module.exports = { attachBundleFields, WARN_DAYS };

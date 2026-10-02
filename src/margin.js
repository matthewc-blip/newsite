// Margin protection: what MCC keeps (client fee minus notary fee) must be at least
// settings.billing.minMarginPct of the client fee (default 20%). Set it to 0 to turn the check off.
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

function minPct(settings) {
  const p = Number(settings.billing?.minMarginPct ?? 20);
  return Math.min(90, Math.max(0, isNaN(p) ? 20 : p));
}
// What the client pays for the job: the quoted (or estimated) fee plus any checkout add-ons.
const clientPrice = (b) => { const base = num(b.quoted_fee) ?? num(b.est_fee); return base == null ? null : base + (num(b.addons_total) || 0); };

// Margin for a client price and notary fee. Unknown when either side isn't set yet.
function check(price, notaryFee, settings, extras = 0) {
  const min = minPct(settings);
  if (price == null || notaryFee == null || min === 0) return { ok: true, unknown: price == null || notaryFee == null, min };
  const kept = round2(price - notaryFee);
  const pct = price > 0 ? Math.round((kept / price) * 1000) / 10 : (notaryFee > 0 ? -100 : 0);
  const maxNotaryFee = Math.floor(price * (1 - min / 100) * 100) / 100;
  // The client fee box excludes add-ons, so the suggested minimum does too.
  const minClientPrice = Math.max(0, Math.ceil((notaryFee / (1 - min / 100)) * 100) / 100 - (Number(extras) || 0));
  const ok = pct >= min - 1e-9;
  return {
    ok, min, kept, pct, maxNotaryFee, minClientPrice,
    message: ok ? "" : `Margin would be ${pct}% ($${kept.toFixed(2)} on a $${price.toFixed(2)} job), under your ${min}% minimum. Pay the notary at most $${maxNotaryFee.toFixed(2)}, or raise the client fee to at least $${minClientPrice.toFixed(2)}.`,
  };
}

// What the booking's fees would be after an admin edit, and whether that edit breaks the minimum.
function checkPatch(row, body, settings, otherCosts = 0) {
  const touches = body.quoted_fee !== undefined || body.notary_fee !== undefined || body.notary_id !== undefined;
  if (!touches) return { ok: true, unknown: true, min: minPct(settings) };
  const quoted = body.quoted_fee !== undefined ? num(body.quoted_fee) : num(row.quoted_fee);
  const base = quoted ?? num(row.est_fee);
  const price = base == null ? null : base + (num(row.addons_total) || 0);
  let fee = body.notary_fee !== undefined ? num(body.notary_fee) : num(row.notary_fee);
  if (body.notary_id !== undefined && !Number(body.notary_id)) fee = null; // notary removed
  return check(price, fee == null ? null : fee + (Number(otherCosts) || 0), settings, num(row.addons_total) || 0);
}

// Highest fee an automatic offer may carry for this booking (null = no cap, price unknown).
function offerCap(b, settings) {
  const price = clientPrice(b);
  const min = minPct(settings);
  if (price == null || min === 0) return null;
  return Math.floor(price * (1 - min / 100) * 100) / 100;
}

module.exports = { minPct, check, checkPatch, offerCap, clientPrice };

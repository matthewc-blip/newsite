// One-time: the dashboard saves blank prices as null, which would hide the new RON market-rate defaults.
// Fills a blank RON session fee and extra-signer fee once, then leaves them alone so the desk can change or clear them.
const { db, getSettings, saveSettings } = require("./db");
module.exports = async function seedRonPrices() {
  const row = await db.one("SELECT value FROM settings WHERE key = 'config'");
  const stored = (row && row.value) || {};
  if (stored.seeded && stored.seeded.ronPrices) return;
  const s = await getSettings();
  const ron = (s.pricing && s.pricing.ron) || {};
  const next = { seeded: { ...(stored.seeded || {}), ronPrices: true } };
  if (ron.base == null || ron.base === "") next.pricing = { ron: { base: 40, perExtraSigner: ron.perExtraSigner == null || ron.perExtraSigner === "" ? 10 : ron.perExtraSigner } };
  await saveSettings(next);
};

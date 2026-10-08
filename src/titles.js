// Page titles: keep the brand when it fits, shorten it when it doesn't, and never cut a title mid-word.
const fit = (t, brand = "MCC Solutions") => {
  for (const b of [brand, "MCC"]) { const s = `${t} | ${b}`; if (s.length <= 60) return s; }
  return t.length <= 70 ? `${t} | MCC` : t.slice(0, 67).replace(/\s+\S*$/, "") + "...";
};
module.exports = { fit };

// Extra onboarding steps required by specific states. Add a state here as you expand.
// Each rule becomes a checklist item for notaries commissioned in that state.
// `when` limits a rule to notaries with a capability (e.g. RON). `input` asks for a short text answer.
const RULES = {
  NJ: [
    {
      key: "nj_journal",
      label: "NJ notary journal",
      text: "I keep a journal of every notarial act as New Jersey law requires (date and time, type of act, signer name and address, how identity was verified, and fees), and I keep it for 10 years after the last entry.",
    },
    {
      key: "nj_fees",
      label: "NJ notarial fee limits",
      text: "I charge no more than New Jersey's notarial fee limits ($2.50 per act; $15 per real estate transfer; $25 per real estate financing), and I understand MCC's signing-service fee is separate from the notarial fee.",
    },
    {
      key: "nj_ron_notice",
      label: "NJ remote notarization notice",
      when: "ron",
      text: "I notified the New Jersey State Treasurer before performing remote notarizations, named the technology I use, and I keep each session's audio-video recording for 10 years.",
      input: "RON platform you use",
    },
  ],
};

function rulesFor(notary) {
  const states = String(notary.states || "").split(",").filter(Boolean);
  const out = [];
  for (const st of states) {
    for (const r of RULES[st] || []) {
      if (r.when === "ron" && !notary.ron) continue;
      if (r.when === "rin" && !notary.rin) continue;
      out.push({ ...r, state: st });
    }
  }
  return out;
}

module.exports = { RULES, rulesFor };

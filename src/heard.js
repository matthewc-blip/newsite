// "How did you find us?" options, shared by every public form. Ids are stored; labels are for the desk.
const OPTIONS = [
  ["google", "Google search"], ["maps", "Google Maps or Business Profile"], ["ai", "ChatGPT or another AI assistant"],
  ["linkedin", "LinkedIn"], ["social", "Facebook or Instagram"], ["referral", "Friend, family or colleague"],
  ["professional", "Attorney, title company or lender"], ["repeat", "I've used MCC Solutions before"],
  ["mailer", "Postcard or flyer"], ["other", "Other"],
];
const LABELS = Object.fromEntries(OPTIONS);
const clean = (v) => (LABELS[v] ? v : null);
const label = (v) => LABELS[v] || "";
module.exports = { OPTIONS, LABELS, clean, label };

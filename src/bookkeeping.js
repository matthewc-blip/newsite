// Bookkeeping: public intake, starting estimates and the desk pipeline.
// The service is platform-agnostic: the intake asks what the business uses (QuickBooks Online, Xero, Excel or
// Google Sheets, another program, or nothing yet), the estimate adjusts for it, and every lead gets an onboarding
// checklist and an access email written for that platform. Prices live in settings.bookkeeping (Settings → Bookkeeping).
const { db, getSettings } = require("./db");
const mail = require("./email");
const { str, emailOk, phoneOk, rateLimit } = require("./util");

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const TIERS = [
  { id: "t1", label: "Up to 100 transactions a month" },
  { id: "t2", label: "100 to 300 transactions a month" },
  { id: "t3", label: "300 to 600 transactions a month" },
  { id: "t4", label: "Over 600 transactions a month" },
];
const BACKLOG = { none: { label: "Books are current", months: 0 }, "1-3": { label: "1 to 3 months behind", months: 2 }, "4-12": { label: "4 to 12 months behind", months: 8 }, "12+": { label: "More than a year behind", months: null } };
const NEEDS = { monthly: "Monthly bookkeeping", cleanup: "Catch-up and cleanup", yearend: "Year-end package", other: "Something else" };
const ENTITIES = ["Sole proprietor", "LLC", "S corporation", "C corporation", "Partnership", "Nonprofit", "Other"];
const STARTS = { asap: "As soon as possible", month: "Within a month", exploring: "Just exploring" };
const STATUSES = ["new", "contacted", "quoted", "onboarding", "active", "declined", "lost"];

// Each platform: how we work in it, the checklist the desk follows, and the access steps emailed to the client.
const PLATFORMS = {
  qbo: {
    label: "QuickBooks Online",
    short: "We work inside your QuickBooks file as an accountant user. You keep ownership, and you can remove our access any time.",
    steps: [
      ["invite", "Client invited us as an accountant user"],
      ["feeds", "Bank and card feeds connected and reviewed"],
      ["coa", "Chart of accounts reviewed"],
      ["opening", "Opening balances match the last statements"],
      ["lock", "Closing date set for finished months"],
    ],
    access: (email) => [`In QuickBooks Online, click the gear icon, then Manage users, then the Accountants tab, then Invite accountant.`, `Enter ${email} and send the invitation.`, `Menu names change now and then. If you can't find it, reply and we'll walk you through it.`],
  },
  xero: {
    label: "Xero",
    short: "We work inside your Xero organisation as an advisor user. You keep ownership and control who has access.",
    steps: [
      ["invite", "Client invited us to Xero with the Advisor role"],
      ["feeds", "Bank feeds connected and reviewed"],
      ["conversion", "Conversion date and opening balances confirmed"],
      ["coa", "Chart of accounts reviewed"],
      ["lock", "Lock date set for finished months"],
    ],
    access: (email) => [`In Xero, open Settings, then Users, then Invite a user.`, `Enter ${email} and choose the Advisor role.`, `Menu names change now and then. If you can't find it, reply and we'll walk you through it.`],
  },
  sheets: {
    label: "Excel or Google Sheets",
    short: "Keep your spreadsheet. We maintain it, or give you our standard bookkeeping workbook, and you send statements each month. We can move you to accounting software later if you want.",
    steps: [
      ["share", "Workbook shared with edit access (or our standard workbook sent)"],
      ["folder", "Shared folder set up for monthly statements"],
      ["categories", "Category list agreed"],
      ["migrate", "Talked through moving to QuickBooks Online or Xero (optional)"],
    ],
    access: (email) => [`Share your workbook with edit access to ${email}, or reply and ask for our standard bookkeeping workbook.`, `We'll send a shared folder for your monthly bank and card statements.`, `Never email passwords. We only need a share or an invitation.`],
  },
  other: {
    label: "Another program",
    short: "Wave, FreshBooks, Zoho, Sage and others. We review what you use and tell you whether we can work in it or should export to a spreadsheet.",
    steps: [
      ["review", "Program reviewed: accountant access or exports possible"],
      ["decide", "Decided: work in it, export to a workbook, or move to QuickBooks Online or Xero"],
      ["sample", "Sample export or login-free access received"],
    ],
    access: () => [`Reply with the name of the program you use. If it has an accountant or advisor invitation option, we'll tell you where to find it.`, `If it doesn't, an export of the last few months works.`, `Never email passwords.`],
  },
  none: {
    label: "Nothing yet",
    short: "Paper, bank statements or a shoebox. We recommend QuickBooks Online or Xero, set it up, and connect your accounts. The subscription is in your name.",
    steps: [
      ["recommend", "Software recommended (QuickBooks Online or Xero) and client subscribed"],
      ["setup", "Chart of accounts and bank feeds set up"],
      ["opening", "Opening balances collected"],
      ["history", "Statements for the catch-up period received"],
    ],
    access: () => [`We'll recommend QuickBooks Online or Xero for your business and walk you through creating an account in your name.`, `Start gathering the last few bank and credit card statements. That's all we need to begin.`],
  },
};
const COMMON_STEPS = [
  ["engagement", "Engagement letter signed"],
  ["scope", "Scope and monthly price agreed"],
  ["accounts", "Bank, card and loan accounts confirmed"],
  ["statements", "Recent statements received"],
  ["prior", "Prior-year financials or tax return received"],
  ["close", "Monthly close and delivery day agreed"],
];

const DEFAULTS = require("./bookkeeping-defaults");
const cfg = (settings) => ({ ...DEFAULTS, ...(settings.bookkeeping || {}), prices: { ...DEFAULTS.prices, ...(settings.bookkeeping?.prices || {}) }, platforms: { ...DEFAULTS.platforms, ...(settings.bookkeeping?.platforms || {}) } });

function validateSettings(b) {
  if (!b || typeof b !== "object") return "Bookkeeping settings are invalid.";
  const money = (v, label, allowNull) => {
    if (v === null || v === "" || v === undefined) return allowNull ? null : `${label} needs a price.`;
    const n = Number(v);
    return n >= 0 && n <= 20000 ? round2(n) : `${label} must be between $0 and $20,000.`;
  };
  const bad = (r) => typeof r === "string";
  b.open = !!b.open; b.showPrices = !!b.showPrices;
  for (const t of TIERS) {
    const p = (b.prices || {})[t.id];
    if (!p) continue;
    for (const k of ["monthly", "cleanup", "yearEnd"]) { const r = money(p[k], `${t.label} ${k}`, true); if (bad(r)) return r; p[k] = r; }
  }
  for (const k of ["extraAccount", "payroll"]) { if (b[k] === undefined) continue; const r = money(b[k], k, false); if (bad(r)) return r; b[k] = r; }
  if (b.includedAccounts !== undefined) { const n = parseInt(b.includedAccounts, 10); if (!(n >= 1 && n <= 20)) return "Included accounts must be between 1 and 20."; b.includedAccounts = n; }
  for (const id of Object.keys(b.platforms || {})) {
    if (!PLATFORMS[id]) { delete b.platforms[id]; continue; }
    for (const k of ["monthly", "setup"]) { const r = money(b.platforms[id][k], `${PLATFORMS[id].label} ${k}`, false); if (bad(r)) return r; b.platforms[id][k] = r; }
  }
  return null;
}

// Clean and check what the intake form sent. `partial` is used for the live estimate before the form is finished.
function clean(d, partial) {
  d = d || {};
  const data = {
    name: str(d.name, 120), email: str(d.email, 160).toLowerCase(), phone: str(d.phone, 40), company: str(d.company, 160),
    entity: ENTITIES.includes(d.entity) ? d.entity : "", industry: str(d.industry, 120),
    platform: PLATFORMS[d.platform] ? d.platform : "", platformNote: str(d.platformNote, 120),
    tier: TIERS.some((t) => t.id === d.tier) ? d.tier : "", accounts: Math.max(1, Math.min(20, parseInt(d.accounts, 10) || 1)),
    payroll: !!d.payroll, backlog: BACKLOG[d.backlog] ? d.backlog : "none",
    needs: (Array.isArray(d.needs) ? d.needs : []).filter((n) => NEEDS[n]), start: STARTS[d.start] ? d.start : "month",
    taxPreparer: ["yes", "no", "unsure"].includes(d.taxPreparer) ? d.taxPreparer : "", note: str(d.note, 2000),
  };
  const fields = {};
  if (!partial) {
    if (!data.name) fields.name = "Enter your name.";
    if (!emailOk(data.email)) fields.email = "Enter a valid email.";
    if (data.phone && !phoneOk(data.phone)) fields.phone = "Enter a 10-digit phone number, or leave it blank.";
    if (!data.company) fields.company = "Enter your business name.";
    if (!data.platform) fields.platform = "Choose what you use today, or Nothing yet.";
    if (!data.tier) fields.tier = "Choose how many transactions a month.";
    if (!data.needs.length) fields.needs = "Choose at least one thing you need.";
  }
  return { data, fields };
}

// A starting estimate, not a quote: the desk confirms after reviewing the books.
function estimate(settings, d) {
  const b = cfg(settings), p = b.prices[d.tier] || {}, pl = b.platforms[d.platform] || { monthly: 0, setup: 0 };
  const needs = new Set(d.needs || []);
  const out = { monthly: null, cleanup: null, yearEnd: null, setup: 0, custom: false, lines: [] };
  const line = (label, amount, per) => out.lines.push({ label, amount: round2(amount), per });
  if (!d.tier) return out;
  if (needs.has("monthly")) {
    if (p.monthly == null) out.custom = true;
    else {
      let m = p.monthly; line(TIERS.find((t) => t.id === d.tier).label, p.monthly, "month");
      const extra = Math.max(0, (d.accounts || 1) - b.includedAccounts);
      if (extra && b.extraAccount) { m += extra * b.extraAccount; line(`${extra} extra account${extra > 1 ? "s" : ""}`, extra * b.extraAccount, "month"); }
      if (d.payroll && b.payroll) { m += b.payroll; line("Payroll reconciliation", b.payroll, "month"); }
      if (pl.monthly) { m += pl.monthly; line(`Working in ${PLATFORMS[d.platform].label}`, pl.monthly, "month"); }
      out.monthly = round2(m);
    }
  }
  if (needs.has("cleanup") && d.backlog !== "none") {
    const months = BACKLOG[d.backlog]?.months;
    if (months == null || p.cleanup == null) out.custom = true;
    else { out.cleanup = round2(months * p.cleanup); line(`Catch-up, about ${months} months`, out.cleanup, "once"); }
  }
  if (needs.has("yearend")) {
    if (p.yearEnd == null) out.custom = true;
    else { out.yearEnd = round2(p.yearEnd); line("Year-end package", p.yearEnd, "once"); }
  }
  if ((needs.has("monthly") || needs.has("cleanup")) && pl.setup) { out.setup = round2(pl.setup); line("Software setup", pl.setup, "once"); }
  return out;
}

const checklist = (lead) => {
  const pl = PLATFORMS[lead.data.platform] || PLATFORMS.other;
  const items = [...COMMON_STEPS.map(([k, l]) => ({ key: "c." + k, label: l, group: "Every client" })), ...pl.steps.map(([k, l]) => ({ key: "p." + k, label: l, group: pl.label }))];
  if (lead.data.payroll) items.splice(3, 0, { key: "c.payroll", label: "Payroll provider and reports confirmed", group: "Every client" });
  return items.map((i) => ({ ...i, done: !!(lead.done || {})[i.key] }));
};

function publicConfig(settings) {
  const b = cfg(settings);
  return {
    open: !!b.open, showPrices: !!b.showPrices,
    platforms: Object.fromEntries(Object.entries(PLATFORMS).map(([k, v]) => [k, { label: v.label, short: v.short }])),
    prices: b.showPrices ? { tiers: TIERS.map((t) => ({ id: t.id, label: t.label, ...b.prices[t.id] })), includedAccounts: b.includedAccounts, extraAccount: b.extraAccount, payroll: b.payroll, platforms: b.platforms } : null,
  };
}

const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
function describeEstimate(e) {
  if (!e) return "";
  const parts = [];
  if (e.monthly != null) parts.push(`about ${money(e.monthly)} a month`);
  if (e.cleanup != null) parts.push(`catch-up about ${money(e.cleanup)}`);
  if (e.yearEnd != null) parts.push(`year-end about ${money(e.yearEnd)}`);
  if (e.setup) parts.push(`setup ${money(e.setup)}`);
  return (parts.join(", ") || "custom quote") + (e.custom && parts.length ? " (plus a custom quote for the rest)" : "");
}

function leadSummary(d, e) {
  return [
    ["Name", d.name], ["Business", `${d.company}${d.entity ? ` (${d.entity})` : ""}`], ["Email", d.email], ["Phone", d.phone || "—"],
    ["Software", PLATFORMS[d.platform].label + (d.platformNote ? ` (${d.platformNote})` : "")],
    ["Volume", TIERS.find((t) => t.id === d.tier).label], ["Accounts", String(d.accounts)], ["Payroll", d.payroll ? "Yes" : "No"],
    ["Books", BACKLOG[d.backlog].label], ["Needs", d.needs.map((n) => NEEDS[n]).join(", ")], ["Start", STARTS[d.start]],
    ["Has a tax preparer", { yes: "Yes", no: "No", unsure: "Not sure" }[d.taxPreparer] || "—"],
    ["Industry", d.industry || "—"], ["Starting estimate", describeEstimate(e)], ["Notes", d.note || "—"],
  ];
}

function accessEmailParts(lead, settings) {
  const pl = PLATFORMS[lead.data.platform] || PLATFORMS.other;
  const first = (lead.data.name || "").split(/\s+/)[0] || "there";
  const steps = pl.access(settings.business.email);
  return {
    subject: `Getting started with bookkeeping: ${pl.label}`,
    steps,
    text: `Hi ${first},\n\nHere is how to give us access so we can start. You stay in control: you can remove our access at any time.\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nAlso helpful: your last 2 to 3 months of bank and credit card statements, and last year's financial statements or tax return if you have them.\n\nWe will confirm the scope and monthly price in writing before any work starts.\n\n${settings.business.name}\n${settings.business.phone}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#14231d"><p>Hi ${esc(first)},</p><p>Here is how to give us access so we can start. You stay in control: you can remove our access at any time.</p><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><p>Also helpful: your last 2 to 3 months of bank and credit card statements, and last year's financial statements or tax return if you have them.</p><p>We will confirm the scope and monthly price in writing before any work starts.</p><p>${esc(settings.business.name)}<br>${esc(settings.business.phone)}</p></div>`,
  };
}

function register(app, { requireAdmin }) {
  // Live estimate for the form. Only answers when prices are switched on in Settings.
  app.post("/api/bookkeeping/estimate", rateLimit(60, 5 * 60000), async (req, res) => {
    const s = await getSettings();
    if (!cfg(s).showPrices) return res.json({ hidden: true });
    const { data } = clean(req.body, true);
    res.json({ estimate: estimate(s, data) });
  });

  app.post("/api/bookkeeping/intake", rateLimit(5, 10 * 60000), async (req, res) => {
    if (req.body.website) return res.status(400).json({ error: "Rejected" });
    const { data, fields } = clean(req.body);
    if (Object.keys(fields).length) return res.status(400).json({ error: "Check the highlighted fields.", fields });
    const s = await getSettings();
    const est = estimate(s, data);
    const row = await db.one("INSERT INTO bookkeeping_leads(data, estimate) VALUES($1,$2) RETURNING id", [JSON.stringify(data), JSON.stringify(est)]);
    const lines = leadSummary(data, est);
    mail.deskNotice(`Bookkeeping inquiry: ${data.company} (${PLATFORMS[data.platform].label})`, lines.map(([k, v]) => `${k}: ${v}`).join("\n"));
    const shown = cfg(s).showPrices && (est.monthly != null || est.cleanup != null || est.yearEnd != null);
    mail.send({
      to: data.email, subject: "We received your bookkeeping request",
      text: `Hi ${data.name.split(/\s+/)[0]},\n\nThanks for the details about ${data.company}. We'll review them and reply by email with next steps.${shown ? `\n\nYour starting estimate: ${describeEstimate(est)}. This is an estimate, not a quote. We confirm the scope and price in writing after reviewing your books.` : ""}\n\nYou use ${PLATFORMS[data.platform].label}. ${PLATFORMS[data.platform].short}\n\n${s.business.name}\n${s.business.phone}`,
    });
    res.status(201).json({ ok: true, id: row.id });
  });

  const shape = (r) => ({ id: r.id, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, data: r.data, estimate: r.estimate, estimateText: describeEstimate(r.estimate),
    quoteMonthly: r.quote_monthly, notes: r.notes || "", platformLabel: (PLATFORMS[r.data.platform] || {}).label || r.data.platform,
    tierLabel: (TIERS.find((t) => t.id === r.data.tier) || {}).label || "", backlogLabel: (BACKLOG[r.data.backlog] || {}).label || "", needsLabels: (r.data.needs || []).map((n) => NEEDS[n]),
    checklist: checklist({ data: r.data, done: r.done }) });

  app.get("/api/admin/bookkeeping", requireAdmin, async (req, res) => {
    const rows = await db.all("SELECT * FROM bookkeeping_leads ORDER BY (status = 'new') DESC, id DESC LIMIT 300");
    res.json({ leads: rows.map(shape), statuses: STATUSES });
  });

  app.patch("/api/admin/bookkeeping/:id", requireAdmin, async (req, res) => {
    const r = await db.one("SELECT * FROM bookkeeping_leads WHERE id = $1", [Number(req.params.id) || 0]);
    if (!r) return res.status(404).json({ error: "Not found" });
    const b = req.body || {};
    const sets = [], vals = [];
    const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return res.status(400).json({ error: "Invalid status" }); add("status", b.status); }
    if (b.notes !== undefined) add("notes", str(b.notes, 4000));
    if (b.quoteMonthly !== undefined) {
      if (b.quoteMonthly === null || b.quoteMonthly === "") add("quote_monthly", null);
      else { const n = Number(b.quoteMonthly); if (!(n >= 0 && n <= 50000)) return res.status(400).json({ error: "The monthly quote must be between $0 and $50,000." }); add("quote_monthly", round2(n)); }
    }
    if (b.done !== undefined) {
      if (!b.done || typeof b.done !== "object") return res.status(400).json({ error: "Invalid checklist" });
      const valid = new Set(checklist({ data: r.data, done: {} }).map((i) => i.key));
      const done = { ...(r.done || {}) };
      for (const [k, v] of Object.entries(b.done)) if (valid.has(k)) { if (v) done[k] = true; else delete done[k]; }
      add("done", JSON.stringify(done));
    }
    if (!sets.length) return res.json({ ok: true });
    sets.push("updated_at = now()");
    vals.push(r.id);
    await db.run(`UPDATE bookkeeping_leads SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
    res.json({ lead: shape(await db.one("SELECT * FROM bookkeeping_leads WHERE id = $1", [r.id])) });
  });

  // Emails the client the steps for their platform (accountant invite, shared workbook, and so on).
  app.post("/api/admin/bookkeeping/:id/access-email", requireAdmin, async (req, res) => {
    const r = await db.one("SELECT * FROM bookkeeping_leads WHERE id = $1", [Number(req.params.id) || 0]);
    if (!r) return res.status(404).json({ error: "Not found" });
    const s = await getSettings();
    const m = accessEmailParts(r, s);
    await mail.send({ to: r.data.email, subject: m.subject, text: m.text, html: m.html });
    await db.run("UPDATE bookkeeping_leads SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, notes = notes || $2, updated_at = now() WHERE id = $1",
      [r.id, `${r.notes ? "\n" : ""}[${new Date().toISOString().slice(0, 10)}] Sent ${PLATFORMS[r.data.platform].label} access steps.`]);
    res.json({ ok: true, emailEnabled: mail.emailEnabled });
  });
}

module.exports = { register, DEFAULTS, validateSettings, publicConfig, estimate, clean, checklist, PLATFORMS, TIERS, STATUSES, cfg };

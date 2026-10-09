// Billing for bookkeeping clients: one-time invoices (catch-up, setup, year-end) and a monthly retainer,
// sent through the same invoice system as notary work (Stripe if connected, otherwise tracked by hand).
const { db, getSettings } = require("./db");
const { str, emailOk } = require("./util");
const { addDays, dateInTz } = require("./time");
const billing = require("./billing");
const mail = require("./email");

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

function billTo(lead) {
  const email = String(lead.bill_email || lead.data.email || "").trim();
  if (!emailOk(email)) throw fail("Add a valid billing email for this client first.");
  return { name: lead.data.company || lead.data.name, email };
}

// items: [{ name, amount, quantity? }]. periodKey ("2026-10") limits a monthly invoice to once per month.
async function createInvoice(leadId, { items, periodKey = null, periodStart = null, periodEnd = null, dueDays, send = true }) {
  const lead = await db.one("SELECT * FROM bookkeeping_leads WHERE id = $1", [leadId]);
  if (!lead) throw fail("Client not found.", 404);
  const to = billTo(lead);
  const lines = (Array.isArray(items) ? items : []).map((i) => ({ name: str(i.name, 190), quantity: Math.max(1, Math.min(100, Number(i.quantity) || 1)), unit_price: round2(i.amount) }));
  if (!lines.length) throw fail("Add what the invoice is for.");
  for (const l of lines) {
    if (!l.name) throw fail("Every line needs a description.");
    if (!(l.unit_price > 0 && l.unit_price <= 50000)) throw fail("Each amount must be more than $0 and no more than $50,000.");
  }
  const amount = round2(lines.reduce((a, l) => a + l.quantity * l.unit_price, 0));
  const settings = await getSettings();
  const today = dateInTz(new Date(), settings.business.timezone);
  const terms = Number.isFinite(Number(dueDays)) && dueDays !== null && dueDays !== "" ? Math.max(0, Math.min(90, Number(dueDays))) : (lead.bill_terms ?? 10);
  const due = addDays(today, terms);
  let inv;
  try {
    inv = await db.tx(async (t) => {
      const row = await t.one(`INSERT INTO invoices(client_account_id, bill_to_name, bill_to_email, invoice_date, due_date, period_start, period_end, amount, status, provider, kind, bk_lead_id, period_key)
        VALUES(NULL,$1,$2,$3,$4,$5,$6,$7,'draft',$8,'bookkeeping',$9,$10) RETURNING *`,
        [to.name, to.email, today, due, periodStart || today, periodEnd || today, amount, billing.PROVIDER, lead.id, periodKey]);
      const number = billing.invoiceNumber(row.id, today);
      await t.run("UPDATE invoices SET number = $1 WHERE id = $2", [number, row.id]);
      for (const l of lines) await t.run("INSERT INTO invoice_items(invoice_id, name, quantity, unit_price) VALUES($1,$2,$3,$4)", [row.id, l.name, l.quantity, l.unit_price]);
      return { ...row, number };
    });
  } catch (e) {
    if (e.code === "23505") throw fail("This client already has an invoice for that month. Void it first if you need to redo it.", 409);
    throw e;
  }
  if (send) {
    try { return await billing.sendInvoice(inv.id); }
    catch (e) { console.error("Sending bookkeeping invoice failed:", e.message); return billing.getInvoice(inv.id); } // stays a draft with the error shown
  }
  return billing.getInvoice(inv.id);
}

// The retainer for a calendar month, e.g. "2026-10".
async function monthlyInvoice(leadId, periodKey, { send = true } = {}) {
  const lead = await db.one("SELECT * FROM bookkeeping_leads WHERE id = $1", [leadId]);
  if (!lead) throw fail("Client not found.", 404);
  const amt = Number(lead.quote_monthly);
  if (!(amt > 0)) throw fail("Set a monthly quote for this client first.");
  const [y, m] = periodKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, "0");
  return createInvoice(leadId, {
    items: [{ name: `Monthly bookkeeping · ${MONTHS[m - 1]} ${y} · ${lead.data.company || lead.data.name}`, amount: amt }],
    periodKey, periodStart: `${y}-${pad(m)}-01`, periodEnd: `${y}-${pad(m)}-${pad(last)}`, send,
  });
}

// Runs hourly. For each active client with automatic billing on: if this month's bill date has arrived (and is not before automatic
// billing was switched on) and there is no invoice for the month yet, create and send it.
async function runMonthly() {
  const settings = await getSettings();
  const today = dateInTz(new Date(), settings.business.timezone);
  const key = today.slice(0, 7), dom = Number(today.slice(8, 10));
  const leads = await db.all("SELECT id, bill_day, bill_since, data FROM bookkeeping_leads WHERE status = 'active' AND bill_auto AND quote_monthly > 0");
  let n = 0;
  for (const l of leads) {
    const day = Math.max(1, Math.min(28, l.bill_day || 1));
    if (dom < day) continue;
    const billDate = `${key}-${String(day).padStart(2, "0")}`;
    if (l.bill_since && billDate < String(l.bill_since).slice(0, 10)) continue;
    const have = await db.one("SELECT 1 AS x FROM invoices WHERE bk_lead_id = $1 AND period_key = $2 AND status <> 'void'", [l.id, key]);
    if (have) continue;
    try {
      const inv = await monthlyInvoice(l.id, key);
      n++;
      if (inv.error || inv.status === "draft") mail.deskNotice(`Monthly bookkeeping invoice needs a look: ${l.data.company}`, `Invoice ${inv.number} for ${l.data.company} was created but not sent: ${inv.error || "it is still a draft"}. Open Billing to send it.`);
      else mail.deskNotice(`Monthly bookkeeping invoice sent: ${l.data.company}`, `Invoice ${inv.number} for $${inv.amount.toFixed(2)} went to ${inv.bill_to_email}.`);
    } catch (e) { console.error(`Monthly bookkeeping invoice for lead ${l.id} failed:`, e.message); }
  }
  return n;
}
function startJob() {
  setTimeout(() => runMonthly().catch((e) => console.error("Monthly bookkeeping billing:", e.message)), 3 * 60 * 1000).unref();
  setInterval(() => runMonthly().catch((e) => console.error("Monthly bookkeeping billing:", e.message)), 60 * 60 * 1000).unref();
}

function register(app, { requireAdmin }) {
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.status ? e.message : "Something went wrong." }); }
  };
  const id = (req) => Number(req.params.id) || 0;

  // One-time or custom invoice: { items: [{ name, amount }], dueDays?, send? }
  app.post("/api/admin/bookkeeping/:id/invoice", requireAdmin, wrap(async (req) => ({
    invoice: await createInvoice(id(req), { items: req.body.items, dueDays: req.body.dueDays, send: req.body.send !== false }),
  })));

  // This month's retainer (or { month: "2026-10" }), straight from the monthly quote.
  app.post("/api/admin/bookkeeping/:id/invoice-monthly", requireAdmin, wrap(async (req) => {
    const settings = await getSettings();
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.body.month || "")) ? req.body.month : dateInTz(new Date(), settings.business.timezone).slice(0, 7);
    return { invoice: await monthlyInvoice(id(req), month, { send: req.body.send !== false }) };
  }));

  // Billing settings for one client.
  app.patch("/api/admin/bookkeeping/:id/billing", requireAdmin, wrap(async (req) => {
    const lead = await db.one("SELECT * FROM bookkeeping_leads WHERE id = $1", [id(req)]);
    if (!lead) throw fail("Client not found.", 404);
    const b = req.body || {};
    const sets = [], vals = [];
    const add = (c, v) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
    if (b.billEmail !== undefined) {
      const e = str(b.billEmail, 160).toLowerCase();
      if (e && !emailOk(e)) throw fail("That billing email isn't valid.");
      add("bill_email", e || null);
    }
    if (b.billDay !== undefined) { const d = parseInt(b.billDay, 10); if (!(d >= 1 && d <= 28)) throw fail("Pick a day from 1 to 28."); add("bill_day", d); }
    if (b.billTerms !== undefined) { const d = parseInt(b.billTerms, 10); if (!(d >= 0 && d <= 90)) throw fail("Days to pay must be 0 to 90."); add("bill_terms", d); }
    if (b.billAuto !== undefined) {
      const on = !!b.billAuto;
      if (on && !(Number(lead.quote_monthly) > 0)) throw fail("Set and save a monthly quote before turning on automatic billing.");
      add("bill_auto", on);
      if (on && !lead.bill_auto) add("bill_since", dateInTz(new Date(), (await getSettings()).business.timezone));
    }
    if (!sets.length) return { ok: true };
    vals.push(lead.id);
    await db.run(`UPDATE bookkeeping_leads SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}`, vals);
    return { ok: true };
  }));
}

module.exports = { register, startJob, runMonthly, createInvoice, monthlyInvoice };

// Client billing: monthly invoices per client account, single invoices for individuals,
// sent and collected through Stripe Invoicing (or tracked manually if Stripe isn't connected).
const { db, getSettings, logEvent } = require("./db");
const { str, emailOk } = require("./util");
const { addDays, dateInTz } = require("./time");
const stripeB = require("./stripe-billing");
const PROVIDER = stripeB.enabled ? "stripe" : "manual";
const mail = require("./email");

const TRANSFER = new Set(["Purchase · seller"]);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const clientPrice = (b) => (b.quoted_fee ?? b.est_fee ?? null);

// State-capped notarial portion (e.g. NJ: $25 per financing, $15 per transfer). Desk can override per booking.
function notarialFor(b, settings) {
  if (b.notarial_fee != null) return Number(b.notarial_fee);
  const caps = settings.billing?.defaultNotarialFees?.[b.state];
  if (!caps || b.service !== "mobile" || !b.is_loan) return null;
  return TRANSFER.has(b.category) ? caps.transfer ?? null : caps.financing ?? null;
}

function lineItemsFor(b, settings) {
  const price = clientPrice(b);
  if (price == null) return null;
  const tz = settings.business.timezone;
  const day = new Date(b.start_utc).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });
  const who = b.signer_names || b.contact_name || "";
  const desc = [b.ref, b.file_number ? `File ${b.file_number}` : "", b.category, day, who].filter(Boolean).join(" · ");
  const notarial = Math.min(notarialFor(b, settings) ?? 0, price);
  const items = [];
  if (price - notarial > 0) items.push({ booking_id: b.id, name: `Signing service · ${desc}`.slice(0, 195), quantity: 1, unit_price: round2(price - notarial) });
  if (notarial > 0) items.push({ booking_id: b.id, name: `Notarial fee (${b.state} limit) · ${b.ref}`.slice(0, 195), quantity: 1, unit_price: round2(notarial) });
  return items;
}

async function unbilled() {
  const rows = await db.all(`SELECT b.*, a.company FROM bookings b LEFT JOIN client_accounts a ON a.id = b.client_account_id
    WHERE b.status = 'completed' AND b.invoice_id IS NULL ORDER BY b.start_utc`);
  return rows;
}

function invoiceNumber(id, date) { return `MCC-${date.replace(/-/g, "").slice(0, 6)}-${String(id).padStart(4, "0")}`; }

async function billTo(accountId, booking) {
  if (accountId) {
    const a = await db.one("SELECT * FROM client_accounts WHERE id = $1", [accountId]);
    if (!a) throw Object.assign(new Error("Client account not found."), { status: 404 });
    let email = a.billing_email;
    if (!email) email = (await db.one("SELECT email FROM client_users WHERE account_id = $1 AND active = 1 ORDER BY id LIMIT 1", [a.id]))?.email;
    if (!email || !emailOk(email)) throw Object.assign(new Error(`Add a billing email for ${a.company} first (Clients tab).`), { status: 400 });
    return { account: a, name: a.company, email, termsDays: a.payment_terms_days ?? null };
  }
  return { account: null, name: booking.contact_name, email: booking.contact_email, termsDays: null };
}

// Create an invoice for (a) every completed, unbilled job of a client account up to `through`, or (b) one booking.
async function createInvoice({ accountId, bookingId, through, send = true }) {
  const settings = await getSettings();
  const tz = settings.business.timezone;
  const today = dateInTz(new Date(), tz);
  let jobs;
  if (bookingId) {
    const b = await db.one("SELECT * FROM bookings WHERE id = $1", [bookingId]);
    if (!b) throw Object.assign(new Error("Booking not found."), { status: 404 });
    if (b.invoice_id) throw Object.assign(new Error("This booking is already on an invoice."), { status: 400 });
    if (b.status === "canceled") throw Object.assign(new Error("Canceled bookings can't be invoiced."), { status: 400 });
    jobs = [b];
    accountId = b.client_account_id || null;
  } else {
    const end = through && /^\d{4}-\d{2}-\d{2}$/.test(through) ? through : today;
    jobs = await db.all(`SELECT * FROM bookings WHERE client_account_id = $1 AND status = 'completed' AND invoice_id IS NULL
      AND start_utc < ($2::date + 1)::timestamptz ORDER BY start_utc`, [accountId, end]);
    if (!jobs.length) throw Object.assign(new Error("No completed, unbilled jobs for this client."), { status: 400 });
  }
  const missing = jobs.filter((b) => clientPrice(b) == null);
  if (missing.length) throw Object.assign(new Error(`Set a client fee first on: ${missing.map((b) => b.ref).join(", ")}.`), { status: 400 });

  const to = await billTo(accountId, jobs[0]);
  const items = jobs.flatMap((b) => lineItemsFor(b, settings));
  const amount = round2(items.reduce((a, i) => a + i.quantity * i.unit_price, 0));
  const terms = bookingId && !to.account ? settings.billing.individualTermsDays ?? 0 : to.termsDays ?? settings.billing.termsDays ?? 30;
  const due = addDays(today, terms);
  const dates = jobs.map((b) => dateInTz(new Date(b.start_utc), tz)).sort();

  const inv = await db.tx(async (t) => {
    const row = await t.one(`INSERT INTO invoices(client_account_id, bill_to_name, bill_to_email, invoice_date, due_date, period_start, period_end, amount, status, provider)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9) RETURNING *`,
      [to.account?.id || null, to.name, to.email, today, due, dates[0], dates[dates.length - 1], amount, PROVIDER]);
    const number = invoiceNumber(row.id, today);
    await t.run("UPDATE invoices SET number = $1 WHERE id = $2", [number, row.id]);
    for (const i of items) await t.run("INSERT INTO invoice_items(invoice_id, booking_id, name, quantity, unit_price) VALUES($1,$2,$3,$4,$5)", [row.id, i.booking_id, i.name, i.quantity, i.unit_price]);
    const claimed = await t.all("UPDATE bookings SET invoice_id = $1 WHERE id = ANY($2) AND invoice_id IS NULL RETURNING id", [row.id, jobs.map((b) => b.id)]);
    if (claimed.length !== jobs.length) throw Object.assign(new Error("Some of these jobs were just invoiced by someone else. Refresh and try again."), { status: 409 });
    for (const b of jobs) await logEvent(b.id, "desk", `Billed on invoice ${number}`, t);
    return { ...row, number };
  });
  if (send) {
    try { return await sendInvoice(inv.id); }
    catch (e) { console.error("Sending invoice failed:", e.message); return getInvoice(inv.id); } // stays a draft with the error shown
  }
  return getInvoice(inv.id);
}

// Send a draft through Stripe (creates the Stripe customer the first time); or mark a manual invoice open.
async function sendInvoice(id) {
  const settings = await getSettings();
  const inv = await db.one("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!inv) throw Object.assign(new Error("Invoice not found."), { status: 404 });
  if (inv.status !== "draft") throw Object.assign(new Error("Only draft invoices can be sent."), { status: 400 });
  if (PROVIDER === "manual") {
    await db.run("UPDATE invoices SET status = 'open', provider = 'manual', sent_at = now(), error = NULL WHERE id = $1", [id]);
    return getInvoice(id);
  }
  if (PROVIDER === "stripe") {
    try {
      const a = inv.client_account_id ? await db.one("SELECT * FROM client_accounts WHERE id = $1", [inv.client_account_id]) : null;
      const items = await db.all("SELECT booking_id, name, quantity, unit_price FROM invoice_items WHERE invoice_id = $1 ORDER BY id", [id]);
      const r = await stripeB.createAndSend({ inv, items, customerId: a?.stripe_customer_id || null, dueDate: inv.due_date, settings });
      if (a && !a.stripe_customer_id) await db.run("UPDATE client_accounts SET stripe_customer_id = $1 WHERE id = $2", [r.customerId, a.id]);
      await db.run(`UPDATE invoices SET stripe_invoice_id = $1, payment_url = $2, status = $3, provider = 'stripe', sent_at = now(), error = NULL, last_synced_at = now() WHERE id = $4`,
        [r.id, r.url, r.status === "draft" ? "open" : r.status, id]);
      const cc = (settings.billing?.ccEmails || []).filter(emailOk);
      for (const addr of cc) mail.send({ to: addr, subject: `Invoice ${inv.number} sent · ${inv.bill_to_name}`, text: `Invoice ${inv.number} for $${inv.amount.toFixed(2)} was sent to ${inv.bill_to_email}.\n${r.url || ""}` });
    } catch (e) {
      await db.run("UPDATE invoices SET error = $1 WHERE id = $2", [`Stripe: ${String(e.message).slice(0, 480)}`, id]);
      throw Object.assign(new Error(`Stripe: ${e.message}`), { status: 502 });
    }
    return getInvoice(id);
  }
  return getInvoice(id);
}

async function syncInvoice(id) {
  const inv = await db.one("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!inv) return null;
  let status, url;
  if (inv.provider === "stripe" && inv.stripe_invoice_id && stripeB.enabled) {
    ({ status, url } = await stripeB.get(inv.stripe_invoice_id));
  } else return getInvoice(id);
  return applyStatus(inv, status === "draft" ? "open" : status, url);
}

async function applyStatus(inv, status, url) {
  await db.run(`UPDATE invoices SET status = $1, payment_url = coalesce($2, payment_url), last_synced_at = now(),
      paid_at = CASE WHEN $1 = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END WHERE id = $3`, [status, url || null, inv.id]);
  if (status === "paid" && inv.status !== "paid") mail.deskNotice(`Paid: invoice ${inv.number} · ${inv.bill_to_name}`, `${inv.bill_to_name} paid ${inv.number} ($${inv.amount.toFixed(2)}) through Stripe.`);
  if (status === "void" && inv.status !== "void") {
    const freed = await db.all("UPDATE bookings SET invoice_id = NULL WHERE invoice_id = $1 RETURNING id", [inv.id]);
    for (const b of freed) await logEvent(b.id, "system", `Invoice ${inv.number} voided; job is unbilled again`);
  }
  return getInvoice(inv.id);
}

// Stripe webhook: invoice.paid / invoice.voided / invoice.marked_uncollectible / invoice.payment_failed
async function handleStripeWebhook(req, res) {
  let event;
  try { event = stripeB.verifyEvent(req.body, req.get("Stripe-Signature")); }
  catch (e) { return res.status(400).send(`Webhook error: ${e.message}`); }
  try {
    const obj = event.data && event.data.object;
    if (obj && obj.object === "checkout.session" && event.type === "checkout.session.completed" && obj.mode === "setup") {
      await require("./payments").recordFromSession(obj.id);
    }
    if (obj && obj.object === "invoice") {
      const inv = await db.one("SELECT * FROM invoices WHERE stripe_invoice_id = $1 OR id = $2", [obj.id, Number(obj.metadata?.mcc_invoice_id) || 0]);
      if (inv && inv.provider === "stripe") {
        if (event.type === "invoice.payment_failed") mail.deskNotice(`Payment failed: invoice ${inv.number}`, `A payment attempt on ${inv.number} (${inv.bill_to_name}) failed in Stripe.`);
        else await applyStatus(inv, stripeB.normalizeStatus(obj.status), obj.hosted_invoice_url);
      }
    }
    res.json({ received: true });
  } catch (e) { console.error("Stripe webhook failed:", e); res.status(500).json({ error: "failed" }); }
}

async function syncOpen() {
  if (PROVIDER === "manual") return 0;
  const open = await db.all("SELECT id FROM invoices WHERE provider = 'stripe' AND status = 'open'");
  for (const r of open) await syncInvoice(r.id).catch((e) => console.error(`Payment sync failed for invoice ${r.id}:`, e.message));
  return open.length;
}
function startSyncJob() {
  setTimeout(() => syncOpen().catch(() => {}), 90 * 1000).unref();
  setInterval(() => syncOpen().catch(() => {}), 30 * 60 * 1000).unref();
}

async function voidInvoice(id) {
  const inv = await db.one("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!inv) throw Object.assign(new Error("Invoice not found."), { status: 404 });
  if (inv.status === "paid") throw Object.assign(new Error(`Paid invoices can't be voided here. Refund in ${["stripe", "card"].includes(inv.provider) ? "Stripe" : "your bank"}.`), { status: 400 });
  if (inv.provider === "stripe" && inv.stripe_invoice_id && inv.status !== "void") {
    try { await stripeB.voidInvoice(inv.stripe_invoice_id); } catch (e) { throw Object.assign(new Error(`Stripe: ${e.message}`), { status: 502 }); }
  }
  await db.run("UPDATE invoices SET status = 'void' WHERE id = $1", [id]);
  const freed = await db.all("UPDATE bookings SET invoice_id = NULL WHERE invoice_id = $1 RETURNING id", [id]);
  for (const b of freed) await logEvent(b.id, "desk", `Invoice ${inv.number} voided; job is unbilled again`);
  return getInvoice(id);
}

async function markPaid(id) {
  await db.run("UPDATE invoices SET status = 'paid', paid_at = now() WHERE id = $1 AND status IN ('open','draft')", [id]);
  return getInvoice(id);
}

async function getInvoice(id) {
  const inv = await db.one("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!inv) return null;
  inv.items = await db.all("SELECT ii.*, b.ref FROM invoice_items ii LEFT JOIN bookings b ON b.id = ii.booking_id WHERE ii.invoice_id = $1 ORDER BY ii.id", [id]);
  return inv;
}

function invoiceHtml(inv, settings) {
  const money = (n) => "$" + Number(n).toFixed(2);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(inv.number)}</title>
  <style>body{font-family:Arial,sans-serif;color:#14231d;max-width:780px;margin:40px auto;padding:0 20px}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}
  th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #d9e0db;font-size:14px;vertical-align:top}th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6a7a72}
  td.n,th.n{text-align:right;white-space:nowrap}.top{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}.muted{color:#6a7a72;font-size:13px}.tot{font-size:20px;font-weight:700}
  .badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;background:#f3e7cf;color:#6e4b10;text-transform:uppercase;letter-spacing:.06em}</style></head><body>
  <div class="top"><div><h1>${esc(settings.business.name)}</h1><p class="muted">${esc(settings.business.phone)} · ${esc(settings.business.email)}</p></div>
  <div style="text-align:right"><p class="badge">${esc(inv.status)}</p><p><b>Invoice ${esc(inv.number)}</b><br><span class="muted">Issued ${esc(inv.invoice_date)} · Due ${esc(inv.due_date)}</span></p></div></div>
  <p><span class="muted">Bill to</span><br><b>${esc(inv.bill_to_name)}</b><br>${esc(inv.bill_to_email)}</p>
  ${inv.period_start ? `<p class="muted">Service period ${esc(inv.period_start)} to ${esc(inv.period_end)}</p>` : ""}
  <table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Amount</th></tr></thead><tbody>
  ${inv.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="n">${i.quantity}</td><td class="n">${money(i.quantity * i.unit_price)}</td></tr>`).join("")}
  <tr><td></td><td class="n"><b>Total</b></td><td class="n tot">${money(inv.amount)}</td></tr></tbody></table>
  ${inv.payment_url ? `<p style="margin-top:24px"><a href="${esc(inv.payment_url)}">Pay this invoice online</a></p>` : ""}
  <p class="muted" style="margin-top:24px">Notarial fees are charged within state limits and listed separately from signing-service fees.</p></body></html>`;
}

function register(app, { requireAdmin, requireClient, loadClient }) {
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.status ? e.message : "Something went wrong." }); }
  };

  app.get("/api/admin/billing", requireAdmin, wrap(async () => {
    const settings = await getSettings();
    const rows = await unbilled();
    const groups = {};
    const individuals = [];
    for (const b of rows) {
      const price = clientPrice(b);
      const j = { id: b.id, ref: b.ref, category: b.category, start_utc: b.start_utc, file_number: b.file_number, signer_names: b.signer_names, contact_name: b.contact_name,
        price, notarial: price == null ? null : Math.min(notarialFor(b, settings) ?? 0, price), state: b.state };
      if (b.client_account_id) (groups[b.client_account_id] ||= { account_id: b.client_account_id, company: b.company, jobs: [] }).jobs.push(j);
      else individuals.push(j);
    }
    const invoices = await db.all("SELECT * FROM invoices ORDER BY id DESC LIMIT 200");
    const totals = await db.one(`SELECT coalesce(sum(amount) FILTER (WHERE status = 'open'),0)::float AS outstanding,
      coalesce(sum(amount) FILTER (WHERE status = 'open' AND due_date < current_date),0)::float AS overdue,
      coalesce(sum(amount) FILTER (WHERE status = 'paid' AND paid_at > now() - interval '30 days'),0)::float AS paid30 FROM invoices`);
    return { provider: PROVIDER, stripe: { enabled: stripeB.enabled, test: (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_"), webhook: stripeB.webhookConfigured }, clients: Object.values(groups), individuals, invoices, totals };
  }));
  app.post("/api/admin/billing/invoices", requireAdmin, wrap(async (req) => ({
    invoice: await createInvoice({ accountId: Number(req.body.accountId) || null, bookingId: Number(req.body.bookingId) || null, through: str(req.body.through, 10), send: req.body.send !== false }),
  })));
  app.get("/api/admin/billing/invoices/:id", requireAdmin, wrap(async (req) => ({ invoice: await getInvoice(Number(req.params.id) || 0) })));
  app.post("/api/admin/billing/invoices/:id/send", requireAdmin, wrap(async (req) => ({ invoice: await sendInvoice(Number(req.params.id) || 0) })));
  app.post("/api/admin/billing/invoices/:id/sync", requireAdmin, wrap(async (req) => ({ invoice: await syncInvoice(Number(req.params.id) || 0) })));
  app.post("/api/admin/billing/invoices/:id/void", requireAdmin, wrap(async (req) => ({ invoice: await voidInvoice(Number(req.params.id) || 0) })));
  app.post("/api/admin/billing/invoices/:id/mark-paid", requireAdmin, wrap(async (req) => ({ invoice: await markPaid(Number(req.params.id) || 0) })));
  app.get("/api/admin/billing/invoices/:id/view", requireAdmin, async (req, res) => {
    const inv = await getInvoice(Number(req.params.id) || 0);
    if (!inv) return res.status(404).send("Not found");
    res.type("html").send(invoiceHtml(inv, await getSettings()));
  });

  app.get("/api/client/invoices", requireClient, loadClient, wrap(async (req) => ({
    invoices: await db.all("SELECT id, number, invoice_date, due_date, period_start, period_end, amount, status, payment_url, paid_at FROM invoices WHERE client_account_id = $1 AND status <> 'draft' ORDER BY id DESC", [req.client.account_id]),
  })));
  app.get("/api/client/invoices/:id/view", requireClient, loadClient, async (req, res) => {
    const inv = await getInvoice(Number(req.params.id) || 0);
    if (!inv || inv.client_account_id !== req.client.account_id || inv.status === "draft") return res.status(404).send("Not found");
    res.type("html").send(invoiceHtml(inv, await getSettings()));
  });
}

module.exports = { handleStripeWebhook, PROVIDER, register, createInvoice, sendInvoice, syncInvoice, syncOpen, startSyncJob, voidInvoice, markPaid, notarialFor, clientPrice, lineItemsFor };

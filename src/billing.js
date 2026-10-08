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

const CANCELED = ["canceled", "no_show"];
// Trip and late-cancel fees on a canceled or no-show job (the only thing billable on one).
const cancelLines = (b) => require("./fees").cancelItems(require("./addons").list(b))
  .filter((a) => a.qty > 0 && a.price > 0)
  .map((a) => ({ booking_id: b.id, name: `${a.label} · ${b.ref}`.slice(0, 195), quantity: a.qty, unit_price: round2(a.price) }));

function lineItemsFor(b, settings) {
  if (CANCELED.includes(b.status)) { const c = cancelLines(b); return c.length ? c : null; }
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
  for (const a of require("./addons").list(b)) {
    if (a.qty > 0 && a.price > 0) items.push({ booking_id: b.id, name: `${a.label} · ${b.ref}`.slice(0, 195), quantity: a.qty, unit_price: round2(a.price) });
  }
  return items;
}

async function unbilled() {
  const rows = await db.all(`SELECT b.*, a.company FROM bookings b LEFT JOIN client_accounts a ON a.id = b.client_account_id
    WHERE (b.status = 'completed' OR (b.status IN ('canceled','no_show') AND b.addons @> '[{"onCancel": true}]'::jsonb)) AND b.invoice_id IS NULL ORDER BY b.start_utc`);
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
    if (CANCELED.includes(b.status) && !cancelLines(b).length) throw Object.assign(new Error("A canceled or no-show job can only be billed for a trip or late-cancellation fee. Add one under Extra fees first."), { status: 400 });
    jobs = [b];
    accountId = b.client_account_id || null;
  } else {
    const end = through && /^\d{4}-\d{2}-\d{2}$/.test(through) ? through : today;
    jobs = await db.all(`SELECT * FROM bookings WHERE client_account_id = $1 AND (status = 'completed' OR (status IN ('canceled','no_show') AND addons @> '[{"onCancel": true}]'::jsonb)) AND invoice_id IS NULL
      AND start_utc < ($2::date + 1)::timestamptz ORDER BY start_utc`, [accountId, end]);
    if (!jobs.length) throw Object.assign(new Error("No completed, unbilled jobs for this client."), { status: 400 });
  }
  const missing = jobs.filter((b) => !CANCELED.includes(b.status) && clientPrice(b) == null);
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

// Late fee on an overdue business invoice: a separate invoice for settings.billing.lateFeePct of the
// unpaid amount, at most once every 30 days per invoice. The desk clicks it; nothing is charged automatically.
async function lateFee(id) {
  const settings = await getSettings();
  const pct = Number(settings.billing?.lateFeePct) || 0;
  if (!(pct > 0)) throw Object.assign(new Error("Late fees are off. Set a percentage in Settings → Billing."), { status: 400 });
  const inv = await db.one("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!inv) throw Object.assign(new Error("Invoice not found."), { status: 404 });
  const today = dateInTz(new Date(), settings.business.timezone);
  if (inv.status !== "open" || !(String(inv.due_date) < today)) throw Object.assign(new Error("Only open invoices past their due date can get a late fee."), { status: 400 });
  if (!inv.client_account_id) throw Object.assign(new Error("Late fees apply to business accounts only."), { status: 400 });
  if (inv.late_fee_at && Date.now() - new Date(inv.late_fee_at).getTime() < 30 * 86400e3) throw Object.assign(new Error("A late fee was already billed on this invoice in the last 30 days."), { status: 400 });
  const amount = Math.max(1, round2(inv.amount * pct / 100));
  const created = await db.tx(async (t) => {
    const lock = await t.one("UPDATE invoices SET late_fee_at = now() WHERE id = $1 AND (late_fee_at IS NULL OR late_fee_at < now() - interval '30 days') RETURNING id", [inv.id]);
    if (!lock) throw Object.assign(new Error("A late fee was just billed on this invoice."), { status: 409 });
    const row = await t.one(`INSERT INTO invoices(client_account_id, bill_to_name, bill_to_email, invoice_date, due_date, period_start, period_end, amount, status, provider)
      VALUES($1,$2,$3,$4,$5,$4,$4,$6,'draft',$7) RETURNING *`, [inv.client_account_id, inv.bill_to_name, inv.bill_to_email, today, addDays(today, 15), amount, PROVIDER]);
    const number = invoiceNumber(row.id, today);
    await t.run("UPDATE invoices SET number = $1 WHERE id = $2", [number, row.id]);
    await t.run("INSERT INTO invoice_items(invoice_id, name, quantity, unit_price) VALUES($1,$2,1,$3)", [row.id, `Late fee (${pct}% a month) on invoice ${inv.number}, due ${inv.due_date}`, amount]);
    return row;
  });
  try { return await sendInvoice(created.id); }
  catch (e) { console.error("Sending late-fee invoice failed:", e.message); return getInvoice(created.id); }
}

async function setDueDate(id, dueDate) {
  const settings = await getSettings();
  const d = String(dueDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d + "T12:00:00Z"))) throw Object.assign(new Error("Pick a valid due date."), { status: 400 });
  const inv = await db.one("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!inv) throw Object.assign(new Error("Invoice not found."), { status: 404 });
  if (!["draft", "open"].includes(inv.status)) throw Object.assign(new Error("Only draft or open invoices can change due date."), { status: 400 });
  if (d < String(inv.invoice_date).slice(0, 10)) throw Object.assign(new Error("The due date can't be before the invoice date."), { status: 400 });
  if (inv.status === "open" && inv.provider === "stripe" && inv.stripe_invoice_id) {
    try { await stripeB.setDueDate(inv.stripe_invoice_id, d, settings); }
    catch (e) { throw Object.assign(new Error(`Stripe: ${e.message}`), { status: 502 }); }
  }
  await db.run("UPDATE invoices SET due_date = $1 WHERE id = $2", [d, id]);
  const jobs = await db.all("SELECT id FROM bookings WHERE invoice_id = $1", [id]);
  for (const b of jobs) await logEvent(b.id, "desk", `Invoice ${inv.number} due date changed from ${String(inv.due_date).slice(0, 10)} to ${d}`);
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
  const money = (n) => "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const day = (d) => { try { return new Date(String(d).slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }); } catch { return String(d || ""); } };
  const biz = settings.business || {};
  const paid = inv.status === "paid", voided = inv.status === "void";
  const lateNote = inv.client_account_id && Number(settings.billing?.lateFeePct) > 0 ? ` Balances unpaid after the due date may be charged a late fee of ${Number(settings.billing.lateFeePct)}% a month.` : "";
  const label = { paid: "Paid", open: "Due", draft: "Draft", void: "Void" }[inv.status] || inv.status;
  const tel = String(biz.phone || "").replace(/[^\d+]/g, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Invoice ${esc(inv.number)} · ${esc(biz.name)}</title>
  <link rel="stylesheet" href="/css/fonts.css">
  <style>
  :root{--ink:#14231d;--ink2:#3d4f47;--muted:#5b6a63;--line:#d9e0db;--deep:#10261e;--deepfg:#e9f0eb;--brass:#8c6017;--brassSoft:#f3e7cf;--ok:#276b43;--okSoft:#dcefe3}
  *{box-sizing:border-box}body{margin:0;background:#eef1ee;color:var(--ink);font-family:"Public Sans",system-ui,-apple-system,"Segoe UI",Arial,sans-serif;font-size:14px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{max-width:820px;margin:28px auto;background:#fff;border:1px solid var(--line);border-radius:6px;overflow:hidden;box-shadow:0 8px 30px rgba(16,38,30,.08)}
  .head{background:var(--deep);color:var(--deepfg);padding:30px 40px;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;border-bottom:4px solid var(--brass)}
  .brand{display:flex;align-items:center;gap:14px}.brand svg{width:54px;height:54px;flex:none}
  .brand b{display:block;font-family:Archivo,"Arial Narrow",Arial,sans-serif;font-size:24px;font-weight:800;letter-spacing:.01em;line-height:1.1}
  .brand span{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#d8a24a}
  .doc{text-align:right}.doc small{display:block;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9fb5aa}
  .doc strong{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:18px}
  .body{padding:34px 40px 28px;position:relative}
  .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:18px 28px;margin-bottom:28px}
  .meta small{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
  .meta div{font-size:14px}.meta b{font-weight:700}
  .pill{display:inline-block;padding:3px 12px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;background:var(--brassSoft);color:#6e4b10}
  .pill.paid{background:var(--okSoft);color:var(--ok)}.pill.void{background:#eee;color:#666}
  table{width:100%;border-collapse:collapse}
  th{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);text-align:left;padding:10px 8px;border-bottom:2px solid var(--ink);font-weight:600}
  td{padding:13px 8px;border-bottom:1px solid var(--line);vertical-align:top}
  .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}td.q{color:var(--muted)}
  .sum{display:flex;justify-content:flex-end;margin-top:20px}
  .total{min-width:260px;background:var(--deep);color:var(--deepfg);border-radius:4px;padding:16px 20px;display:flex;justify-content:space-between;align-items:baseline;gap:24px;border-left:4px solid var(--brass)}
  .total small{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9fb5aa}.total strong{font-family:Archivo,Arial,sans-serif;font-size:26px;font-weight:800}
  .pay{margin-top:26px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
  .btn{display:inline-block;background:var(--brass);color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:4px;letter-spacing:.02em}
  .paidnote{color:var(--ok);font-weight:700}
  .stamp{position:absolute;right:40px;top:96px;transform:rotate(-8deg);border:3px solid var(--ok);color:var(--ok);padding:4px 16px;border-radius:4px;font-family:Archivo,Arial,sans-serif;font-weight:800;font-size:26px;letter-spacing:.2em;opacity:.8}
  .notes{margin-top:26px;padding-top:18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}
  .foot{background:#f5f7f4;border-top:1px solid var(--line);padding:18px 40px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--ink2)}
  .foot b{color:var(--ink)}.foot a{color:var(--brass);text-decoration:none}
  .print{max-width:820px;margin:0 auto 28px;text-align:right;padding:0 4px}.print button{font:inherit;font-size:13px;padding:8px 16px;border:1px solid var(--line);background:#fff;border-radius:4px;cursor:pointer}
  @media(max-width:560px){.head,.body,.foot{padding-left:20px;padding-right:20px}.doc{text-align:left}.stamp{position:static;display:inline-block;margin-bottom:14px}}
  @media print{body{background:#fff}.sheet{margin:0;border:0;box-shadow:none;border-radius:0}.print{display:none}@page{margin:12mm}}
  </style></head><body>
  <div class="sheet">
    <div class="head">
      <div class="brand"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#a8751f"/><circle cx="32" cy="32" r="25" fill="none" stroke="#fff" stroke-width="2"/><text x="32" y="38" font-family="Archivo,Arial Narrow,Arial,sans-serif" font-weight="900" font-size="17" fill="#fff" text-anchor="middle">MCC</text></svg>
        <div><b>${esc(biz.name)}</b><span>Notary &middot; Signing &middot; Process Serving</span></div></div>
      <div class="doc"><small>Invoice</small><strong>${esc(inv.number)}</strong></div>
    </div>
    <div class="body">
      ${paid ? `<div class="stamp">PAID</div>` : ""}
      <div class="meta">
        <div><small>Billed to</small><b>${esc(inv.bill_to_name)}</b><br>${esc(inv.bill_to_email)}</div>
        <div><small>Issued</small>${esc(day(inv.invoice_date))}</div>
        <div><small>${paid ? "Paid" : "Due"}</small>${esc(paid && inv.paid_at ? day(inv.paid_at.toISOString ? inv.paid_at.toISOString() : inv.paid_at) : day(inv.due_date))}</div>
        <div><small>Status</small><span class="pill ${paid ? "paid" : voided ? "void" : ""}">${esc(label)}</span></div>
      </div>
      ${inv.period_start && inv.period_end && String(inv.period_start) !== String(inv.period_end) ? `<p style="margin:0 0 14px;color:var(--muted)">Service period ${esc(day(inv.period_start))} to ${esc(day(inv.period_end))}</p>` : ""}
      <table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Amount</th></tr></thead><tbody>
      ${inv.items.map((i) => `<tr><td>${esc(i.name)}${i.ref ? `<br><span style="color:var(--muted);font-size:12px">Booking ${esc(i.ref)}</span>` : ""}</td><td class="n q">${i.quantity}</td><td class="n">${money(i.quantity * i.unit_price)}</td></tr>`).join("")}
      </tbody></table>
      <div class="sum"><div class="total"><small>${paid ? "Total paid" : "Total due"}</small><strong>${money(inv.amount)}</strong></div></div>
      ${!paid && !voided && inv.payment_url ? `<div class="pay"><a class="btn" href="${esc(inv.payment_url)}">Pay this invoice online</a><span style="color:var(--muted)">Secure card or bank payment</span></div>` : ""}
      ${paid ? `<div class="pay"><span class="paidnote">Thank you. This invoice has been paid in full.</span></div>` : ""}
      <p class="notes">Notarial fees are charged within New Jersey's legal limits and listed separately from signing-service, travel and other fees.${esc(lateNote)} Questions about this invoice? Call or email us and mention ${esc(inv.number)}.</p>
    </div>
    <div class="foot">
      <div><b>${esc(biz.name)}</b><br>Cranford, New Jersey</div>
      <div><a href="tel:${esc(tel)}">${esc(biz.phone)}</a><br><a href="mailto:${esc(biz.email)}">${esc(biz.email)}</a></div>
      <div><a href="https://mcc-solutionsnj.com">mcc-solutionsnj.com</a></div>
    </div>
  </div>
  <div class="print"><button onclick="window.print()">Print or save as PDF</button></div>
  </body></html>`;
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
      const canceled = CANCELED.includes(b.status);
      const price = canceled ? round2(cancelLines(b).reduce((a, i) => a + i.quantity * i.unit_price, 0)) : clientPrice(b);
      const j = { canceled, status: b.status, id: b.id, ref: b.ref, category: b.category, start_utc: b.start_utc, file_number: b.file_number, signer_names: b.signer_names, contact_name: b.contact_name,
        price, extras: canceled ? 0 : Number(b.addons_total) || 0, notarial: price == null || canceled ? null : Math.min(notarialFor(b, settings) ?? 0, price), state: b.state };
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
  app.post("/api/admin/billing/invoices/:id/late-fee", requireAdmin, wrap(async (req) => ({ invoice: await lateFee(Number(req.params.id) || 0) })));
  app.post("/api/admin/billing/invoices/:id/due-date", requireAdmin, wrap(async (req) => ({ invoice: await setDueDate(Number(req.params.id) || 0, req.body.dueDate) })));
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

module.exports = { handleStripeWebhook, setDueDate, PROVIDER, register, createInvoice, sendInvoice, syncInvoice, syncOpen, startSyncJob, voidInvoice, markPaid, notarialFor, clientPrice, lineItemsFor };

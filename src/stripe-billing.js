// Stripe Invoicing: send invoices that clients pay by card or ACH bank debit.
// Stripe pays out to the bank account you connect in Stripe (e.g. your Mercury account).
// Env: STRIPE_SECRET_KEY (sk_test_... to test), STRIPE_WEBHOOK_SECRET (whsec_..., optional but recommended).
const Stripe = require("stripe");
const { zonedToUtc } = require("./time");

const KEY = process.env.STRIPE_SECRET_KEY || "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const enabled = !!KEY;

let stripe = null;
if (enabled) {
  const opts = { appInfo: { name: "MCC Solutions dispatch" } };
  if (process.env.STRIPE_API_BASE) { // only for local testing against stripe-mock
    const u = new URL(process.env.STRIPE_API_BASE);
    Object.assign(opts, { host: u.hostname, port: u.port, protocol: u.protocol.replace(":", "") });
  }
  stripe = new Stripe(KEY, opts);
}

const cents = (n) => Math.round(Number(n) * 100);

function normalizeStatus(s) {
  if (s === "paid") return "paid";
  if (s === "void" || s === "uncollectible") return "void";
  if (s === "draft") return "draft";
  return "open";
}

// Create the customer if needed, build the invoice with one item per line, finalize and email it.
async function createAndSend({ inv, items, customerId, dueDate, settings }) {
  if (!customerId) {
    const c = await stripe.customers.create({ name: inv.bill_to_name, email: inv.bill_to_email, metadata: { mcc_client_account_id: String(inv.client_account_id || "") } });
    customerId = c.id;
  }
  const methods = ["card"];
  if (settings.billing?.stripeAch !== false) methods.push("us_bank_account");
  // Due at the end of the due date in the desk's time zone (Stripe needs a future time).
  const due = Math.max(Math.floor(zonedToUtc(dueDate, 23 * 60 + 59, settings.business.timezone).getTime() / 1000), Math.floor(Date.now() / 1000) + 3600);
  const draft = await stripe.invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    due_date: due,
    currency: "usd",
    pending_invoice_items_behavior: "exclude",
    description: `${settings.business.name}${inv.period_start && inv.period_start !== inv.period_end ? ` · signings ${inv.period_start} to ${inv.period_end}` : ""}`.slice(0, 500),
    footer: `Questions: ${settings.business.phone} · ${settings.business.email}. Notarial fees are charged within state limits and listed separately.`.slice(0, 500),
    custom_fields: [{ name: "MCC invoice", value: inv.number }],
    metadata: { mcc_invoice_id: String(inv.id), mcc_invoice_number: inv.number },
    payment_settings: { payment_method_types: methods },
  }, { idempotencyKey: `mcc-invoice-${inv.id}-create` });
  for (const [i, it] of items.entries()) {
    await stripe.invoiceItems.create({
      customer: customerId, invoice: draft.id, currency: "usd",
      amount: cents(it.quantity * it.unit_price), description: it.name.slice(0, 500),
      metadata: { mcc_booking_id: String(it.booking_id || "") },
    }, { idempotencyKey: `mcc-invoice-${inv.id}-item-${i}` });
  }
  let fin = await stripe.invoices.retrieve(draft.id);
  if (fin.status === "draft") fin = await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false });
  const sent = await stripe.invoices.sendInvoice(fin.id);
  return { customerId, id: sent.id, url: sent.hosted_invoice_url || fin.hosted_invoice_url || null, status: normalizeStatus(sent.status), number: sent.number };
}

async function get(id) {
  const i = await stripe.invoices.retrieve(id);
  return { status: normalizeStatus(i.status), url: i.hosted_invoice_url || null };
}

async function voidInvoice(id) {
  const i = await stripe.invoices.retrieve(id);
  if (i.status === "draft") return stripe.invoices.del(id);
  if (i.status === "open") return stripe.invoices.voidInvoice(id);
  return i;
}

function verifyEvent(rawBody, signature) {
  if (!WEBHOOK_SECRET) throw Object.assign(new Error("STRIPE_WEBHOOK_SECRET is not set"), { status: 400 });
  return stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
}

module.exports = { enabled, createAndSend, get, voidInvoice, verifyEvent, normalizeStatus, webhookConfigured: !!WEBHOOK_SECRET };

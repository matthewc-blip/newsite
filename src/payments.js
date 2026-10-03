// Card on file for individual customers: they save a card through Stripe when they book, and the
// desk charges it after the signing (automatically on completion, or by hand for no-show and
// cancellation fees). Each charge is recorded as a paid invoice, so it shows in Billing and the
// job can't be invoiced twice. Business clients with an account keep paying by invoice.
const { db, getSettings, logEvent } = require("./db");
const stripeB = require("./stripe-billing");
const mail = require("./email");
const { dateInTz } = require("./time");

const OPEN = ["requested", "confirmed", "assigned"];
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const err = (message, status = 400) => Object.assign(new Error(message), { status });

function cardsOn(settings) {
  return stripeB.enabled && (settings.billing?.cardAtBooking || "ask") !== "off";
}
// Ask for a card on individual bookings that are still upcoming and have no card yet.
function wantsCard(b, settings) {
  return cardsOn(settings) && !b.client_account_id && OPEN.includes(b.status) && !b.stripe_payment_method_id;
}
function cardView(b) {
  return b.stripe_payment_method_id ? { brand: b.card_brand || "card", last4: b.card_last4 || "" } : null;
}

async function startCardSetup(b) {
  const settings = await getSettings();
  if (!cardsOn(settings)) throw err("Card payments aren't turned on.");
  if (b.client_account_id) throw err("This booking is billed to a business account.");
  if (!OPEN.includes(b.status)) throw err("This booking is no longer open.");
  const customerId = b.stripe_customer_id || await stripeB.findOrCreateCustomer({ name: b.contact_name, email: b.contact_email, phone: b.contact_phone, bookingRef: b.ref });
  const manage = `${mail.BASE}/manage.html?ref=${encodeURIComponent(b.ref)}&token=${encodeURIComponent(b.token)}`;
  const s = await stripeB.createCardSession({
    customerId, bookingId: b.id, bookingRef: b.ref,
    successUrl: `${manage}&card=saved&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${manage}&card=skipped`,
  });
  await db.run("UPDATE bookings SET stripe_customer_id = $1, checkout_session_id = $2 WHERE id = $3", [customerId, s.id, b.id]);
  return s.url;
}

// Record the card from a finished Checkout session (called from the success redirect and the webhook).
async function recordFromSession(sessionId, expectBookingId) {
  const c = await stripeB.readCardSession(sessionId);
  if (!c.complete || !c.paymentMethodId) return null;
  const id = expectBookingId || c.bookingId;
  if (!id || (expectBookingId && c.bookingId && c.bookingId !== expectBookingId)) return null;
  const b = await db.one("SELECT * FROM bookings WHERE id = $1", [id]);
  if (!b) return null;
  if (b.stripe_payment_method_id === c.paymentMethodId) return b;
  const updated = await db.one(`UPDATE bookings SET stripe_customer_id = $1, stripe_payment_method_id = $2, card_brand = $3, card_last4 = $4,
      card_saved_at = now(), updated_at = now() WHERE id = $5 RETURNING *`, [c.customerId || b.stripe_customer_id, c.paymentMethodId, c.brand || null, c.last4 || null, b.id]);
  await logEvent(b.id, "customer", `Card saved (${c.brand || "card"} ending ${c.last4 || "?"})`);
  return updated;
}

// Charge the saved card. kind "service" charges the job's fee; kind "fee" charges a custom amount
// (no-show, late cancellation, extra trip). Either way the result is a paid invoice tied to the job.
async function charge(bookingId, { kind = "service", amount, note } = {}) {
  const settings = await getSettings();
  if (!stripeB.enabled) throw err("Connect Stripe to charge cards.");
  const b = await db.one("SELECT * FROM bookings WHERE id = $1", [bookingId]);
  if (!b) throw err("Booking not found.", 404);
  if (!b.stripe_payment_method_id) throw err("No card on file for this booking.");
  if (b.invoice_id) throw err("This job is already billed. Void that invoice first to charge again.");
  let items;
  if (kind === "service") {
    const canceled = ["canceled", "no_show"].includes(b.status);
    if (b.status !== "completed" && !canceled) throw err("Mark the job completed before charging the service fee, or charge a fee instead.");
    items = require("./billing").lineItemsFor(b, settings);
    if (!items) throw err(canceled ? "Add a trip or late-cancellation fee under Extra fees first." : "Set the client fee on this booking first.");
  } else {
    const amt = round2(amount);
    if (!(amt > 0) || amt > 5000) throw err("Enter a fee between $0.01 and $5,000.");
    const label = String(note || "").trim().slice(0, 120) || (b.status === "no_show" ? "No-show fee" : "Cancellation fee");
    items = [{ booking_id: b.id, name: `${label} · ${b.ref}`, quantity: 1, unit_price: amt }];
  }
  const total = round2(items.reduce((a, i) => a + i.quantity * i.unit_price, 0));
  const today = dateInTz(new Date(), settings.business.timezone);

  // Reserve the job with a draft invoice first, so a double click can't charge twice.
  const inv = await db.tx(async (t) => {
    const row = await t.one(`INSERT INTO invoices(client_account_id, bill_to_name, bill_to_email, invoice_date, due_date, period_start, period_end, amount, status, provider)
      VALUES(NULL,$1,$2,$3,$3,$4,$4,$5,'draft','card') RETURNING *`,
      [b.contact_name, b.contact_email, today, dateInTz(new Date(b.start_utc), settings.business.timezone), total]);
    const number = `MCC-${today.replace(/-/g, "").slice(0, 6)}-${String(row.id).padStart(4, "0")}`;
    await t.run("UPDATE invoices SET number = $1 WHERE id = $2", [number, row.id]);
    for (const i of items) await t.run("INSERT INTO invoice_items(invoice_id, booking_id, name, quantity, unit_price) VALUES($1,$2,$3,$4,$5)", [row.id, i.booking_id, i.name, i.quantity, i.unit_price]);
    const claimed = await t.one("UPDATE bookings SET invoice_id = $1 WHERE id = $2 AND invoice_id IS NULL RETURNING id", [row.id, b.id]);
    if (!claimed) throw err("This job was just billed. Refresh and check Billing.", 409);
    return { ...row, number };
  });

  try {
    const pi = await stripeB.chargeSavedCard({
      customerId: b.stripe_customer_id, paymentMethodId: b.stripe_payment_method_id, amount: total,
      description: `${settings.business.name} · ${b.ref} · ${items.map((i) => i.name.split(" · ")[0]).join(", ")}`,
      receiptEmail: b.contact_email,
      metadata: { mcc_booking_id: String(b.id), mcc_booking_ref: b.ref, mcc_invoice_id: String(inv.id) },
      idempotencyKey: `mcc-card-charge-${inv.id}`,
    });
    if (pi.status !== "succeeded") throw Object.assign(new Error(`Payment is ${pi.status.replace(/_/g, " ")}.`), { declined: true, paymentIntentId: pi.id });
    await db.run(`UPDATE invoices SET status = 'paid', paid_at = now(), sent_at = now(), stripe_payment_intent_id = $1, error = NULL WHERE id = $2`, [pi.id, inv.id]);
    await logEvent(b.id, "desk", `Charged $${total.toFixed(2)} to ${b.card_brand || "card"} ending ${b.card_last4 || "?"} (${inv.number})`);
    return { ok: true, invoice: inv.number, amount: total };
  } catch (e) {
    // Leave the draft so the desk can send it as a regular Stripe invoice with a pay link instead.
    await db.run("UPDATE invoices SET error = $1, stripe_payment_intent_id = $2 WHERE id = $3", [`Card charge failed: ${String(e.message).slice(0, 400)}`, e.paymentIntentId || null, inv.id]);
    await logEvent(b.id, "system", `Card charge of $${total.toFixed(2)} failed: ${e.message}`);
    mail.deskNotice(`Card declined: ${b.ref}`, `Charging $${total.toFixed(2)} to ${b.contact_name}'s card failed: ${e.message}\nInvoice ${inv.number} is saved as a draft. Open Billing and click Send to email them a pay link.`);
    throw err(e.declined ? `Card declined: ${e.message} Invoice ${inv.number} is saved as a draft; send it from Billing for a pay link.` : `Stripe: ${e.message}`, 402);
  }
}

// Called whenever a job is marked completed (by the desk or the notary).
async function onCompleted(bookingId) {
  const settings = await getSettings();
  if (!stripeB.enabled || settings.billing?.autoChargeCards === false) return;
  const b = await db.one("SELECT * FROM bookings WHERE id = $1", [bookingId]);
  if (!b || !b.stripe_payment_method_id || b.invoice_id || b.client_account_id) return;
  if ((b.quoted_fee ?? b.est_fee) == null) {
    mail.deskNotice(`Set a fee to charge ${b.ref}`, `${b.ref} is complete and ${b.contact_name} has a card on file, but there's no client fee yet. Set the fee and click Charge card.`);
    return;
  }
  try { await charge(b.id, { kind: "service" }); }
  catch (e) { console.error(`Auto-charge for ${b.ref} failed:`, e.message); }
}

module.exports = { cardsOn, wantsCard, cardView, startCardSetup, recordFromSession, charge, onCompleted };

# MCC Solutions: website + booking system

Public website with online booking for **Mobile Notary**, **RON** (Remote Online Notarization) and **RIN** (Remote Ink-Signed Notarization), plus a password-protected **Dispatch Desk** for your team.

## What's included

**Public site** (`/`)
- All site pages: Services, RON, RIN, How It Works, Who We Serve, Coverage, For Notaries, FAQ, Contact
- **Book** page (`/#order`), a 5-step booking flow:
  1. Choose Mobile, RON or RIN
  2. Details: document type, number of signers, and the signing address (mobile), or the signer's location (RON/RIN). RIN also asks for a mailing address for the paper documents.
  3. Live calendar: only open times are shown, in the customer's time zone
  4. Contact info
  5. Review, then confirm
- A confirmation screen with an **Add to calendar** (.ics) link and a private **View or cancel** link
- The For Notaries and Contact forms save to the database

**Dispatch Desk** (`/admin`)
- Today's counts, bookings that need confirming, and bookings with no notary assigned
- Bookings grouped by day. Filter by Upcoming, Today, Needs confirming, Past or Canceled, by service, or by search.
- Booking detail panel: change the status (Requested → Confirmed → Assigned → Completed, Canceled or No-show), assign a notary, quote a fee, reschedule, keep internal notes, and see each booking's history. Status changes can email the customer.
- **New Booking** for phone orders. It can override your open hours and capacity.
- **Notaries**: the roster, with which agents can do RON or RIN
- **Applications**: approve a notary and add them to the roster in one click
- **Messages** from the Contact page
- **Settings**: business phone, email and time zone; per-service hours, appointment length, how many appointments can happen at once, minimum notice, how far ahead people can book, and prices; RIN states; closed dates
- CSV export of all bookings

**Emails** (once SMTP is configured)
- Customer: request received (with a calendar file attached), confirmed, notary assigned, canceled, completed
- Desk: new booking, customer cancellation, new application, new message

## Step 1: Set up Supabase (the database)

1. Create a free account at supabase.com, then click **New project**. Name it `mcc-solutions`, set a strong **database password** and save it somewhere safe, then pick the region closest to you (e.g. East US).
2. When the project is ready, open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, and click **Run**. (It is safe to run again after updates.) This creates the tables. The server also creates them on first start, so this step is a safety net.
3. Click **Connect** in the top bar. Under **Session pooler**, copy the **URI**. It looks like:
   `postgresql://postgres.abcd1234:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
   Replace `[YOUR-PASSWORD]` with your database password. This is your `DATABASE_URL`.

Use the **Session pooler** string, not "Direct connection". Most hosts, Render included, can't reach the direct address because it is IPv6-only.

Your tables show up in Supabase under **Table Editor**: `bookings`, `notaries`, `applications`, `messages`, `booking_events` and `settings`. Row Level Security is switched on with no public policies, so Supabase's public API keys can't read customer data. Only this server, which connects with the database password, can.

## Step 2: Run it on your computer (optional)

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # paste DATABASE_URL and set ADMIN_PASSWORD
npm start
```

The site runs at http://localhost:3000 and the desk at http://localhost:3000/admin. Without SMTP settings, emails are printed to the terminal instead of being sent.

## Step 3: Put the website online

The data lives in Supabase, so the web host doesn't need a disk. Any Node.js host works.

### Option A: Render (simplest)
1. Put this folder in a GitHub repository (private is fine).
2. On render.com: **New → Blueprint**, then pick the repository. `render.yaml` sets everything up.
3. When Render asks, fill in `DATABASE_URL`, `ADMIN_PASSWORD`, `PUBLIC_URL` (e.g. `https://www.mcc-solutionsnj.com`), `DESK_EMAIL` and the SMTP values.
4. Under **Settings → Custom Domains**, add your domain and point DNS to Render as instructed.

The free plan works but sleeps when idle, so the first visitor after a quiet period waits about a minute. Use a paid instance for a business site.

### Option B: Railway, Fly.io or any Docker host
Use the included `Dockerfile` and set the environment variables from `.env.example`.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Session pooler connection string |
| `ADMIN_PASSWORD` | Yes | Password for `/admin` |
| `SESSION_SECRET` | Yes | Long random string that signs desk logins. If it isn't set, everyone is signed out on each restart. |
| `PUBLIC_URL` | Yes | Your site address. Used for links in emails. |
| `DESK_EMAIL` | Recommended | Where new-booking alerts go |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Recommended | Outgoing email. Works with Google Workspace, Microsoft 365, Postmark, SendGrid, Resend, Mailgun and similar. **Notaries can't sign in without email**, because sign-in works by emailed link. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Stores notary documents in a private Supabase Storage bucket (created automatically). Without them, files are kept in the database, which is fine for a small roster. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Optional | Texts notaries when they get a job offer |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional | Sends client invoices through Stripe (card + ACH) and tracks payment |

## Client accounts (title companies, lenders, law firms)

1. In **/admin → Clients**, click **Add Client**. Enter the company and its standing instructions; notaries see those instructions on every order.
2. Add each person on their team with **Add & Invite**. They get an email link to the client portal at `/client/`.
3. In the portal, clients can:
   - place orders and pick an open time
   - upload the closing package (PDF, up to 60 MB per file)
   - track status
   - see which notary was assigned
   - download scanbacks once the desk approves them
   - cancel orders
4. Bookings from the public site are linked to an account automatically when the contact email belongs to a client user. You can also link one by hand from the booking panel.

## Closing documents and scanbacks

- **Packages:** the client or the desk uploads the closing package. The notary can download it only after accepting the job, and is emailed (and texted) when it's ready. The desk sees when the notary downloaded it.
- **Scanbacks:** the notary uploads scanbacks from the portal. Loan signings can't be marked complete without them.
- **Review:** the desk reviews scanbacks in the booking panel (Bookings → **Scanbacks** view). **Reject** sends your note to the notary to fix. **Approve All & Notify Client** emails the client that scanbacks are ready to download.
- **Retention:** files are deleted automatically N days after a job is completed or canceled (Settings → Dispatch & documents; default 30). The record of what was uploaded is kept.
- **Storage:** set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` before real volume. Closing packages are large, and the free Supabase database is small.

## Auto-dispatch

When it's on (Settings → Dispatch & documents), every online and client order is offered automatically to the best notary who:
- has finished onboarding with current credentials
- can do that service (RON or RIN)
- for mobile signings, is commissioned in the state and lives within their travel distance (from their home ZIP)
- isn't booked within an hour of the appointment, or within 15 minutes for remote sessions

Mobile jobs go to the nearest notary first. Remote jobs go to whoever has the fewest upcoming jobs.

The notary has 30 minutes to answer (10 if the appointment is under 4 hours away). If they decline or don't answer in time, the job goes to the next notary. After 6 tries, or if no one is eligible, the desk is emailed. The booking then shows under **Needs notary**, with the reason each notary was skipped.

Auto offers use the default notary fees in Settings. Assigning a notary by hand turns auto-dispatch off for that booking. **Auto-dispatch to nearest ready notary** in the booking panel turns it back on.

## Notary onboarding, offers and payouts

**Onboarding**
1. A notary applies on the For Notaries page.
2. In **/admin → Applications**, click **Approve & send onboarding email**. They're added to your roster and emailed a link to the notary portal (`/portal/`).
3. In the portal they upload their commission certificate, E&O policy, background check and W-9, enter expiration dates and their home ZIP and travel distance, and sign the contractor agreement.
4. The **Notaries** tab shows each notary as Ready, X to do, or X expiring. Open a notary to see their checklist and documents, upload files for them, or copy or email a sign-in link.

**Assigning jobs**
- In a booking, pick a notary (ready notaries are listed first and marked ✓), enter the notary's fee, and click **Send Offer**. The notary gets an email, and a text if Twilio is set up, with a link to accept or decline.
- They only see the full address and signer contact after accepting. Accepting sets the booking to Assigned and emails the customer the notary's name.
- If they decline, the desk is emailed and the booking shows "Declined · reassign".
- Already confirmed by phone? Check **Skip the offer** to assign directly.
- Notaries must finish onboarding before they can accept.
- After the signing, the notary marks the job complete in the portal. Loan signings require a return tracking number.

**Expiration reminders.** Every few hours the server checks commission, E&O and background-check dates. When one is 30 days out, 7 days out, or expired, it emails the notary and the desk once.

**Payouts.** Completed jobs with a notary fee appear in **/admin → Payouts**, grouped by notary. Pay them however you normally do, then click **Mark Selected Paid**; notaries see it under Earnings in their portal. Export the payout CSV for your 1099 records.

**Contractor agreement.** The text is a starting template in `src/agreement.js`. **Have an attorney review it for your state before use.** If you change it, also change `VERSION` in that file. The dashboard then shows which notaries signed an older version, and they're asked to sign again.

## Billing with Stripe

Stripe sends your invoices, collects card or ACH bank payments, and pays out to the bank you connect in Stripe (your Mercury account). Stripe has no monthly fee:
- Cards: 2.9% + 30¢
- ACH bank debit: 0.8%, capped at $5
- Stripe Invoicing: 0.4% per paid invoice, capped at $2

**Setup**
1. Create a Stripe account. Under **Settings → Business → Bank accounts and currencies** (Payouts), add your Mercury account.
2. Copy your secret key from **Developers → API keys** into `STRIPE_SECRET_KEY`. Use `sk_test_...` first and switch to `sk_live_...` when you're ready.
3. Under **Developers → Webhooks**, add the endpoint `https://YOUR-SITE/api/webhooks/stripe` with these events:
   - `invoice.paid`
   - `invoice.voided`
   - `invoice.marked_uncollectible`
   - `invoice.payment_failed`

   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Without the webhook, the app still checks Stripe every 30 minutes.
4. Restart the server. **Billing** shows **Stripe connected** (and **test mode** with a test key).
5. On each client in **Clients**, set a **billing email** and **payment terms** (default 30 days).

**How it works**
- **Fees.** Each booking has a client fee: the quote you set, or the estimate from your price list. For New Jersey loan signings, the invoice splits that fee into the NJ notarial fee ($25 for a financing, $15 for a transfer) and the rest as a signing-service fee. You can override the notarial part per booking in the booking panel.
- **Monthly invoices.** **Billing → Ready to invoice** lists completed jobs that aren't on an invoice yet, grouped by client. **Create & Send Invoice** makes one invoice for the period, with a line for each job (order number, file number, type, date and signer).
  - The client is created in Stripe the first time.
  - Stripe emails the invoice with a payment page where they pay by card or bank.
  - The client also sees it in their portal under **Invoices**.
- **Individuals.** Individual customers get one invoice per job, due on receipt. Use the Billing tab, or **Send invoice to customer** in the booking panel.
- **Payment status.** When a client pays, the webhook marks the invoice paid within seconds and the desk is emailed. **Check payment** asks Stripe right away.
- **Voiding.** **Void** voids the invoice in Stripe and puts its jobs back in Ready to invoice. Fees on an invoiced job are locked until it's voided.
- **Without Stripe.** If `STRIPE_SECRET_KEY` isn't set, invoices are still created and numbered. Send them your own way using the **View** page, and click **Mark paid** when paid.
- **Card only.** To turn off bank payments, uncheck **Stripe: let clients pay by bank** in Settings → Billing.
- **QuickBooks.** Connect **Stripe Connector by QuickBooks** in QuickBooks Online to bring in sales, fees and payouts. If Mercury's bank feed is also connected, match each Stripe payout deposit to its payout instead of adding it as new income.

**Testing.** This integration was tested against Stripe's official API mock (stripe-mock), plus a signed test webhook. Before switching to live keys, send yourself one invoice in test mode and pay it with card `4242 4242 4242 4242`.

## State rules and coverage

- **Live states.** Set these in **Settings → States where you dispatch mobile notaries now** (default: NJ). The Coverage page shows those states as Live and every other state as Soon. Customers booking a mobile signing elsewhere see a note that the desk will confirm coverage.
- **State onboarding rules.** Extra onboarding steps for a state live in `src/state-rules.js`. New Jersey notaries confirm three things:
  - they keep a notary journal for 10 years
  - they stay within NJ's notarial fee limits
  - RON notaries only: they notified the State Treasurer before doing remote notarizations, and they name their RON platform

  These show on each notary's checklist, and they must be confirmed before the notary can accept jobs. Add rules for the next state you open the same way.
- **RIN states.** New Jersey is on the RIN list. NJ law lets a notary notarize paper over video if the signer signs a declaration and mails the original within 3 days.

## First-day checklist (in /admin → Settings)
1. Enter your real desk phone, email and time zone. The website shows these automatically.
2. Set the hours for each service. RON is open 24/7 by default; mobile runs Mon–Fri 8–8 and Sat 9–5; RIN runs weekdays 9–5 with 24 hours' notice.
3. Set **At the same time**. This is how many appointments of that service can overlap, which is roughly how many agents or RON seats you can run at once.
4. Enter prices, or leave them blank so customers see "Quoted when we confirm".
5. Check the **RIN states** list against current law and your notaries' commissions.
6. Add your notaries in **Notaries**.

## Things to know
- **RON video sessions** have to happen on a state-approved RON platform (your RON notaries will already use one). This system books and tracks the appointment. The desk sends the signer the platform link when it confirms.
- **No payments yet.** Fees are estimates or quotes. Online card payment (e.g. Stripe) can be added later.
- **Backups:** Supabase backs up paid projects daily. On the free plan, download the CSV from the desk regularly. Free Supabase projects also pause after a week with no activity; a live booking site normally keeps it active.
- Customer manage links are private: anyone with the link can view or cancel that booking.
- Remote notarization laws change. The copy on the RON and RIN pages tells customers the desk checks eligibility for each order, so keep that step in your process.

## Project layout
```
server.js              API + web server
src/availability.js    open-slot calculation (hours, capacity, notice, closed dates)
src/db.js              Supabase/Postgres connection and settings
supabase/schema.sql    database tables (run in Supabase SQL Editor)
src/config.js          default settings
src/email.js           email templates
public/index.html      MCC Solutions home page
public/notary/         notary website + booking flow   (css/site.css, js/site.js, js/booking.js)
public/manage.html     customer view/cancel page
public/admin/          dispatch dashboard
public/portal/         notary portal
public/client/         client portal (title companies, lenders)
src/clients.js         client accounts, client portal API
src/documents.js       closing packages, scanbacks, review, retention
src/dispatch.js        automatic offers to the nearest ready notary
src/notary.js          onboarding checklist, offers, portal, payouts, reminders
src/agreement.js       contractor agreement text (have it reviewed)
src/storage.js         notary document storage
src/sms.js             optional Twilio texts
src/billing.js         invoices: fee split, monthly/individual invoices, payment sync
src/stripe-billing.js  Stripe Invoicing client + webhook verification
src/state-rules.js     extra onboarding steps per state (NJ included)
```

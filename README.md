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
cp .env.example .env      # paste DATABASE_URL and set SESSION_SECRET
npm start
```

The site runs at http://localhost:3000 and the desk at http://localhost:3000/admin. Without SMTP settings, emails are printed to the terminal instead of being sent.

## Step 3: Put the website online

The data lives in Supabase, so the web host doesn't need a disk. Any Node.js host works.

### Option A: Render (simplest)
1. Put this folder in a GitHub repository (private is fine).
2. On render.com: **New → Blueprint**, then pick the repository. `render.yaml` sets everything up.
3. When Render asks, fill in `DATABASE_URL`, `PUBLIC_URL` (e.g. `https://www.mcc-solutionsnj.com`), `DESK_EMAIL` and the SMTP values.
4. Under **Settings → Custom Domains**, add your domain and point DNS to Render as instructed.

The free plan works but sleeps when idle, so the first visitor after a quiet period waits about a minute. Use a paid instance for a business site.

### Option B: Railway, Fly.io or any Docker host
Use the included `Dockerfile` and set the environment variables from `.env.example`.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Session pooler connection string |
| (none) | | The `/admin` login is stored in the database: open `/admin/`, choose “Email me a setup link”, set a password and register a passkey |
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
   - upload the closing package (PDF, up to 50 MB per file, the Supabase free plan limit)
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

### Card on file for individual customers
When Stripe is connected, people who book online without a client account are asked to save a card through Stripe Checkout. Nothing is charged at booking. When the job is marked completed, the saved card is charged the client fee automatically (turn this off in Settings → Billing), and Stripe emails the receipt. From a booking in the dashboard you can also charge a no-show or cancellation fee, or email the customer a link to add a card. A declined card leaves a draft invoice you can send from Billing for a pay link. Add `checkout.session.completed` to your Stripe webhook events.

## Witnesses
People apply at /notary/become-a-witness. Approve them in Applications and they get an onboarding email for the same portal notaries use, with a shorter checklist: photo ID, background check, service area, W-9 and a witness agreement. On a booking (shown automatically when the customer added witnesses at checkout), choose a witness and fee and click Ask witness; they accept or decline in the portal and see the address only after accepting. Witnesses never get notary offers. Witness pay shows in Payouts next to notary pay, and margin protection counts notary plus witness pay.

## Process servers
People apply at /notary/become-a-process-server (a registered, insured vehicle is required to apply). Approve them in Applications and they onboard in the same portal with their own checklist: driver's license, vehicle registration and auto insurance (each uploaded with its expiration date), background check, service area, W-9 and the process server agreement. They can't accept work until every item is current; expiring license, registration and insurance trigger the same reminder emails as notary commissions. Process servers only see service requests in the portal, never notary bookings.

## Service requests (process serving, recording, legalization and more)
Each service page for process serving, document recording, embassy legalization, certified translation, shredding, estate document scanning, lien waivers and property inspections has a request form. Requests land in the dashboard's Requests tab, and the desk and the customer both get an email. From a request you can:
- Set the client fee, partner cost (for work done through a partner, like translation or recording) and due date. The 20% minimum margin applies to team pay plus partner cost.
- Assign it to a ready team member (process servers for serves; notaries or process servers for inspections and estate scanning; notaries for lien waivers). They get an email offer with the pay and the area; the address and documents appear only after they accept.
- Upload the papers to serve. The process server logs each attempt (time, result, who was served) and uploads the signed affidavit. A process serve can't be completed without a successful serve and an affidavit.
- Send the invoice in one click. Team pay shows up in Team payouts like any other job.

## New services (court runs, records, skip tracing, medical records, I-9, vehicle titles)

Request types and service pages for court filing and courthouse runs, records retrieval, skip tracing (database searches for a permissible purpose only, not investigations), medical records pickup (with a signed authorization or subpoena), and I-9 authorized representative visits. Vehicle title paperwork is a booking page for the mobile notary. Starting prices for each are in Settings → Starting prices.

## Law firms
- **/notary/law-firms** pitches process serving, notaries and witnesses to firms and has a "Request a firm account" form. Requests land in your Inbox; set the firm up in Clients and invite their team.
- **Client portal → Serves & Legal:** firm users order any service request, attach papers, follow every attempt, download the affidavit once the request is completed, and cancel before work starts.
- **Attempt emails:** for process serving and inspections, the customer gets an email each time an attempt is logged (date, time, result, notes). Turn it off for a single request in its panel in the Requests tab.
- **File numbers:** the customer's file or matter number is captured on the request form and portal, shown in the Requests tab, and printed on the invoice line.
- **Papers on the public form:** customers can attach up to 10 files when they send a request (a one-time upload link valid for 24 hours).
- Proof and affidavits stay hidden from the customer until the request is marked completed.

## Checkout add-ons
Settings → Checkout add-ons: printing, scanbacks, witnesses, courier and apostille handling are offered when customers book online and when clients order in the portal. Turn each on or off and set its price. Chosen add-ons show on the booking, in the notary's job details ("Also needed"), in confirmation emails, and as separate lines on invoices and card charges. Margin protection counts add-ons as part of the client total.

## Extra fees, late fees and request extras

- **Extra fees** (Settings → Extra fees): rush, after-hours, weekend, holiday, additional signers, extra documents, waiting time, travel, facility coordination, trip and late-cancellation fees. Rush, after-hours, weekend and extra-signer fees are added automatically when a job is booked (online, by the desk or in the client portal); turn that off for business accounts under Billing. The desk adds, changes or removes fees in the booking drawer (Extra fees), including one-off custom fees, until the job is invoiced. Each fee has a notary share % and the drawer shows the suggested extra pay with an "Add to notary pay" button.
- Fees are stored with the add-ons on the booking, so they show on confirmations, the customer's booking page, the client portal, invoices (one line each), card charges and the margin check. Notaries don't see the fee lines.
- **Canceled and no-show jobs** can be billed for trip and late-cancellation fees only: add the fee in the drawer, then invoice it or charge the saved card. A customer who cancels online less than 2 hours before the start gets the late-cancellation fee added automatically (the manage page warns them first) and the desk gets an email to charge or waive it.
- **Late fees**: Billing shows a "Late fee" button on overdue business invoices. It creates a separate invoice for the monthly percentage (Settings → Billing, default 1.5%), at most once every 30 days per invoice. Business invoices state the late fee terms.
- **Request extras** (Settings → Request extras): rush and same-day serves (added automatically from the priority the client picks), additional addresses and attempts, stakeouts, skip traces, affidavit filing, rush handling, travel and government fees at cost. Edit them in the request drawer; each is its own invoice line and counts in the margin.
- The public **fees page** (/notary/fees) is built from these settings, so it always matches what you charge. New Jersey caps the fee per notarial act; everything here is a separate service or travel fee, disclosed before the appointment.

## Margin protection
Settings → Billing → Minimum margin (default 20%). The desk can't save a notary fee or client fee that leaves MCC less than that share of the client fee; the dashboard shows the margin on every booking and the most you can pay the notary. You can override a single job when you choose to, and the override is recorded in the booking history. Automatic offers are capped so they never exceed the allowed notary fee. Set the minimum to 0 to turn the check off.

## Google review requests
Settings → Google reviews: paste your Google Business Profile review link and turn it on. A few hours after a job is completed (you choose the delay), the customer gets one email asking for a review. The same email address is asked at most once every 180 days, every email has a one-click opt-out, and only jobs completed in the last 14 days are included, so turning it on never emails old customers.

## Bookkeeping intake (QuickBooks Online, Xero, Excel/Sheets, other, or none)

`/bookkeeping/` collects prospective bookkeeping clients on whatever software they use. The page is hidden (noindex, not in the sitemap) until you turn it on.

- **Settings → Bookkeeping**: "Open" accepts clients and lets search engines index the page. "Show prices" adds the public price table and a live estimate. Prices, included accounts, payroll and per-platform adjustments are editable; the defaults are placeholders, so set your own.
- **Dashboard → Bookkeeping tab**: each lead shows the estimate, a status (new, contacted, quoted, won, lost), your quote, notes, and an onboarding checklist that changes with the platform. "Send access steps" emails the client how to give you access in their software.
- Estimates are always visible to the desk, even when public prices are off.
- Tracked link for mailers: `/go/bk`.
- Not built: engagement letters and a document-upload portal. Tax return preparation needs a PTIN and is out of scope for this page.

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
7. Check **Starting prices on the website**. These "starting at" prices show on the homepage and service pages. They ship with typical New Jersey market prices (mobile visit $75, loan signing $150, hospital visit $125, process serving $85, apostille $125, recording $50); change them to yours, or clear one to hide it.
8. In Render, set `PUBLIC_URL` to the exact address you want Google to use (for example `https://www.mcc-solutionsnj.com`). Visits to the other version (with or without `www`) are redirected to it, and every page's canonical link uses it.

## Guides and service page content
- **Guides** live at /notary/guides (content in `src/guides.js`). Each guide links to its services, and each service page links back. Guides are general information, not legal advice; review fees and procedures in them once a year.
- **Service page details** (how it works, what to have ready, turnaround and extra FAQs) live in `src/seo-extra.js`, keyed by service.
- **Fonts** are served from the site itself (`public/fonts`, SIL Open Font License), not Google Fonts.

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

// Default settings. Everything here can be changed later from the admin dashboard
// (Settings tab); the saved copy lives in the database and wins over these defaults.

const weekdays = (open, close) => ({ 0: null, 1: [open, close], 2: [open, close], 3: [open, close], 4: [open, close], 5: [open, close], 6: null });

const DEFAULT_SETTINGS = {
  business: {
    name: "MCC Solutions",
    phone: "(908) 444-6373",
    email: "booking@mcc-solutions.com",
    timezone: "America/New_York",
  },
  services: {
    mobile: {
      label: "Mobile Notary / Loan Signing",
      enabled: true,
      durationMin: 60,     // how long one appointment blocks a slot
      slotStepMin: 30,     // start times offered every N minutes
      capacity: 3,         // appointments allowed to overlap (number of agents you can dispatch at once)
      leadMinutes: 180,    // earliest bookable time from now
      maxDaysAhead: 60,
      hours: { ...weekdays("08:00", "20:00"), 6: ["09:00", "17:00"] }, // 0 = Sunday
    },
    ron: {
      label: "Remote Online Notarization (RON)",
      enabled: true,
      durationMin: 30,
      slotStepMin: 30,
      capacity: 2,
      leadMinutes: 60,
      maxDaysAhead: 30,
      hours: { 0: ["00:00", "24:00"], 1: ["00:00", "24:00"], 2: ["00:00", "24:00"], 3: ["00:00", "24:00"], 4: ["00:00", "24:00"], 5: ["00:00", "24:00"], 6: ["00:00", "24:00"] },
    },
    rin: {
      label: "Remote Ink-Signed Notarization (RIN)",
      enabled: true,
      durationMin: 45,
      slotStepMin: 30,
      capacity: 1,
      leadMinutes: 1440,   // 24 hours, so paper docs can reach the signer
      maxDaysAhead: 30,
      hours: weekdays("09:00", "17:00"),
    },
  },
  // Fees shown to customers as an estimate. Leave a value null to show
  // "Quoted when we confirm" instead of a number.
  pricing: {
    mobile: { general: null, loan: null, perExtraSigner: null },
    ron: { base: null, perExtraSigner: null },
    rin: { base: null, perExtraSigner: null },
  },
  // States where your RIN notaries are commissioned and RIN is allowed.
  // Verify current law before changing.
  rinStates: ["AL", "MT", "NJ", "SD", "WY"],
  // States where you dispatch mobile notaries today. Shown on the site; other states are "coming soon".
  coverage: { liveStates: ["NJ"] },
  blackouts: [], // [{ date: "2026-11-26", service: "all" | "mobile" | "ron" | "rin", note: "Thanksgiving" }]
  // Automatic dispatch: offer each new booking to the nearest ready notary, then the next one if they
  // decline or don't answer in time.
  dispatch: {
    auto: true,
    offerMinutes: 30,        // how long a notary has to answer an automatic offer
    rushOfferMinutes: 10,    // used when the appointment is less than 4 hours away
    maxOffers: 6,            // stop and alert the desk after this many notaries
  },
  // Default fee offered to notaries on automatic offers (desk can change any job). null = no fee shown.
  notaryFees: { mobile: { general: null, loan: null }, ron: null, rin: null },
  // Closing packages and scanbacks are deleted this many days after a job is completed or canceled.
  documents: { retentionDays: 30 },
  // Billing through Stripe Invoicing.
  billing: {
    termsDays: 30,              // default due date for monthly client invoices
    individualTermsDays: 0,     // individuals pay on receipt
    stripeAch: true,            // Stripe: let clients pay by ACH bank debit (0.8%, max $5) as well as card
    ccEmails: [],               // copy these addresses on every invoice
    defaultNotarialFees: { NJ: { financing: 25, transfer: 15 } }, // per-state caps used as the notarial line
  },
};

function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over === undefined ? base : over;
  if (base && typeof base === "object" && over && typeof over === "object") {
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
    return out;
  }
  return over === undefined ? base : over;
}

module.exports = { DEFAULT_SETTINGS, deepMerge };

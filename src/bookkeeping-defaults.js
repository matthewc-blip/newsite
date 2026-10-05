// Default bookkeeping prices and switches (kept in their own file so config.js can load them without a circular import).
// Everything here is editable in the dashboard under Settings → Bookkeeping; the saved copy wins.
module.exports = {
  open: false,          // true: the page says clients are being accepted and search engines may index it
  showPrices: false,    // true: the page shows starting prices and a live estimate; the desk always sees the estimate
  prices: {             // what the estimate is built from; null means "custom quote"
    t1: { monthly: 250, cleanup: 150, yearEnd: 250 },
    t2: { monthly: 400, cleanup: 250, yearEnd: 350 },
    t3: { monthly: 650, cleanup: 400, yearEnd: 500 },
    t4: { monthly: null, cleanup: null, yearEnd: null },
  },
  includedAccounts: 2,  // bank, card and loan accounts included in the base price
  extraAccount: 25,     // per account beyond that, per month
  payroll: 75,          // per month when payroll needs reconciling
  platforms: {          // monthly adjustment and one-time setup by platform
    qbo: { monthly: 0, setup: 0 },
    xero: { monthly: 0, setup: 0 },
    sheets: { monthly: 75, setup: 0 },
    other: { monthly: 50, setup: 0 },
    none: { monthly: 0, setup: 250 },
  },
};

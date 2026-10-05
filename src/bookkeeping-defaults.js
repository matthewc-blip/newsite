// Default bookkeeping prices and switches (kept in their own file so config.js can load them without a circular import).
// Everything here is editable in the dashboard under Settings → Bookkeeping; the saved copy wins.
// Prices sit in the upper-middle of NJ small-business bookkeeping rates (degree-led, reporting-focused work).
module.exports = {
  open: true,           // true: the page says clients are being accepted and search engines may index it
  showPrices: true,     // true: the page shows starting prices and a live estimate; the desk always sees the estimate
  prices: {             // what the estimate is built from; null means "custom quote"
    t1: { monthly: 450, cleanup: 300, yearEnd: 500 },
    t2: { monthly: 750, cleanup: 450, yearEnd: 750 },
    t3: { monthly: 1200, cleanup: 700, yearEnd: 1000 },
    t4: { monthly: null, cleanup: null, yearEnd: null },
  },
  includedAccounts: 2,  // bank, card and loan accounts included in the base price
  extraAccount: 35,     // per account beyond that, per month
  payroll: 100,         // per month when payroll needs reconciling
  extras: {             // other services sold with the books
    payrollBase: 150,       // per month, payroll processing and NJ payroll filings
    payrollPerEmployee: 12, // per month for each employee on payroll
    filingsMonthly: 75,     // per month, sales tax and annual-report/renewal filing calendar (government fees extra)
    formation: 350,         // one time, business formation: LLC or corporation, EIN, NJ registration (state fees extra)
  },
  platforms: {          // monthly adjustment and one-time setup by platform
    qbo: { monthly: 0, setup: 0 },
    xero: { monthly: 0, setup: 0 },
    sheets: { monthly: 100, setup: 0 },
    other: { monthly: 75, setup: 0 },
    none: { monthly: 0, setup: 400 },
  },
};

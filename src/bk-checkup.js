// Free bookkeeping health check: a short questionnaire about habits, scored on the server.
// It reports on the owner's own answers. It is not tax, legal or accounting advice and it never
// claims to know how the business is doing financially.
const G = "/bookkeeping/guides/";

// Each option: [value, label, points 0-2]. `ask` hides a question unless an earlier answer matches.
const QUESTIONS = [
  { id: "separate", group: "Foundations", text: "Are business money and personal money kept separate?",
    options: [["yes", "Yes, separate business bank account and card", 2], ["some", "Mostly, with some mixing", 1], ["no", "No, it's all mixed together", 0]],
    advice: "Mixed money is the most common source of bookkeeping headaches and makes tax time slower and costlier. Open a business checking account and card, and run only business spending through them.", guide: "separating-personal-and-business-finances" },
  { id: "software", group: "Foundations", text: "What do you use to keep your books?",
    options: [["software", "Accounting software (QuickBooks, Xero, Wave or similar)", 2], ["sheet", "A spreadsheet", 1], ["none", "Nothing, or just my bank statements", 0]],
    advice: "A spreadsheet works for very small operations but gets harder to trust as you grow. Accounting software that imports your bank feeds saves time and makes reports automatic.", guide: "how-to-switch-accounting-software" },
  { id: "current", group: "Foundations", text: "How up to date are your books?",
    options: [["current", "Current through last month", 2], ["behind", "1 to 3 months behind", 1], ["way", "More than 3 months behind, or not started", 0]],
    advice: "Falling behind compounds: each month is harder to reconstruct. A one-time catch-up project followed by a monthly routine is usually the fastest way back.", guide: "how-to-catch-up-on-behind-books" },
  { id: "reconcile", group: "Accuracy", text: "How often are your bank and card accounts reconciled (matched to statements)?",
    options: [["monthly", "Every month", 2], ["rare", "A few times a year", 1], ["never", "Never, or I don't know what that means", 0]],
    advice: "Reconciling is how you find missed transactions, duplicates and errors. Do it monthly, within a week or two of the statement closing.", guide: "how-to-reconcile-a-bank-account" },
  { id: "receipts", group: "Accuracy", text: "Can you find the receipt or invoice behind an expense when you need it?",
    options: [["yes", "Yes, they're saved and organized", 2], ["some", "Some of them", 1], ["no", "Rarely", 0]],
    advice: "Missing records can mean missed deductions and a hard time in an audit. Photograph receipts as you go and store them in your accounting software or a labeled folder.", guide: "how-long-to-keep-business-records" },
  { id: "reports", group: "Accuracy", text: "How often do you look at a profit and loss report?",
    options: [["monthly", "Monthly or quarterly", 2], ["yearly", "Once a year, at tax time", 1], ["never", "Never", 0]],
    advice: "A monthly profit and loss report shows whether you're actually making money and where it goes. Set a recurring time to review it, even if it's only 15 minutes.", guide: "what-to-send-your-bookkeeper-each-month" },
  { id: "receivables", group: "Cash flow", text: "Do you track which customers owe you, and follow up on late payments?",
    options: [["yes", "Yes, on a regular schedule", 2], ["some", "Sometimes", 1], ["no", "No", 0], ["na", "Not applicable, customers pay at the time of service", 2]],
    advice: "Unpaid invoices are cash you've already earned. Send invoices promptly and review an unpaid-invoices list every week.", guide: "what-to-send-your-bookkeeper-each-month" },
  { id: "setaside", group: "Cash flow", text: "Do you set money aside for taxes through the year?",
    options: [["yes", "Yes, a regular amount", 2], ["some", "Sometimes", 1], ["no", "No", 0]],
    advice: "A regular transfer into a separate tax savings account avoids a big surprise bill. Ask your tax preparer what percentage fits your situation.", guide: "bookkeeper-vs-accountant-vs-cpa" },
  { id: "payroll", group: "Payroll and filings", text: "Do you pay employees?",
    options: [["no", "No", 2], ["yes", "Yes", 2]], advice: "", guide: "" },
  { id: "payrolltax", group: "Payroll and filings", text: "Are payroll taxes deposited and filed on time?", ask: ["payroll", "yes"],
    options: [["yes", "Yes, on time", 2], ["unsure", "I'm not sure", 0], ["no", "No, or sometimes late", 0]],
    advice: "Payroll tax mistakes carry penalties and interest. Use a payroll service, and have someone confirm that federal and New Jersey deposits and quarterly filings are current.", guide: "nj-payroll-taxes-and-filings-for-small-employers" },
  { id: "contractors", group: "Payroll and filings", text: "Do you pay independent contractors?",
    options: [["no", "No", 2], ["yes", "Yes, and I collect a W-9 and file 1099s when required", 2], ["unsure", "Yes, but I haven't been tracking it", 0]],
    advice: "Collect a W-9 from each contractor before you pay them, and track payments through the year. Missing 1099 information in January is a scramble and can mean penalties.", guide: "1099-contractors-checklist-for-nj-businesses" },
  { id: "salestax", group: "Payroll and filings", text: "Do you sell goods or services that are subject to New Jersey sales tax?",
    options: [["no", "No, or not sure it applies", 2], ["yes", "Yes, and I collect and file on time", 2], ["unsure", "Yes, but I'm not sure I'm handling it right", 0]],
    advice: "Sales tax is money you hold for the state. Confirm what's taxable for your business, that you're registered, and that returns are filed on schedule.", guide: "nj-sales-tax-for-small-businesses" },
  { id: "preparer", group: "Year-end", text: "When your tax preparer asks for your books, what happens?",
    options: [["clean", "I send clean, reconciled books", 2], ["scramble", "It's a scramble to pull things together", 0], ["none", "I don't use a tax preparer", 1]],
    advice: "Clean books at year end reduce your preparer's time, and your bill. A monthly routine means year end is just another month.", guide: "bookkeeper-vs-accountant-vs-cpa" },
];

const engine = require("./quiz-engine").create({
  questions: QUESTIONS, guideBase: G, title: "Bookkeeping health check",
  disclaimer: "This reflects only your answers. It is general information, not tax, legal or accounting advice, and it can't tell how your finances are doing.",
  levels: ["Solid habits", "Some gaps to close", "Needs attention"],
});
module.exports = engine;

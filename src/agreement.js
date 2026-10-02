// Independent contractor agreement shown to notaries in the portal.
// THIS IS A STARTING TEMPLATE, NOT LEGAL ADVICE. Have an attorney review it for your state before use.
// When you change the text, change VERSION so the dashboard shows who signed which version.
const VERSION = "2026-10-v1";

const TEXT = `INDEPENDENT CONTRACTOR & DATA SECURITY AGREEMENT

This agreement is between MCC Solutions ("MCC") and the notary signing below ("Contractor").

1. Relationship. Contractor is an independent contractor, not an employee, partner or agent of MCC. Contractor decides whether to accept each assignment and controls how the work is performed, subject to state notary law and the signing instructions for each assignment. Contractor is responsible for their own taxes, equipment, supplies, travel and insurance. MCC will issue an IRS Form 1099 when required.

2. Qualifications. Contractor represents that they hold an active notary commission in each state where they perform notarial acts, and will keep current: (a) errors & omissions insurance, (b) a background screening completed within the last 12 months, and (c) any certification required for the assignment. Contractor will notify MCC immediately if any commission, bond or insurance lapses, is suspended or revoked.

3. Performing assignments. Contractor will follow state notary law, verify each signer's identity, keep a notary journal where required, follow the signing instructions provided, review every page for signatures, initials and dates before leaving, return documents within the deadline given, and never give legal advice or explain the legal effect of documents.

4. Confidentiality and data security. Loan and legal documents contain nonpublic personal information. Contractor will: use documents only to complete the assignment; never share, copy or keep them beyond what the assignment requires; store paper documents securely and never leave them unattended in a vehicle; print and scan only on secure devices; delete electronic copies and securely shred any extra paper copies once the assignment is complete and the return is confirmed; and report any lost, stolen or misdelivered documents to MCC within 24 hours.

5. Payment. MCC will pay the fee shown when Contractor accepts an assignment, generally within 30 days after a complete and correct return. Fees may be reduced or withheld for assignments that must be redone because of Contractor error, as agreed case by case.

6. No solicitation. Contractor will not solicit work directly from MCC's clients, title companies, lenders or borrowers introduced through MCC assignments for 12 months after the last assignment.

7. Term. Either party may end this agreement at any time with written notice. Sections 4 and 6 continue after it ends.

8. Indemnity. Each party is responsible for its own acts and omissions. Contractor will indemnify MCC for claims arising from Contractor's negligence, misconduct or violation of notary law.

By typing my full legal name and checking the box, I agree to this agreement and confirm the information I provided is true.`;

// Shorter agreement for witnesses (no notary commission; same confidentiality duties).
const WITNESS_VERSION = "2026-10-w1";
const WITNESS_TEXT = `INDEPENDENT CONTRACTOR & CONFIDENTIALITY AGREEMENT (WITNESS)

This agreement is between MCC Solutions ("MCC") and the person signing below ("Witness").

1. Relationship. Witness is an independent contractor, not an employee, partner or agent of MCC. Witness decides whether to accept each assignment, provides their own transportation, and is responsible for their own taxes. MCC will issue an IRS Form 1099 when required.

2. Role. Witness attends signings to observe and sign as a witness when a document calls for one. Witness does not give legal advice, explain documents, or act as a notary. Witness will not witness a document if they are related to a signer, are named in or benefit from the document, or believe a signer is confused, pressured or not acting willingly; in that case Witness will tell the notary and the desk.

3. Identification and screening. Witness will carry valid government photo ID to every assignment and keeps a current background screening on file with MCC.

4. Confidentiality. Documents and personal information seen at a signing are confidential. Witness will not copy, photograph, share or keep any of it, and will report any lost or misdirected document to MCC within 24 hours.

5. Conduct. Witness arrives on time, dresses professionally, and follows the notary's and the facility's instructions, including hospital and care-facility rules.

6. Payment. MCC pays the fee shown on each accepted assignment after the signing is completed.

7. Non-solicitation. For 12 months after their last assignment, Witness will not solicit MCC clients met through MCC assignments for witness or notary services.

8. Term. Either party may end this agreement at any time with notice. Sections 4 and 7 survive.

By typing their name and checking the box, Witness agrees to these terms.`;

function forRole(role) {
  return role === "witness" ? { version: WITNESS_VERSION, text: WITNESS_TEXT } : { version: VERSION, text: TEXT };
}

module.exports = { forRole, WITNESS_VERSION, WITNESS_TEXT, VERSION, TEXT };
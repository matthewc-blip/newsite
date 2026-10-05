// "Documents we notarize": one plain-language page per document people search for, each linking to the matching services.
// General information, not legal advice. Statements about New Jersey law are kept general on purpose; review once a year.
const T = "We're based in Cranford and send mobile notaries to homes, offices and care facilities in Union and Middlesex counties, including Cranford, Westfield, Elizabeth, Edison and Woodbridge. For other counties, tell us the address and we'll confirm availability before you book.";
const ID = "Every signer needs a current, government-issued photo ID, such as a driver's license or passport, and must be present (in person, or on live video for remote online notarization).";

const DOCS = [
  {
    slug: "quitclaim-deed", category: "Real estate",
    title: "Notarizing a quitclaim deed in New Jersey",
    description: "How a quitclaim deed is notarized in New Jersey: who signs, what to bring, what the notary does, and how the deed gets recorded afterward.",
    services: ["mobile-notary", "document-recording", "estate-planning-notary"], related: ["affidavit-of-title-and-estate-affidavits", "gift-letter"], updated: "2026-10-05",
    intro: "A quitclaim deed moves a person's interest in a property to someone else without promising anything about the title. It's common between family members, after a divorce, or when adding or removing a name.",
    sections: [
      ["What the notary does", ["The person giving up the interest (the grantor) signs the deed in front of a notary, who checks identity and completes an acknowledgment. A deed generally has to be acknowledged before a notary to be recorded.", "The notary can't tell you whether a quitclaim is the right deed, how it affects taxes or a mortgage, or what to write in it. Those questions belong to your attorney or title company."]],
      ["What to have ready", ["The completed deed, with the legal description and the names spelled as they appear on the current deed. Don't sign it before the notary arrives.", ID + " If more than one owner is transferring, each one signs.", "Ask your attorney or the county whether any transfer-fee or consideration forms need to be filed with the deed."]],
      ["After it's signed", ["The signed deed is recorded with the county clerk or register of deeds where the property sits. We can take it to the county and send you the recorded copy, see our document recording service.", T]],
    ],
    faqs: [["Does a quitclaim deed have to be notarized?", "To be recorded, a deed generally needs an acknowledgment taken by a notary. Confirm the requirements for your situation with your attorney or the county."], ["Can you draft the deed?", "No. A notary can't draft documents or give legal advice. Bring the finished deed from your attorney or title company."], ["Do both people have to be there?", "Only the grantors, the people giving up the interest, need to sign before the notary. The person receiving the property usually doesn't."]],
  },
  {
    slug: "affidavit-of-title-and-estate-affidavits", category: "Family and estate",
    title: "Notarizing estate affidavits in New Jersey",
    description: "Affidavits used after a death, such as heirship and survivor affidavits: how they're notarized in New Jersey, who signs, and what to bring.",
    services: ["estate-planning-notary", "mobile-notary", "estate-document-scanning"], related: ["quitclaim-deed", "trust-documents"], updated: "2026-10-05",
    intro: "After someone dies, banks, the motor vehicle commission, title companies and courts often ask family members to sign a sworn statement, an affidavit, about who the heirs are or what the estate includes.",
    sections: [
      ["How the notarization works", ["An affidavit is signed in front of a notary, who confirms the signer's identity and has them swear or affirm that the contents are true. This is called a jurat, and it differs from an acknowledgment.", "The notary can't tell you which affidavit you need or what it should say. The office asking for it, your attorney, or the Surrogate's Court can give you the form."]],
      ["What to bring", ["The affidavit form, filled in but not signed. A death certificate and any other documents the form mentions, if the receiving office asked for them.", ID]],
      ["At a difficult time", ["Many of these signings happen at a family home or a care facility. We can come to you, work around your schedule, and stay until every page is complete.", T]],
    ],
    faqs: [["Does everyone in the family have to sign?", "That depends on the form and who is asking. Follow the instructions from the office or your attorney. Each person who signs must appear before the notary."], ["Can the notary help fill in the affidavit?", "No. We can answer logistical questions, but we can't advise on what to write or which form applies."], ["Can this be done in a hospital or nursing home?", "Yes. We travel to hospitals, rehab centers and care facilities, and we can notarize remotely when that's accepted."]],
  },
  {
    slug: "living-will-and-healthcare-proxy", category: "Family and estate",
    title: "Notarizing a living will or healthcare proxy in New Jersey",
    description: "How advance directives such as a living will and healthcare proxy are notarized in New Jersey, including at hospitals and care facilities.",
    services: ["hospital-notary", "estate-planning-notary", "witness-services"], related: ["trust-documents", "custody-and-guardianship-documents"], updated: "2026-10-05",
    intro: "A living will and a healthcare proxy say who decides about your medical care if you can't, and what you would want. They are often signed quickly, sometimes at a hospital bedside.",
    sections: [
      ["Notary or witnesses", ["New Jersey generally allows these directives to be acknowledged before a notary or signed in front of two adult witnesses. Ask your attorney or the facility which they prefer; many choose a notary.", "If witnesses are needed, we can arrange them. See our witness service."]],
      ["What the notary does", ["The notary checks identity, confirms the signer is acting willingly, and completes the notarial certificate. A notary can't judge medical capacity or advise on the contents.", "If a patient seems unable to understand what they're signing, the notary must decline."]],
      ["What to prepare", ["The directive filled in, ready to sign. A government photo ID for the signer; at a hospital, ask a family member to bring it if it's at home.", T]],
    ],
    faqs: [["Can you come to the hospital?", "Yes. We handle hospital and care facility visits, including evenings and weekends. Call the desk and tell us the facility and room."], ["Does it have to be notarized?", "A notary or two adult witnesses is generally the route in New Jersey. Your attorney can confirm what's best for your document."], ["What if the patient can't sign?", "Rules for signing on someone's behalf are specific. Ask your attorney before the visit so the notary can follow the right process."]],
  },
  {
    slug: "trust-documents", category: "Family and estate",
    title: "Notarizing trust documents in New Jersey",
    description: "Trust agreements, certifications of trust and funding documents: how they're notarized in New Jersey and how to prepare for the signing.",
    services: ["estate-planning-notary", "mobile-notary", "document-recording"], related: ["quitclaim-deed", "living-will-and-healthcare-proxy"], updated: "2026-10-05",
    intro: "Setting up a trust usually involves a stack of documents: the trust agreement, a certification of trust for banks, and deeds or account forms that move assets into the trust.",
    sections: [
      ["Which documents get notarized", ["Trust agreements are often signed before a notary, and the deeds and financial forms used to fund a trust usually require a notarized signature. Your attorney will tell you which pages need it.", "The notary doesn't review the contents of the trust or advise on how it works."]],
      ["How to prepare", ["Get the complete signing set from your attorney and don't sign anything early. Each signer needs a government photo ID. If the set includes a deed, the legal description must already be in it.", "If witnesses are required, tell us in advance so we can bring them."]],
      ["At your home or office", [T, "We can also scan the signed set and send it to your attorney the same day."]],
    ],
    faqs: [["Is a certification of trust the same as the trust?", "No. It's a short summary that lets a bank or title company rely on the trust without seeing the whole agreement. It's commonly notarized."], ["Can you notarize at my attorney's office?", "Yes, and we can also come to your home. Tell us the address and the number of signers."], ["How long does a trust signing take?", "Plan for 30 to 90 minutes, depending on the number of documents and signers."]],
  },
  {
    slug: "prenuptial-and-marital-settlement-agreements", category: "Family and estate",
    title: "Notarizing a prenup or marital settlement agreement in New Jersey",
    description: "How premarital and marital settlement agreements are notarized in New Jersey, what each spouse needs, and why independent counsel matters.",
    services: ["mobile-notary", "witness-services", "business-notary"], related: ["custody-and-guardianship-documents", "trust-documents"], updated: "2026-10-05",
    intro: "A prenuptial agreement or a marital settlement agreement is a legal contract between spouses. Many attorneys have both people sign in front of a notary even where the law doesn't strictly require it.",
    sections: [
      ["What the notary does", ["The notary confirms each spouse's identity and takes an acknowledgment that they signed willingly. New Jersey requires a prenuptial agreement to be in writing and signed by both parties; notarization is common practice and often requested by attorneys.", "A notary can't advise either spouse, explain the terms or act for one side."]],
      ["Preparing", ["Each spouse should have their own attorney review the agreement before signing. Bring the final version and a government photo ID for each person.", "Both spouses should sign at the same appointment unless your attorneys arrange otherwise."]],
      ["Where and when", ["We can meet at an attorney's office, a home or a neutral location, including evenings and weekends. " + T]],
    ],
    faqs: [["Do both spouses have to sign in front of the notary?", "Each signature must be notarized. Doing it together is simplest, but separate appointments work if each person is present when they sign."], ["Can you notarize if only one spouse has a lawyer?", "We notarize signatures; we don't judge the agreement. Whether it holds up is a legal question, so talk to an attorney first."], ["Can this be done remotely?", "Remote online notarization can work for some agreements if all parties and the receiving office accept it. Ask your attorney."]],
  },
  {
    slug: "custody-and-guardianship-documents", category: "Family and estate",
    title: "Notarizing guardianship and caregiver forms in New Jersey",
    description: "Caregiver authorizations, guardianship affidavits and parental consent forms: how they're notarized in New Jersey and what to bring.",
    services: ["child-travel-consent", "passport-consent-form", "mobile-notary"], related: ["living-will-and-healthcare-proxy", "notarized-letter-and-affidavit-of-identity"], updated: "2026-10-05",
    intro: "Families sign notarized forms to let a relative handle school, medical or travel matters for a child, or to support a court filing about custody or guardianship.",
    sections: [
      ["Common forms", ["Caregiver or temporary authorization forms, parental consent for medical care, consent for a child's travel or passport, and affidavits that go into a court filing. We notarize the signature on each one.", "We can't tell you which form you need, fill it in, or give legal advice about custody."]],
      ["What to bring", ["The completed form, unsigned, and a photo ID for each person signing. If a court or school gave you instructions, bring them so we can follow the same wording.", "For passport and travel consent forms, the other parent's ID copy may be required; check the form."]],
      ["Convenient hours", [T]],
    ],
    faqs: [["Do both parents have to sign?", "That depends on the form and the agency. Follow its instructions. Each parent who signs must appear before a notary."], ["Does the child need to be there?", "Usually not, unless the form says so. Check the instructions on the specific form."], ["Is a notarized form accepted everywhere?", "Acceptance depends on the school, doctor, court or agency. Ask them what they need before you sign."]],
  },
  {
    slug: "gift-letter", category: "Real estate",
    title: "Notarizing a mortgage gift letter in New Jersey",
    description: "Gift letters for mortgage down payments: when lenders ask for notarization, who signs, and how to get it done quickly in New Jersey.",
    services: ["mobile-notary", "loan-signing-agent", "remote-online-notarization"], related: ["quitclaim-deed", "notarized-letter-and-affidavit-of-identity"], updated: "2026-10-05",
    intro: "When a family member gives money toward a home purchase, the lender usually wants a signed gift letter stating that the money is a gift and doesn't have to be repaid.",
    sections: [
      ["When it needs a notary", ["Not every lender requires notarization, but some ask for it. Check with your loan officer, because requirements vary by lender and loan type.", "The notary witnesses the signature and takes the notarial act the lender specifies. We can't write the letter, but your lender will usually give you the form."]],
      ["Speed matters", ["Gift letters often come up late in the process, close to a closing deadline. We offer fast scheduling, evenings and weekends, and remote online notarization when the lender accepts it."]],
      ["What to bring", ["The lender's gift letter form, completed but not signed, and government photo ID for the donor. " + T]],
    ],
    faqs: [["Who signs the gift letter?", "Usually the person giving the money, and often the buyer too. Follow your lender's form."], ["Can this be notarized online?", "Often yes with remote online notarization, if your lender accepts it. Ask them first."], ["How fast can you do it?", "Call the desk with the address and deadline. Same-day appointments are sometimes possible; we confirm before you book."]],
  },
  {
    slug: "operating-agreement-and-corporate-resolutions", category: "Business",
    title: "Notarizing an LLC operating agreement in New Jersey",
    description: "Operating agreements, corporate resolutions and banking forms: when New Jersey businesses need a notary and how to prepare.",
    services: ["business-notary", "mobile-notary", "remote-online-notarization"], related: ["commercial-lease-and-business-contracts", "business-loan-documents"], updated: "2026-10-05",
    intro: "Banks, lenders and investors sometimes ask for a notarized operating agreement, corporate resolution or certificate of incumbency, even when the law doesn't require it.",
    sections: [
      ["Who asks for it", ["Banks opening accounts, lenders reviewing loans, and parties to a deal often want notarized signatures from every owner or officer. The request comes from them, so check what they need.", "We notarize the signatures. We don't draft the agreement or advise on how to structure your company."]],
      ["What to prepare", ["The final document, unsigned. Every person signing needs a government photo ID, and a signer acting for a company should be ready to state their title.", "If signers are in different places, remote online notarization lets each person sign on video."]],
      ["Convenient for owners", ["We come to your office, shop or home, and can arrange evening or weekend appointments. " + T]],
    ],
    faqs: [["Does an LLC operating agreement have to be notarized?", "Not as a general rule, but a bank, lender or partner may require it. Ask whoever is requesting it."], ["Can partners in different states sign?", "Remote online notarization can handle signers in different places, if the receiving party accepts it."], ["Can you notarize for my company officer?", "Yes. The officer signs in front of the notary with valid ID. We don't verify authority to act for the company; that's your documents' job."]],
  },
  {
    slug: "commercial-lease-and-business-contracts", category: "Business",
    title: "Notarizing a commercial lease or business contract in New Jersey",
    description: "When business contracts and commercial leases are notarized in New Jersey, and how to schedule a mobile notary for owners and tenants.",
    services: ["business-notary", "mobile-notary", "document-courier"], related: ["operating-agreement-and-corporate-resolutions", "business-loan-documents"], updated: "2026-10-05",
    intro: "Most contracts are valid without a notary, but landlords, lenders and other parties sometimes ask for notarized signatures to reduce the risk of disputes about who signed.",
    sections: [
      ["What we notarize", ["Leases, guaranties, NDAs, vendor and employment agreements, and affidavits that go with them. We notarize signatures; we don't review terms or advise on the deal."]],
      ["Getting it signed", ["Have the final version ready. Every signer needs a government photo ID. Guarantors sign too, and each signature is notarized separately.", "If copies need to reach several parties, our courier and scan-back services can deliver them."]],
      ["Scheduling", ["We offer weekday evenings and Saturdays, which helps owners who can't leave work. " + T]],
    ],
    faqs: [["Does a lease have to be notarized?", "Generally no, but some landlords and lenders require it. Follow the instructions you were given."], ["Can you notarize at the landlord's office?", "Yes, anywhere we can reach. We also offer remote online notarization if all parties accept it."], ["Can you keep the originals?", "We return signed originals as directed and can scan or courier them. Tell us who should receive them."]],
  },
  {
    slug: "business-loan-documents", category: "Business",
    title: "Notarizing business loan and SBA documents in New Jersey",
    description: "Signing business loan packages, guaranties and SBA forms with a New Jersey notary, in person or remotely.",
    services: ["private-lender-signings", "loan-signing-agent", "business-notary"], related: ["operating-agreement-and-corporate-resolutions", "commercial-lease-and-business-contracts"], updated: "2026-10-05",
    intro: "Business loans come with long signing packages: notes, guaranties, security agreements and certifications. Lenders often require notarized signatures from every owner and guarantor.",
    sections: [
      ["How a loan signing works", ["A signing agent meets the borrowers, confirms identity, has them sign where the lender indicates, and notarizes the pages that require it. We then return the package as the lender instructs and can send scan-backs.", "We can't explain loan terms or advise you whether to sign. Questions about the loan go to your lender or attorney."]],
      ["Before the appointment", ["Review the package with your lender or attorney first. Bring government photo ID for each signer, and a pen with black ink. Lenders often specify delivery by courier on the same day."]],
      ["Private and hard-money lenders", ["We also handle private-lender and investor loan signings, including LLC borrowers and guarantors. " + T]],
    ],
    faqs: [["Can you handle a long package?", "Yes. Tell us the page count and deadline, and we'll confirm timing before you book."], ["Do guarantors have to be there?", "Each guarantor who signs must be identified and present, in person or on live video where permitted."], ["Do you ship the package back?", "We return documents as the lender directs and provide tracking."]],
  },
  {
    slug: "bill-of-sale", category: "Vehicles and property",
    title: "Notarizing a bill of sale in New Jersey",
    description: "When a bill of sale needs a notary in New Jersey, what to bring for a vehicle, boat or trailer sale, and how to schedule a mobile notary.",
    services: ["vehicle-title-notary", "mobile-notary", "business-notary"], related: ["lost-title-affidavit", "notarized-letter-and-affidavit-of-identity"], updated: "2026-10-05",
    intro: "A bill of sale records that something was sold, for how much and on what date. People use one for cars, boats, trailers and equipment, and the buyer or a state agency sometimes asks for it to be notarized.",
    sections: [
      ["Does it need a notary?", ["That depends on what's sold and who asks. The Motor Vehicle Commission and other states have their own rules, so check the form the agency tells you to use. When a notary is required, both the buyer and seller should sign in front of one."]],
      ["What to bring", ["The bill of sale and the title, if there is one, signed only in front of the notary where the title says so. Photo ID for each person. Vehicle identification number, sale price and date.", "We notarize signatures; we can't tell you about taxes or registration."]],
      ["Mobile appointments", ["We can meet at the seller's home, the dealer or a parking lot, evenings and weekends included. " + T]],
    ],
    faqs: [["Do both buyer and seller sign in front of the notary?", "Usually yes, when notarization is required. Each person needs photo ID."], ["Can you notarize a title transfer?", "We notarize where a title or form calls for it. See our vehicle title notary page."], ["What if the seller isn't local?", "Remote online notarization may work when the receiving agency accepts it. Check first."]],
  },
  {
    slug: "lost-title-affidavit", category: "Vehicles and property",
    title: "Notarizing a lost title affidavit in New Jersey",
    description: "Replacement title and lost-title affidavits: how a New Jersey notary witnesses them and what you need to bring.",
    services: ["vehicle-title-notary", "mobile-notary", "document-courier"], related: ["bill-of-sale", "notarized-letter-and-affidavit-of-identity"], updated: "2026-10-05",
    intro: "If a vehicle or boat title is lost or damaged, the state may ask you to sign a sworn statement before replacing it. The notary witnesses your signature on that statement.",
    sections: [
      ["How it works", ["You sign the affidavit or application in front of a notary, who confirms your identity and takes a jurat if the form requires you to swear to the contents. Use the exact form the agency tells you to use; we can't pick one for you."]],
      ["What to bring", ["The completed form, unsigned, plus a government photo ID. Details of the vehicle such as the VIN, make, model and year help you complete the form correctly. If there is a lienholder, the form may have extra steps."]],
      ["Getting it filed", ["We can deliver the signed form to the agency or return it to you, and scan a copy for your records. " + T]],
    ],
    faqs: [["Which form do I use?", "The agency that issues the title, such as the New Jersey MVC or another state's office, provides it. We can't choose or complete it for you."], ["Does the buyer need to sign too?", "Only if the form says so."], ["How long does it take?", "The signing takes about 15 minutes. Processing time is up to the agency."]],
  },
  {
    slug: "proof-of-life-certificate", category: "International",
    title: "Proof of life and life certificate notarization in New Jersey",
    description: "Notarizing a proof of life or life certificate for a pension or benefit paid from abroad, including at home or by live video.",
    services: ["mobile-notary", "remote-online-notarization", "apostille-services"], related: ["notarized-letter-and-affidavit-of-identity", "diploma-birth-and-marriage-certificate-apostille"], updated: "2026-10-05",
    intro: "Pension and benefit offices in other countries often ask retirees to prove they are alive each year. A notary can witness your signature on the life certificate form.",
    sections: [
      ["What the notary does", ["You sign the form in front of the notary, who confirms your identity and completes the notarial certificate. Some offices also want an apostille or a witness's statement; read the instructions on your form."]],
      ["Easier for older adults", ["We can come to your home or care facility, and remote online notarization can work if the pension office accepts it. Many retirees prefer a visit so they don't have to travel."]],
      ["Before we come", ["Bring the form, unsigned, and a government photo ID or passport. If the form needs an apostille, we can arrange it. " + T]],
    ],
    faqs: [["Will the pension office accept a New Jersey notary?", "Most do, but some require an apostille or a specific wording. Check the form's instructions."], ["Can this be done online?", "Sometimes, if the office accepts remote notarization. Ask them before the session."], ["How often do I need it?", "That depends on the payer, often yearly."]],
  },
  {
    slug: "notarized-letter-and-affidavit-of-identity", category: "Everyday",
    title: "Notarized letters and affidavits in New Jersey",
    description: "Notarizing a letter, affidavit of identity, residence or name affirmation in New Jersey: how it works and what to bring.",
    services: ["mobile-notary", "remote-online-notarization", "hospital-notary"], related: ["gift-letter", "custody-and-guardianship-documents"], updated: "2026-10-05",
    intro: "Schools, banks, employers and agencies sometimes ask for a signed statement that's been notarized, such as a letter confirming where you live, who you are, or that two names belong to the same person.",
    sections: [
      ["Letter or affidavit", ["For a letter, the notary witnesses your signature and completes an acknowledgment. For an affidavit, you swear or affirm the statement is true, which is a jurat. Ask the requesting office which wording they want.", "We can't write the letter for you or advise you on what to say."]],
      ["What to bring", ["The finished letter, unsigned, and a government photo ID. Bring any instruction sheet from the school or agency so we can match the wording they require."]],
      ["Quick scheduling", ["Many of these come up with a deadline. Call the desk for the earliest slot, including evenings and weekends. " + T]],
    ],
    faqs: [["Can you write the letter?", "No. A notary can't draft documents or give legal advice. We notarize the signature."], ["What's the difference between a letter and an affidavit?", "An affidavit is sworn to be true. A signed letter is only acknowledged. The requester tells you which one they need."], ["Can this be done on video?", "Often yes, with remote online notarization, when the receiving party accepts it."]],
  },
  {
    slug: "diploma-birth-and-marriage-certificate-apostille", category: "International",
    title: "Apostille for diplomas and birth certificates in NJ",
    description: "Which documents need an apostille for use abroad, which New Jersey office issues it, and how we help with the notarization and handling.",
    services: ["apostille-services", "embassy-legalization", "certified-translation"], related: ["proof-of-life-certificate", "notarized-letter-and-affidavit-of-identity"], updated: "2026-10-05",
    intro: "Schools, employers and governments abroad often want apostilled documents: diplomas, transcripts, birth and marriage certificates, background checks and powers of attorney.",
    sections: [
      ["Start with the right document", ["Vital records usually need a certified copy from the issuing office. A diploma or transcript may need to be notarized first, often with a statement from the school's registrar. The rules differ by document, so check what the destination asks for."]],
      ["How we help", ["We handle the notarization where it's needed, submit the request to the New Jersey office that issues apostilles, and track the return. For countries that don't accept apostilles, see embassy legalization. If your documents need translating, we can arrange a certified translation."]],
      ["Plan ahead", ["Government processing times change, so start early. For steps in order, read our guide to getting an apostille in New Jersey. " + T]],
    ],
    faqs: [["Can New Jersey apostille a document from another state?", "No. Each state apostilles its own documents. Federal documents go through the U.S. Department of State."], ["Does a diploma need a notary first?", "Often, with a statement from the school. The requirements vary, so ask the destination or call us."], ["How long does it take?", "It depends on the state's current workload. We give you a realistic estimate when you start."]],
  },
];

const docPath = (d) => `/notary/documents/${d.slug}`;
const DOCS_HUB = "/notary/documents";
const DOC_CATEGORIES = ["Real estate", "Family and estate", "Business", "Vehicles and property", "International", "Everyday"];
module.exports = { DOCS, docPath, DOCS_HUB, DOC_CATEGORIES };

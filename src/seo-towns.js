// Local landing pages for the 21 Union County towns: notary, bookkeeping, and websites/local SEO.
// Each page is built from real, checkable local detail (landmarks, train lines, hospitals, business districts)
// plus the service's real scope and prices. Nothing here claims results, reviews or clients we don't have.
const { getSettings } = require("./db");
const prices = require("./prices");

const T = (slug, name, kind, zips, line, anchors, notary, biz, near) => ({ slug, name, kind, zips, line, anchors, notary, biz, near });
const TOWNS = [
  T("elizabeth", "Elizabeth", "city", "07201 to 07208", "Elizabeth is Union County's seat and its largest city, home to the county courthouse and the county clerk's office.",
    ["Union County Courthouse", "Trinitas Regional Medical Center", "Elizabeth train station on the Northeast Corridor", "Jersey Gardens", "Port Newark-Elizabeth Marine Terminal"],
    "Attorney-ordered affidavits and powers of attorney are common because the courthouse is here, and many households are bilingual, so we confirm language needs when you book. Hospital and rehab visits are routine.",
    "Logistics and import-export firms, small retailers, restaurants and contractors, many of them family-run and owner-operated.",
    ["hillside", "roselle", "linden", "union"]),
  T("westfield", "Westfield", "town", "07090 and 07091", "Westfield is a residential town with a busy downtown around its NJ Transit Raritan Valley Line station.",
    ["downtown Westfield", "Westfield train station", "the Garden State Parkway", "Route 28"],
    "Most signings here are home purchases, refinances and estate paperwork at the kitchen table. Evening appointments are popular with commuters.",
    "Boutiques, restaurants, medical and dental practices, real estate and professional offices around downtown.",
    ["cranford", "garwood", "scotch-plains", "mountainside", "clark", "fanwood"]),
  T("cranford", "Cranford", "township", "07016", "Cranford is where MCC Solutions is based, a township along the Rahway River with a walkable downtown and a Raritan Valley Line station.",
    ["downtown Cranford", "the Rahway River", "Cranford train station", "the Garden State Parkway"],
    "Because the desk is here, Cranford is our fastest turnaround: same-day signings are often possible and travel is short.",
    "Downtown shops and restaurants, contractors, real estate offices and home-based businesses.",
    ["westfield", "garwood", "kenilworth", "clark", "springfield", "roselle-park"]),
  T("summit", "Summit", "city", "07901", "Summit is a commuter city with a lively downtown and a Midtown Direct train line to New York.",
    ["downtown Summit", "Overlook Medical Center", "Summit train station", "Route 24"],
    "Hospital and care-facility visits are frequent because Overlook Medical Center is here, alongside high-value residential closings and estate signings.",
    "Professional and financial offices, boutiques, restaurants and medical practices.",
    ["new-providence", "berkeley-heights", "springfield", "mountainside"]),
  T("plainfield", "Plainfield", "city", "07060, 07062 and 07063", "Plainfield is a city of historic districts and older homes, with rail service on the Raritan Valley Line.",
    ["Plainfield train station", "the city's historic districts", "downtown Plainfield", "Route 22 and Park Avenue"],
    "Older homes and long-held family property mean estate paperwork, deeds and powers of attorney come up often, along with purchases and refinances.",
    "Neighborhood restaurants and shops, contractors and trades, home-care businesses and nonprofits.",
    ["fanwood", "scotch-plains", "westfield"]),
  T("linden", "Linden", "city", "07036", "Linden is an industrial and residential city on the Rahway River, home to the Bayway refinery and Linden Airport.",
    ["Route 1 and 9", "the Bayway refinery area", "Linden Airport", "downtown Linden"],
    "Shift schedules mean early-morning and evening appointments are common. Residential closings and vehicle title paperwork are frequent.",
    "Trucking, auto repair, trades, warehousing and neighborhood retail.",
    ["rahway", "roselle", "elizabeth", "winfield", "clark"]),
  T("rahway", "Rahway", "city", "07065", "Rahway is a river city with an arts district downtown, a Northeast Corridor train station and the Union County Performing Arts Center.",
    ["Union County Performing Arts Center", "downtown Rahway", "Rahway train station", "RWJ Rahway hospital"],
    "Hospital and care-facility visits come up because RWJ Rahway is here, along with residential purchases and refinances near the train line.",
    "Restaurants and arts-district businesses, trades and contractors, and professional offices.",
    ["linden", "clark"]),
  T("union", "Union", "township", "07083", "Union Township is a large suburban township along Route 22, home to Kean University and the Union Center business district.",
    ["Kean University", "Union Center", "Route 22", "Galloping Hill Road"],
    "Route 22 offices and busy households make flexible scheduling important, and we meet at homes, offices and campus-area locations.",
    "Route 22 retail and auto businesses, restaurants, medical offices and trades.",
    ["elizabeth", "hillside", "springfield", "kenilworth", "roselle-park"]),
  T("scotch-plains", "Scotch Plains", "township", "07076", "Scotch Plains is a residential township bordering Westfield, Fanwood and Plainfield, with a shopping area along Park Avenue.",
    ["Park Avenue", "Route 22", "the Westfield and Fanwood borders"],
    "Home purchases, refinances and estate signings dominate. Evening and weekend appointments are easy to arrange.",
    "Neighborhood retail and restaurants, medical and dental offices, and home-based consultants.",
    ["fanwood", "westfield", "plainfield", "mountainside"]),
  T("fanwood", "Fanwood", "borough", "07023", "Fanwood is a small residential borough on the Raritan Valley Line, between Westfield, Scotch Plains and Plainfield.",
    ["Fanwood train station", "the Fanwood town center", "the Scotch Plains and Plainfield borders"],
    "Quiet residential signings: purchases, refinances and family paperwork at home.",
    "Small downtown shops, home-based businesses and local trades.",
    ["scotch-plains", "plainfield", "westfield"]),
  T("garwood", "Garwood", "borough", "07027", "Garwood is a compact borough between Cranford and Westfield with its own Raritan Valley Line station.",
    ["Garwood train station", "the Garwood business district", "the Cranford and Westfield borders"],
    "Because we are based in neighboring Cranford, Garwood signings are quick to reach and often same-day.",
    "Small restaurants and shops, contractors and home-based businesses.",
    ["cranford", "westfield"]),
  T("kenilworth", "Kenilworth", "borough", "07033", "Kenilworth is a small borough with a large industrial and pharmaceutical presence along its Garden State Parkway edge.",
    ["the Kenilworth industrial area", "the Garden State Parkway", "the Cranford and Union borders"],
    "A mix of employee and resident signings: powers of attorney, estate documents and home purchases, often before or after work.",
    "Industrial and distribution businesses, trades, and small service firms.",
    ["cranford", "union", "roselle-park", "springfield"]),
  T("roselle", "Roselle", "borough", "07203", "Roselle is a residential borough next to Elizabeth and Linden, a short drive from the Northeast Corridor.",
    ["Chestnut Street", "the Roselle Park and Elizabeth borders", "Route 1 and 9 corridor"],
    "Home purchases, refinances and family paperwork, with hospital visits at nearby Elizabeth and Rahway facilities.",
    "Neighborhood shops, restaurants, contractors and service businesses.",
    ["roselle-park", "elizabeth", "linden", "cranford"]),
  T("roselle-park", "Roselle Park", "borough", "07204", "Roselle Park is a compact borough with a Raritan Valley Line station and a small downtown.",
    ["Roselle Park train station", "Chestnut Street", "the Cranford, Union and Kenilworth borders"],
    "Compact and easy to reach from our Cranford base, so same-day signings are often possible.",
    "Small downtown retail and restaurants, trades and home-based businesses.",
    ["roselle", "kenilworth", "union", "cranford"]),
  T("springfield", "Springfield", "township", "07081", "Springfield is a township along Route 22 and Mountain Avenue, known for its role in the 1780 Battle of Springfield.",
    ["Route 22", "Mountain Avenue", "Springfield's historic sites"],
    "Home purchases and refinances in the township, and attorney-ordered paperwork from the Route 22 offices.",
    "Route 22 retail, professional offices, medical practices and restaurants.",
    ["union", "summit", "mountainside", "kenilworth", "cranford", "berkeley-heights"]),
  T("mountainside", "Mountainside", "borough", "07092", "Mountainside is a quiet borough beside the Watchung Reservation and its Trailside Nature and Science Center.",
    ["Watchung Reservation", "Trailside Nature and Science Center", "Route 22"],
    "Residential signings: purchases, refinances and estate documents in a mostly single-family community.",
    "Professional and medical offices on Route 22, home-based consultants and trades.",
    ["westfield", "scotch-plains", "springfield", "berkeley-heights"]),
  T("clark", "Clark", "township", "07066", "Clark is a residential township with a Garden State Parkway interchange, between Rahway, Westfield and Cranford.",
    ["the Garden State Parkway", "Westfield Avenue", "the Rahway and Cranford borders"],
    "Home purchases, refinances and family paperwork, and easy reach from Cranford or Rahway.",
    "Neighborhood retail and restaurants, medical offices, trades and home-based businesses.",
    ["rahway", "westfield", "cranford", "linden"]),
  T("berkeley-heights", "Berkeley Heights", "township", "07922", "Berkeley Heights is a residential township in the Murray Hill and Passaic Valley area, next to Summit and New Providence.",
    ["Murray Hill", "Springfield Avenue", "the Summit and New Providence borders"],
    "Residential closings and estate signings, with many professionals who prefer evening appointments.",
    "Professional services, consultants, medical offices and home-based businesses.",
    ["summit", "new-providence", "mountainside", "springfield"]),
  T("new-providence", "New Providence", "borough", "07974", "New Providence is a small residential borough in the Murray Hill area, next to Summit and Berkeley Heights.",
    ["Murray Hill", "the New Providence town center", "the Summit border"],
    "Residential signings at home and in nearby Summit, including hospital visits at Overlook Medical Center.",
    "Professional services, consultants, small shops and home-based businesses.",
    ["summit", "berkeley-heights", "springfield"]),
  T("hillside", "Hillside", "township", "07205", "Hillside is a township on the Newark and Elizabeth border, near Newark Liberty Airport and the Route 22 corridor.",
    ["Route 22", "the Newark and Elizabeth borders", "Newark Liberty Airport"],
    "Home purchases, refinances and family paperwork, and a good fit for travelers: airport-area signings are easy to schedule.",
    "Warehousing, trades, auto businesses, restaurants and neighborhood retail.",
    ["elizabeth", "union"]),
  T("winfield", "Winfield", "township", "07036", "Winfield is one of Union County's smallest townships, beside Linden and Roselle.",
    ["the Linden and Roselle borders", "Route 1 and 9 corridor"],
    "A small community, so we usually combine Winfield visits with nearby Linden and Roselle appointments.",
    "Home-based businesses, trades and small local firms.",
    ["linden", "cranford", "roselle"]),
];
const BY = Object.fromEntries(TOWNS.map((t) => [t.slug, t]));
const KIND = { city: "City of", town: "Town of", township: "Township of", borough: "Borough of" };

const notaryPath = (t) => `/notary/new-jersey/union-county/${t.slug}`;
const bookPath = (t) => `/bookkeeping/${t.slug}-nj`;
const webPath = (t) => `/websites/${t.slug}-nj`;
const list = (a) => a.length < 3 ? a.join(" and ") : a.slice(0, -1).join(", ") + ", and " + a[a.length - 1];

function register(app, c) {
  const { layout, business, base, faqHtml, faqSchema, crumbSchema, esc, telHref } = c;
  const nearLinks = (t, pathFn) => `<ul class="county-links">${t.near.map((s) => BY[s]).filter(Boolean).map((n) => `<li><a href="${pathFn(n)}">${esc(n.name)}</a></li>`).join("")}</ul>`;
  const allLinks = (pathFn, skip) => `<ul class="county-links">${TOWNS.filter((n) => n.slug !== skip).map((n) => `<li><a href="${pathFn(n)}">${esc(n.name)}</a></li>`).join("")}</ul>`;
  const svc = (url, name, type, desc, path, t) => ({ "@type": "Service", name, serviceType: type, description: desc, url: url + path,
    provider: { "@type": "ProfessionalService", name: "MCC Solutions", url: url + "/", address: { "@type": "PostalAddress", addressLocality: "Cranford", addressRegion: "NJ", addressCountry: "US" } },
    areaServed: { "@type": "City", name: `${t.name}, NJ` } });

  /* ----- notary ----- */
  app.get("/notary/new-jersey/union-county/:town", async (req, res, next) => {
    const t = BY[req.params.town];
    if (!t) return next();
    const biz = await business(); const url = base(req); const path = notaryPath(t);
    const settings = await getSettings().catch(() => null);
    const mobile = settings ? prices.forSlug(settings, "mobile-notary") : null;
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["New Jersey", "/notary/new-jersey"], ["Union County", "/notary/new-jersey/union-county"], [t.name, path]];
    const faqs = [
      [`Can a notary come to my home or office in ${t.name}?`, `Yes. MCC Solutions sends commissioned New Jersey notaries to homes, offices, hospitals and care facilities in ${t.name} (${t.zips}). Book online or call the desk and we will confirm a time and a firm fee before anyone is dispatched.`],
      [`How fast can I get a notary in ${t.name}?`, `Same-day appointments are often possible in Union County, and ${t.name} is close to our Cranford base. For the best choice of times, book a day ahead. Anything under four hours, call the desk.`],
      [`Do you handle loan signings in ${t.name}?`, `Yes. Loan signing agents handle purchases, refinances, HELOCs and reverse mortgages in ${t.name}. Printing and scanbacks are included, and we coordinate with your title company or lender.`],
      [`Where do I record a deed signed in ${t.name}?`, `Deeds for ${t.name} are recorded with the Union County Clerk in Elizabeth. We can notarize the deed here, and our document recording service can file it for you.`],
      [`What should I have ready for a notary visit in ${t.name}?`, `An unexpired government photo ID for every signer, the complete documents (unsigned), and every signer present. A notary cannot give legal advice or choose the document for you.`],
    ];
    res.send(layout({
      req, biz, path, crumbs,
      title: `Mobile Notary in ${t.name}, NJ | Loan Signing Agent | MCC`,
      description: `Mobile notary and loan signing agents in ${t.name}, NJ (${t.zips}). Home, office and hospital visits, same-day when available. Book online.`,
      body: {
        hero: `<p class="eyebrow">Union County · ${esc(t.name)}, NJ</p><h1 style="margin-top:10px">Mobile notary and loan signing agents in ${esc(t.name)}, NJ</h1><p class="lede" style="margin-top:14px">MCC Solutions is a Cranford, NJ firm that sends commissioned notaries and certified signing agents to ${esc(t.name)} homes, offices, hospitals and care facilities.${mobile ? ` Mobile notary visits start at ${prices.money(mobile.price)}, plus state notarial fees.` : ""}</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/notary/#order">Book a notary in ${esc(t.name)}</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call the desk</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">About ${esc(t.name)}</p><h2>Signing in ${esc(t.name)}</h2><p class="lede">${esc(t.line)}</p><p>${esc(t.notary)}</p></div>
          <div class="stack"><h3>Places we work in and around ${esc(t.name)}</h3><ul class="checks">${t.anchors.map((a) => `<li>${esc(a)}</li>`).join("")}</ul><p style="color:var(--muted);font-size:.9rem">ZIP codes: ${esc(t.zips)}.</p></div>
        </div></section>
        <section class="band alt"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">What we handle</p><h2>Notary services in ${esc(t.name)}</h2></div>
          <div class="grid g3">
            <a class="svc" href="/notary/mobile-notary"><span class="code">MOBILE</span><h3>Mobile notary</h3><p>We come to you in ${esc(t.name)}: home, office, bank or care facility.</p><span class="more">Mobile notary →</span></a>
            <a class="svc" href="/notary/loan-signing-agent"><span class="code">LOANS</span><h3>Loan signing</h3><p>Purchases, refinances, HELOCs and reverse mortgages, with printing and scanbacks included.</p><span class="more">Loan signing →</span></a>
            <a class="svc" href="/notary/hospital-notary"><span class="code">CARE</span><h3>Hospital and care-facility visits</h3><p>Powers of attorney and healthcare directives signed at the bedside.</p><span class="more">Hospital notary →</span></a>
            <a class="svc" href="/notary/estate-planning-notary"><span class="code">ESTATE</span><h3>Estate documents</h3><p>Wills, trusts, powers of attorney and deeds, notarized with the right witnesses.</p><span class="more">Estate notary →</span></a>
            <a class="svc" href="/notary/document-recording"><span class="code">FILE</span><h3>Document recording</h3><p>We file your deed or document with the Union County Clerk.</p><span class="more">Recording →</span></a>
            <a class="svc" href="/notary/process-serving"><span class="code">SERVE</span><h3>Process serving</h3><p>Court papers served in ${esc(t.name)} for attorneys and individuals.</p><span class="more">Process serving →</span></a>
          </div>
        </div></section>
        <section class="band"><div class="wrap" style="max-width:860px">
          <div class="sec-head"><p class="eyebrow">FAQ</p><h2>${esc(t.name)} notary questions</h2></div>
          ${faqHtml(faqs)}
          <h3 style="margin-top:36px;margin-bottom:12px">Nearby towns we also serve</h3>${nearLinks(t, notaryPath)}
          <p style="margin-top:14px;color:var(--ink-2)">More local services in ${esc(t.name)}: <a href="${bookPath(t)}">bookkeeping for ${esc(t.name)} businesses</a> · <a href="${webPath(t)}">websites and local SEO</a> · <a href="/notary/new-jersey/union-county">Union County overview</a></p>
        </div></section>`,
        ctaTitle: `Need a notary in ${t.name}? Send it to the desk.`,
      },
      schema: [svc(url, `Mobile notary in ${t.name}`, "Mobile notary", `Mobile notary and loan signing agents in ${t.name}, NJ.`, path, t), faqSchema(faqs), crumbSchema(url, crumbs)],
    }));
  });

  /* ----- bookkeeping ----- */
  app.get("/bookkeeping/:town", async (req, res, next) => {
    const m = /^([a-z-]+)-nj$/.exec(req.params.town); const t = m && BY[m[1]];
    if (!t) return next();
    const settings = await getSettings().catch(() => null);
    const bk = settings && settings.bookkeeping;
    const biz = await business(); const url = base(req); const path = bookPath(t);
    const t1 = bk && bk.showPrices && bk.prices && bk.prices.t1 && bk.prices.t1.monthly;
    const crumbs = [["MCC Solutions", "/"], ["Bookkeeping", "/bookkeeping/"], [`${t.name}, NJ`, path]];
    const faqs = [
      [`Do you work with ${t.name} businesses in person?`, `We are based in Cranford, a short drive from ${t.name}. Most bookkeeping is done online in your accounting software, and we are happy to meet in person when it helps.`],
      [`What does monthly bookkeeping for a ${t.name} business include?`, `Categorizing transactions, reconciling bank and card accounts, and monthly financial reports, in QuickBooks Online, Xero or another platform. Payroll processing and NJ filings can be added.`],
      [`My books are behind. Can you catch me up?`, `Yes. Cleanup work brings past months up to date and reconciled before regular monthly service begins. We give a written quote first.`],
      [`Do you file NJ payroll and sales tax?`, `We can prepare and file NJ payroll reports and sales tax filings as an add-on, along with annual report and renewal reminders. Government fees are extra.`],
      [`How much does it cost?`, t1 ? `Monthly bookkeeping starts at $${t1} for the smallest tier and rises with transaction volume. The bookkeeping page has a live estimate, and we confirm a written quote before starting.` : `Pricing depends on transaction volume and how far behind the books are. Request a quote on the bookkeeping page and we reply with a written estimate.`],
    ];
    res.send(layout({
      req, biz, path, crumbs, noindex: !(bk && bk.open),
      title: `Bookkeeping for ${t.name}, NJ Small Businesses | MCC Solutions`,
      description: `Monthly bookkeeping, cleanup, payroll and NJ filings for ${t.name}, NJ small businesses. Based in Cranford.${t1 ? ` Starting at $${t1}/month.` : ""}`,
      body: {
        hero: `<p class="eyebrow">Union County · ${esc(t.name)}, NJ</p><h1 style="margin-top:10px">Bookkeeping for ${esc(t.name)}, NJ small businesses</h1><p class="lede" style="margin-top:14px">MCC Solutions keeps the books for small businesses in ${esc(t.name)} and across Union County: monthly bookkeeping, catch-up cleanup, payroll and NJ filings, from a firm based in nearby Cranford.${t1 ? ` Monthly bookkeeping starts at $${t1}.` : ""}</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/bookkeeping/#interest">Get a bookkeeping quote</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call the desk</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">${esc(t.name)} businesses</p><h2>Who we work with here</h2><p class="lede">${esc(t.line)}</p><p>${esc(t.biz)}</p></div>
          <div class="stack"><h3>What we handle</h3><ul class="checks"><li>Monthly bookkeeping and bank and card reconciliation</li><li>Cleanup when the books are months behind</li><li>Monthly profit and loss and balance sheet</li><li>Payroll processing and NJ payroll filings</li><li>Sales tax and annual report reminders and filings</li><li>QuickBooks Online, Xero and spreadsheets</li></ul></div>
        </div></section>
        <section class="band alt"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">Why local</p><h2>A Union County firm, not a call center</h2></div>
          <p style="max-width:760px">You work with the same people each month. We know the New Jersey filings that trip up small businesses, and we are close enough to meet in ${esc(t.name)} when it helps. We are a young firm, so we take on a limited number of clients and keep the work personal. The books stay in accounts you own.</p>
          <p style="margin-top:16px"><a class="btn btn-primary" href="/bookkeeping/#pricing">See pricing</a></p>
        </div></section>
        <section class="band"><div class="wrap" style="max-width:860px">
          <div class="sec-head"><p class="eyebrow">FAQ</p><h2>${esc(t.name)} bookkeeping questions</h2></div>
          ${faqHtml(faqs)}
          <h3 style="margin-top:36px;margin-bottom:12px">Nearby towns</h3>${nearLinks(t, bookPath)}
          <p style="margin-top:14px;color:var(--ink-2)">Also in ${esc(t.name)}: <a href="${webPath(t)}">websites and local SEO</a> · <a href="${notaryPath(t)}">mobile notary</a></p>
        </div></section>`,
        ctaTitle: `Bookkeeping help in ${t.name}? Ask for a quote.`, ctaHref: "/bookkeeping/#interest", ctaLabel: "Get a Quote",
      },
      schema: [svc(url, `Bookkeeping for ${t.name} businesses`, "Bookkeeping", `Monthly bookkeeping, cleanup, payroll and NJ filings for small businesses in ${t.name}, NJ.`, path, t), faqSchema(faqs), crumbSchema(url, crumbs)],
    }));
  });

  /* ----- websites and local SEO ----- */
  app.get("/websites/:town", async (req, res, next) => {
    const m = /^([a-z-]+)-nj$/.exec(req.params.town); const t = m && BY[m[1]];
    if (!t) return next();
    const biz = await business(); const url = base(req); const path = webPath(t);
    const crumbs = [["MCC Solutions", "/"], ["Websites", "/websites/"], [`${t.name}, NJ`, path]];
    const faqs = [
      [`What does local SEO mean for a ${t.name} business?`, `Making it easy for people searching nearby to find you: a complete Google Business Profile, clear service pages, your ${t.name} location and service area on the site, and a fast, mobile-friendly design.`],
      [`Can you guarantee a first-page ranking in ${t.name}?`, `No one honestly can. We do the work that improves your chances, set up Search Console so you can see what is happening, and explain results in plain terms.`],
      [`Do I own my website and domain?`, `Yes. You own the domain, hosting accounts and content. If you ever leave, everything goes with you.`],
      [`How much does a website cost?`, `We give a fixed written quote after a short call about what the site needs to do. Pricing depends on the number of pages, bookings or forms, and whether you need local SEO.`],
      [`Do you fix or update an existing site?`, `Yes. Speed, broken forms, outdated content and price updates are common jobs, and we can set up monthly check-ups.`],
    ];
    res.send(layout({
      req, biz, path, crumbs,
      title: `Website Design & Local SEO for ${t.name}, NJ Businesses | MCC`,
      description: `Fast, mobile-first websites and local SEO for ${t.name}, NJ businesses. Fixed written quotes, you own your domain. Based in Cranford.`,
      body: {
        hero: `<p class="eyebrow">Union County · ${esc(t.name)}, NJ</p><h1 style="margin-top:10px">Website design and local SEO for ${esc(t.name)}, NJ businesses</h1><p class="lede" style="margin-top:14px">MCC Solutions builds clear, fast websites and does the local SEO work that helps nearby customers find you. We are based in Cranford, close to ${esc(t.name)}, and every project starts with a fixed written quote.</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/websites/#contact">Get a website quote</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call the desk</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">${esc(t.name)} businesses</p><h2>Built for how ${esc(t.name)} customers search</h2><p class="lede">${esc(t.line)}</p><p>${esc(t.biz)} For businesses like these, most new customers start with a phone search such as "[service] near ${esc(t.name)}", so a fast mobile site and a complete Google Business Profile matter most.</p></div>
          <div class="stack"><h3>What we do</h3><ul class="checks"><li>New websites: mobile-first, fast and accessible</li><li>Google Business Profile setup or cleanup</li><li>Service and ${esc(t.name)} location pages, titles and schema</li><li>Sitemap and Search Console set up</li><li>Fixes and updates for an existing site</li><li>You own the domain, hosting and content</li></ul></div>
        </div></section>
        <section class="band alt"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">How we work</p><h2>Four steps, no surprises</h2></div>
          <ol class="steps"><li><b>Short call</b><span>Tell us about the business and what you want the site to do.</span></li><li><b>Written quote</b><span>A fixed price and timeline before any work starts.</span></li><li><b>Build and review</b><span>You see it, we adjust it, you approve it.</span></li><li><b>Launch and support</b><span>We publish, set up Search Console, and stay available for changes.</span></li></ol>
          <p style="margin-top:16px;color:var(--ink-2)">We do not promise rankings. We do solid work and explain what is happening.</p>
        </div></section>
        <section class="band"><div class="wrap" style="max-width:860px">
          <div class="sec-head"><p class="eyebrow">FAQ</p><h2>${esc(t.name)} website and SEO questions</h2></div>
          ${faqHtml(faqs)}
          <h3 style="margin-top:36px;margin-bottom:12px">Nearby towns</h3>${nearLinks(t, webPath)}
          <p style="margin-top:14px;color:var(--ink-2)">Also in ${esc(t.name)}: <a href="${bookPath(t)}">bookkeeping</a> · <a href="${notaryPath(t)}">mobile notary</a></p>
        </div></section>`,
        ctaTitle: `Website or local SEO help in ${t.name}? Ask for a quote.`, ctaHref: "/websites/#contact", ctaLabel: "Get a Quote",
      },
      schema: [svc(url, `Website design and local SEO for ${t.name} businesses`, "Web design and local SEO", `Websites and local SEO for ${t.name}, NJ businesses.`, path, t), faqSchema(faqs), crumbSchema(url, crumbs)],
    }));
  });
}

module.exports = { TOWNS, BY, notaryPath, bookPath, webPath, register };

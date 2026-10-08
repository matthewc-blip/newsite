// Free "Is your website working for you?" quiz. Scored on the server from the owner's own answers.
// It doesn't look at the website itself (the separate basics checker does that) and makes no ranking promises.
const G = "/websites/guides/";
const S = (q) => ({ ask: ["hasSite", "yes"], ...q });

const QUESTIONS = [
  { id: "hasSite", group: "Your website", text: "Does your business have its own website?",
    options: [["yes", "Yes", 2], ["social", "Only a social media page", 1], ["no", "No", 0]],
    advice: "Customers check a business online before they call. A simple, fast website with your services, area, phone number and a way to request a quote is the foundation for everything else.", guide: "what-every-local-business-website-needs" },
  S({ id: "domain", group: "Your website", text: "Do you own your domain name (the .com) and have the login for it?",
    options: [["yes", "Yes, it's registered in my name and I have the login", 2], ["unsure", "I'm not sure", 0], ["other", "Someone else registered it for me", 0]],
    advice: "If a web designer or former employee owns your domain or hosting, they control your site. Find out who is listed as the owner and make sure you have the logins.", guide: "own-your-domain-and-hosting" }),
  S({ id: "updated", group: "Your website", text: "When was the site last meaningfully updated?",
    options: [["recent", "Within the last 6 months", 2], ["year", "6 to 24 months ago", 1], ["old", "More than 2 years ago, or I don't know", 0]],
    advice: "An outdated site shows old hours, prices or services, and search engines favor sites that are kept up to date. Set a reminder to review it every quarter.", guide: "what-every-local-business-website-needs" }),
  S({ id: "mobile", group: "Your website", text: "Does it look and work well on a phone? (Have you checked recently?)",
    options: [["yes", "Yes, I checked and it works well", 2], ["unsure", "I haven't checked", 1], ["no", "No, it's hard to use on a phone", 0]],
    advice: "Most local searches happen on phones. Open your site on your own phone: is the text readable, can you tap the buttons, and does the phone number call when you tap it?", guide: "core-web-vitals-explained" }),
  S({ id: "contact", group: "Your website", text: "Can a visitor call, book or request a quote in one tap or click from any page?",
    options: [["yes", "Yes", 2], ["some", "Somewhat, they have to look for it", 1], ["no", "No, or it's buried", 0]],
    advice: "Make the next step obvious on every page: a tap-to-call number and a short quote or booking form. Every extra step loses some visitors.", guide: "what-every-local-business-website-needs" }),
  S({ id: "speed", group: "Your website", text: "Does the site load quickly on a phone?",
    options: [["fast", "Yes, it feels fast", 2], ["mixed", "Sometimes slow", 1], ["slow", "It's slow, or I've never checked", 0]],
    advice: "Slow pages lose visitors and can hurt search visibility. Large images and heavy page builders are the usual cause, and a speed fix is often inexpensive.", guide: "core-web-vitals-explained" }),
  S({ id: "pages", group: "Your website", text: "Do you have a separate page for each main service you sell?",
    options: [["yes", "Yes, one page per service", 2], ["one", "One page covers everything", 1], ["no", "No, just a home page", 0]],
    advice: "People search for a specific service, like \"loan signing agent in Cranford\". A page that answers that one question can rank for it, while a single catch-all page rarely does.", guide: "how-to-write-service-pages-that-help" }),
  S({ id: "areas", group: "Your website", text: "If you serve specific towns, do you have pages for them?",
    options: [["yes", "Yes, with useful local detail", 2], ["no", "No, I just list the towns", 0], ["na", "Not applicable (online-only or one location)", 2]],
    advice: "Local searches include the town name. A real page for each town you serve, with useful detail and not copied text, gives you a chance to appear for those searches.", guide: "how-to-write-service-pages-that-help" }),
  S({ id: "secure", group: "Your website", text: "Does the site load securely (https) and is it backed up and kept up to date?",
    options: [["yes", "Yes, and someone looks after it", 2], ["unsure", "I'm not sure", 1], ["no", "No, or it has security warnings", 0]],
    advice: "Browsers warn visitors away from insecure sites, and unmaintained sites get hacked. You need HTTPS, regular backups and software updates, either from your host or a care plan.", guide: "own-your-domain-and-hosting" }),
  { id: "gbp", group: "Local presence", text: "Is your Google Business Profile claimed and complete?",
    options: [["yes", "Yes, claimed with hours, services, photos and a description", 2], ["part", "Claimed, but not complete", 1], ["no", "No, or I'm not sure", 0]],
    advice: "Your Google Business Profile is often the first thing people see in local searches and on Maps. Claim it, verify it, and fill in everything: categories, hours, services, photos and a description.", guide: "how-to-set-up-google-business-profile" },
  { id: "reviews", group: "Local presence", text: "Do you regularly ask happy customers for Google reviews?",
    options: [["yes", "Yes, it's part of how I work", 2], ["some", "Occasionally", 1], ["no", "No", 0]],
    advice: "Reviews influence both who clicks and who calls. Ask every happy customer right after the job with a direct link, and never offer anything in exchange or write your own.", guide: "how-to-get-more-google-reviews" },
  { id: "nap", group: "Local presence", text: "Are your business name, address and phone number the same everywhere online?",
    options: [["yes", "Yes, I've checked", 2], ["unsure", "I'm not sure", 1], ["no", "No, they differ in places", 0]],
    advice: "Mismatched names, old addresses or phone numbers on directories confuse search engines and customers. Search your business name and fix what's wrong or out of date.", guide: "nap-consistency-and-local-citations" },
  S({ id: "analytics", group: "Measuring results", text: "Do you know how many people visit your site and where they come from?",
    options: [["yes", "Yes, I check it", 2], ["never", "Analytics is set up but I never look", 1], ["no", "No", 0]],
    advice: "You can't improve what you don't measure. Free tools can show visits, where they come from, and which pages lead to calls or forms.", guide: "how-to-set-up-google-search-console" }),
  S({ id: "console", group: "Measuring results", text: "Is your site set up in Google Search Console?",
    options: [["yes", "Yes", 2], ["unsure", "I'm not sure", 1], ["no", "No", 0]],
    advice: "Search Console is free and shows how Google sees your site: which searches show it, how many people click, and what's broken. Set it up and submit your sitemap.", guide: "how-to-set-up-google-search-console" }),
];

const engine = require("./quiz-engine").create({
  questions: QUESTIONS, guideBase: G, title: "Website and local presence check",
  disclaimer: "This reflects only your answers. It doesn't look at your site, your rankings or your traffic, and it isn't a prediction of results.",
  levels: ["Strong foundation", "Some gaps to close", "Needs work"],
});
module.exports = engine;

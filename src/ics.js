const { SERVICE_NAMES } = require("./email");

const stamp = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escTxt = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);

function buildIcs(b, settings) {
  const where = b.service === "mobile" ? [b.address, b.city, b.state, b.zip].filter(Boolean).join(", ") : "Online video session";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MCC Solutions//Booking//EN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.ref}@mccsolutions`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(b.start_utc)}`,
    `DTEND:${stamp(b.end_utc)}`,
    `SUMMARY:${escTxt(`${SERVICE_NAMES[b.service]} · ${b.category}`)}`,
    `LOCATION:${escTxt(where)}`,
    `DESCRIPTION:${escTxt(`Booking ${b.ref}. Questions: ${settings.business.phone} ${settings.business.email}`)}`,
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

module.exports = { buildIcs };

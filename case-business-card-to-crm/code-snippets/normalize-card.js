// Normalisiert das AI Scan Ergebnis fuer die weitere Verarbeitung.
//
// Pipeline Stufe: AI OCR Extraktion -> [Normalisierung] -> SugarCRM Mapping
//
// Input:  card Objekt mit deutschen Feldnamen aus dem Gemini AI Schema
// Output: bereinigte und validierte Felder, leere Werte als ""
//
// Schwerpunkte:
//  - Telefonnummern auf E.164 (DE) bereinigen
//  - E-Mail Adressen syntaktisch pruefen und normalisieren
//  - URLs auf https:// erzwingen, www. entfernen
//  - Namen titelisieren, Firmenrechtsformen normalisieren
//  - PLZ und Stadt aus kombinierten Adresszeilen extrahieren

const PHONE_TRUNK_PREFIXES = ["0049", "+49"];
const COMPANY_SUFFIX_MAP = {
  gmbh: "GmbH",
  "gmbh & co. kg": "GmbH & Co. KG",
  "gmbh und co. kg": "GmbH & Co. KG",
  ag: "AG",
  ug: "UG",
  "ug (haftungsbeschraenkt)": "UG (haftungsbeschränkt)",
  kg: "KG",
  ohg: "OHG",
  gbr: "GbR",
  ev: "e.V.",
  "e.v.": "e.V."
};

function normalizeCard(aiResult) {
  const card = aiResult.card || aiResult || {};

  return {
    firma: normalizeCompany(card.firma),
    vorname: normalizeName(card.vorname),
    nachname: normalizeName(card.nachname),
    job_titel: clean(card.job_titel),
    email: normalizeEmail(card.email),
    telefon_mobil: normalizePhone(card.telefon_mobil),
    telefon_buero: normalizePhone(card.telefon_buero),
    telefax: normalizePhone(card.telefax),
    webseite: normalizeUrl(card.webseite),
    adresse_strasse: clean(card.adresse_strasse),
    adresse_plz: extractPostalCode(card.adresse_plz, card.adresse_strasse),
    adresse_stadt: extractCity(card.adresse_stadt, card.adresse_strasse),
    adresse_land: clean(card.adresse_land) || "Deutschland"
  };
}

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeName(value) {
  const name = clean(value);
  if (!name) return "";
  return name
    .split(/[\s-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeCompany(value) {
  const name = clean(value);
  if (!name) return "";
  const lower = name.toLowerCase();
  for (const [suffix, canonical] of Object.entries(COMPANY_SUFFIX_MAP)) {
    const regex = new RegExp(`\\b${suffix.replace(/[.()]/g, "\\$&")}\\b$`, "i");
    if (regex.test(lower)) {
      return name.replace(regex, canonical);
    }
  }
  return name;
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  if (!email) return "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "";
  // einfache Tippfehler in haeufigen Domains korrigieren
  return email
    .replace(/@gmial\./, "@gmail.")
    .replace(/@gmai\./, "@gmail.")
    .replace(/@gmx\.dee?$/, "@gmx.de")
    .replace(/@web\.dee?$/, "@web.de");
}

function normalizePhone(value) {
  let phone = clean(value);
  if (!phone) return "";
  // alle Zeichen ausser Ziffern und Plus entfernen
  phone = phone.replace(/[^\d+]/g, "");
  if (!phone) return "";
  // deutsche Trunk-Prefixes auf +49 normalisieren
  for (const prefix of PHONE_TRUNK_PREFIXES) {
    if (phone.startsWith(prefix)) {
      phone = "+49" + phone.slice(prefix.length);
      break;
    }
  }
  // fuehrende 0 (nationale Notation) auf +49 mappen
  if (phone.startsWith("0") && !phone.startsWith("00")) {
    phone = "+49" + phone.slice(1);
  }
  // doppelte Plus oder fuehrende 00 ohne Land bereinigen
  phone = phone.replace(/^\+{2,}/, "+");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  // Mindest- und Maximallaenge pruefen
  const digits = phone.replace(/\+/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return phone;
}

function normalizeUrl(value) {
  let url = clean(value).toLowerCase();
  if (!url) return "";
  // Protokoll sicherstellen
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    // www. entfernen fuer kanonische Form
    const host = parsed.hostname.replace(/^www\./, "");
    return `https://${host}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

function extractPostalCode(plzField, addressLine) {
  const direct = clean(plzField);
  if (/^\d{4,5}$/.test(direct)) return direct.padStart(5, "0");
  // Fallback: PLZ aus der kombinierten Adresszeile extrahieren
  const line = clean(addressLine);
  const match = line.match(/\b(\d{5})\b/);
  return match ? match[1] : "";
}

function extractCity(cityField, addressLine) {
  const direct = clean(cityField);
  if (direct) return normalizeName(direct);
  // Fallback: "12345 Stadt" oder "Stadt, 12345" Pattern in der Adresszeile
  const line = clean(addressLine);
  const match = line.match(/\b\d{5}\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\s-]+)$/);
  return match ? normalizeName(match[1]) : "";
}

function getMissingRequiredFields(card) {
  const required = ["vorname", "nachname", "email"];
  return required.filter((field) => !card[field]);
}

module.exports = {
  normalizeCard,
  normalizeEmail,
  normalizePhone,
  normalizeUrl,
  normalizeName,
  normalizeCompany,
  getMissingRequiredFields
};

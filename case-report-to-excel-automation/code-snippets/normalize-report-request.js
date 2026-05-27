// Validiert und normalisiert die eingehende Report Anfrage.
//
// Pipeline Stufe: Webhook -> [Request Validierung] -> Template lesen -> Excel befuellen
//
// Pflichtfelder werden geprueft, optionale Felder mit Defaults belegt,
// Base64 CSV wird syntaktisch validiert und auf maximale Groesse beschraenkt.
// Bei Fehlern wird ein strukturiertes Error Objekt zurueckgegeben,
// das direkt als HTTP 400 Response verwendet werden kann.

const REQUIRED_FIELDS = ["reportId", "reportName", "fileName", "csvBase64"];
const MAX_CSV_BYTES = 25 * 1024 * 1024; // 25 MB nach Base64 Dekodierung
const ALLOWED_CHARSET = /^[A-Za-z0-9+/=\s]+$/;
const SAFE_FILENAME = /^[A-Za-z0-9._-]+\.csv$/i;

function normalizeReportRequest(rawInput) {
  if (!rawInput || typeof rawInput !== "object") {
    return failure("INVALID_INPUT", "Request Body ist leer oder kein Objekt.");
  }

  const input = unwrapBody(rawInput);

  const missing = REQUIRED_FIELDS.filter((field) => !hasValue(input[field]));
  if (missing.length > 0) {
    return failure("MISSING_FIELDS", "Pflichtfelder fehlen.", { missingFields: missing });
  }

  if (!SAFE_FILENAME.test(input.fileName)) {
    return failure("INVALID_FILENAME", "Dateiname enthaelt unerlaubte Zeichen oder hat keine .csv Endung.");
  }

  const csvCheck = validateBase64Csv(input.csvBase64);
  if (!csvCheck.ok) return csvCheck;

  const callbackCheck = validateCallbackUrl(input.callbackUrl);
  if (!callbackCheck.ok) return callbackCheck;

  return {
    ok: true,
    request: {
      reportId: String(input.reportId).trim(),
      reportName: cleanLabel(input.reportName),
      fileName: input.fileName.trim(),
      csvBase64: input.csvBase64.replace(/\s+/g, ""),
      csvBytes: csvCheck.byteLength,
      sugarBaseUrl: cleanBaseUrl(input.sugarBaseUrl),
      requestedBy: normalizeUserRef(input.requestedBy),
      callbackUrl: callbackCheck.url,
      correlationId: input.correlationId || buildCorrelationId(input.reportId),
      receivedAt: new Date().toISOString()
    }
  };
}

function unwrapBody(rawInput) {
  // n8n Webhook liefert body teilweise verschachtelt: { body: {...} } oder direkt
  if (rawInput.body && typeof rawInput.body === "object") return rawInput.body;
  return rawInput;
}

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function validateBase64Csv(value) {
  const cleaned = String(value).replace(/\s+/g, "");
  if (!ALLOWED_CHARSET.test(cleaned)) {
    return failure("INVALID_BASE64", "csvBase64 enthaelt unerlaubte Zeichen.");
  }
  if (cleaned.length % 4 !== 0) {
    return failure("INVALID_BASE64", "csvBase64 hat keine gueltige Laenge.");
  }
  // grobe Schaetzung der dekodierten Groesse: laenge * 3/4 minus padding
  const padding = (cleaned.match(/=+$/) || [""])[0].length;
  const byteLength = (cleaned.length / 4) * 3 - padding;
  if (byteLength > MAX_CSV_BYTES) {
    return failure("CSV_TOO_LARGE", "CSV Datei ueberschreitet die maximale Groesse von 25 MB.", { byteLength });
  }
  if (byteLength < 10) {
    return failure("CSV_TOO_SMALL", "CSV Inhalt ist zu klein um valide zu sein.", { byteLength });
  }
  return { ok: true, byteLength };
}

function validateCallbackUrl(url) {
  if (!url) {
    // Callback ist optional, kein Fehler
    return { ok: true, url: null };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return failure("INVALID_CALLBACK", "Callback URL muss HTTPS verwenden.");
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return failure("INVALID_CALLBACK", "Callback URL ist syntaktisch ungueltig.");
  }
}

function cleanLabel(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function cleanBaseUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function normalizeUserRef(userRef) {
  if (!userRef) return null;
  if (typeof userRef === "string") return { id: userRef };
  return {
    id: userRef.id || null,
    name: userRef.name || null,
    email: userRef.email || null
  };
}

function buildCorrelationId(reportId) {
  const timestamp = Date.now().toString(36);
  const slug = String(reportId).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return `report_${slug}_${timestamp}`;
}

function failure(code, message, extras = {}) {
  return {
    ok: false,
    error: { code, message, ...extras }
  };
}

module.exports = {
  normalizeReportRequest,
  validateBase64Csv,
  validateCallbackUrl,
  buildCorrelationId
};

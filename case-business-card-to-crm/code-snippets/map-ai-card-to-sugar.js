// Mapping vom normalisierten AI Schema (deutsch) auf SugarCRM Lead Payload.
//
// Pipeline Stufe: Normalisierung -> [SugarCRM Mapping] -> OAuth Token -> Lead anlegen
//
// Erwartet das Ergebnis aus normalizeCard().
// Liefert entweder {ok: true, payload} fuer den SugarCRM REST Call
// oder {ok: false, error} mit Fehler-Code fuer das Frontend.
//
// Berucksichtigt:
//  - SugarCRM Email Array Format (primary_address Flag)
//  - getrennte Phone Felder (mobile, work, fax) statt einem Feld
//  - Adress-Praefix primary_address_* fuer Lead Modul
//  - Lead Source Tracking ueber lead_source und lead_source_description
//  - Description-Feld als Audit-Trail mit Scan-Zeitstempel

const MIN_REQUIRED_FIELDS = ["vorname", "nachname", "email"];
const DEFAULT_LEAD_SOURCE = "Business Card Capture";
const DEFAULT_LEAD_STATUS = "New";

function mapAiCardToSugar(card, context = {}) {
  const missing = MIN_REQUIRED_FIELDS.filter((field) => !card[field]);
  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        code: "MISSING_REQUIRED_FIELDS",
        message: "Visitenkarte enthaelt nicht genug Daten fuer einen CRM Lead.",
        missingFields: missing
      }
    };
  }

  const emailEntries = buildEmailArray(card.email);
  if (emailEntries.length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_EMAIL",
        message: "E-Mail Adresse konnte nicht validiert werden."
      }
    };
  }

  const payload = {
    first_name: card.vorname,
    last_name: card.nachname,
    account_name: card.firma || "",
    title: card.job_titel || "",

    email: emailEntries,

    phone_mobile: card.telefon_mobil || "",
    phone_work: card.telefon_buero || "",
    phone_fax: card.telefax || "",

    website: card.webseite || "",

    primary_address_street: card.adresse_strasse || "",
    primary_address_postalcode: card.adresse_plz || "",
    primary_address_city: card.adresse_stadt || "",
    primary_address_country: card.adresse_land || "",

    lead_source: DEFAULT_LEAD_SOURCE,
    lead_source_description: buildLeadSourceDescription(context),
    status: DEFAULT_LEAD_STATUS,

    description: buildAuditDescription(card, context)
  };

  // leere Felder vor dem REST Call entfernen, damit SugarCRM keine Default-Overrides triggert
  return {
    ok: true,
    payload: pruneEmptyFields(payload)
  };
}

function buildEmailArray(email) {
  if (!email) return [];
  return [
    {
      email_address: email,
      primary_address: true,
      invalid_email: false,
      opt_out: false
    }
  ];
}

function buildLeadSourceDescription(context) {
  const parts = ["Visitenkarten Scan"];
  if (context.scannedBy) parts.push(`durch ${context.scannedBy}`);
  if (context.deviceLabel) parts.push(`auf ${context.deviceLabel}`);
  return parts.join(" ");
}

function buildAuditDescription(card, context) {
  const lines = [
    "Lead erstellt aus Visitenkarten Scan.",
    `Erfasst am: ${context.scannedAt || new Date().toISOString()}`
  ];
  if (card.webseite) lines.push(`Webseite: ${card.webseite}`);
  if (card.telefon_mobil && card.telefon_buero) {
    lines.push("Beide Telefonnummern aus Scan uebernommen.");
  }
  if (context.scanConfidence != null) {
    lines.push(`AI Confidence: ${context.scanConfidence}`);
  }
  return lines.join("\n");
}

function pruneEmptyFields(payload) {
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      if (value.length > 0) out[key] = value;
    } else if (value !== "" && value !== null && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function buildSuccessResponse(sugarResponse, card) {
  return {
    ok: true,
    leadId: sugarResponse.id,
    displayName: `${card.vorname} ${card.nachname}`.trim(),
    company: card.firma || null,
    sugarUrl: sugarResponse._self || null,
    message: "Lead erfolgreich im CRM angelegt."
  };
}

function buildErrorResponse(error) {
  return {
    ok: false,
    code: error.code || "UNKNOWN_ERROR",
    message: error.message || "Lead Anlage fehlgeschlagen.",
    details: error.missingFields ? { missingFields: error.missingFields } : undefined
  };
}

module.exports = {
  mapAiCardToSugar,
  buildEmailArray,
  buildSuccessResponse,
  buildErrorResponse,
  pruneEmptyFields
};

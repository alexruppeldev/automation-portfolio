// Mapping vom validierten AI Extraktionsergebnis auf das SugarCRM Lead Modul.
//
// Pipeline Stufe: AI Validierung -> [SugarCRM Mapping] -> Duplikatpruefung -> CRM Import
//
// Aufgaben:
//  - AI Feldnamen (camelCase, neutral) auf SugarCRM Felder (snake_case) uebersetzen
//  - Email als Array-Struktur fuer das SugarCRM REST Format aufbauen
//  - Telefon aufteilen in phone_work und phone_mobile
//  - Lead Source und Description als Audit-Trail befuellen
//  - Vor dem REST Call leere Felder entfernen, damit Defaults nicht ueberschrieben werden

const LEAD_STATUS_DEFAULT = "New";
const LEAD_SOURCE_DEFAULT = "Web Site";
const LEAD_SOURCE_DESC_DEFAULT = "Smart Lead Import";

function mapAiLeadToSugar(extraction, context = {}) {
  const lead = (extraction && extraction.lead) || extraction || {};
  if (!lead.firstName || !lead.lastName || !lead.email) {
    return {
      ok: false,
      error: {
        code: "MAPPING_REQUIREMENTS_NOT_MET",
        message: "Mindestens firstName, lastName und email muessen gesetzt sein."
      }
    };
  }

  const payload = {
    first_name: cleanString(lead.firstName),
    last_name: cleanString(lead.lastName),
    account_name: cleanString(lead.company),
    title: cleanString(lead.jobTitle),

    email: buildEmailArray(lead.email),

    ...splitPhone(lead.phone),

    primary_address_city: cleanString(lead.city),

    status: LEAD_STATUS_DEFAULT,
    lead_source: context.leadSource || LEAD_SOURCE_DEFAULT,
    lead_source_description: context.leadSourceDescription || LEAD_SOURCE_DESC_DEFAULT,

    description: buildDescription(lead, context)
  };

  return {
    ok: true,
    payload: pruneEmptyFields(payload),
    mappingMeta: {
      sourceFields: Object.keys(lead),
      targetFields: Object.keys(payload),
      droppedFields: findDroppedFields(lead)
    }
  };
}

function cleanString(value) {
  if (value == null) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function buildEmailArray(email) {
  const cleaned = cleanString(email).toLowerCase();
  if (!cleaned) return [];
  return [
    {
      email_address: cleaned,
      primary_address: true,
      invalid_email: false,
      opt_out: false
    }
  ];
}

function splitPhone(rawPhone) {
  // AI liefert oft nur ein "phone" Feld ohne Typ - default ist phone_work.
  // Wenn die Nummer mit deutscher Mobil-Vorwahl beginnt (015x, 016x, 017x),
  // wird sie als phone_mobile klassifiziert.
  const phone = cleanString(rawPhone);
  if (!phone) return {};
  const digits = phone.replace(/[^\d]/g, "");
  const isMobile = /^(0?15|0?16|0?17|4915|4916|4917)/.test(digits) ||
    /^\+?49(15|16|17)/.test(phone);
  if (isMobile) {
    return { phone_mobile: phone };
  }
  return { phone_work: phone };
}

function buildDescription(lead, context) {
  const lines = [];
  if (lead.interest) {
    lines.push(`Interesse: ${lead.interest}`);
  }
  if (lead.notes) {
    lines.push(`Notiz aus AI Extraktion: ${lead.notes}`);
  }
  if (context.sourceTextPreview) {
    const preview = String(context.sourceTextPreview).slice(0, 240);
    lines.push("Originaltext (Auszug):");
    lines.push(preview);
  }
  if (context.aiConfidence != null) {
    lines.push(`AI Confidence: ${context.aiConfidence}`);
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

function findDroppedFields(lead) {
  // dokumentiert, welche AI Felder kein direktes SugarCRM Pendant haben
  const known = ["firstName", "lastName", "company", "email", "phone", "jobTitle", "city", "interest", "notes"];
  return Object.keys(lead).filter((field) => !known.includes(field));
}

module.exports = {
  mapAiLeadToSugar,
  buildEmailArray,
  splitPhone,
  pruneEmptyFields
};

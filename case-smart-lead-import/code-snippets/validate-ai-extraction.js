// Validiert das AI Extraktionsergebnis VOR dem SugarCRM Mapping.
//
// Pipeline Stufe: AI Extraktion -> [AI Validierung] -> SugarCRM Mapping -> Duplikatpruefung -> CRM Import
//
// Geprueft werden die neutralen AI Felder (firstName, lastName, company, email).
// Die SugarCRM Felder (first_name, last_name, account_name, email1) entstehen
// erst in einer spaeteren Pipeline Stufe nach dem Mapping.
//
// Liefert einen Status, eine Liste fehlender Pflichtfelder,
// einen Confidence Score (0..1) und eine Liste von Warnungen
// fuer Felder, die zwar gesetzt sind, aber syntaktisch verdaechtig wirken.

const REQUIRED_FIELDS = ["firstName", "lastName", "company", "email"];
const OPTIONAL_FIELDS = ["jobTitle", "phone", "city", "interest", "notes"];
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const PHONE_REGEX = /^[+\d][\d\s().-]{5,}$/;

function validateAiExtraction(extraction) {
  const lead = (extraction && extraction.lead) || extraction || {};
  const missingFields = REQUIRED_FIELDS.filter((field) => !hasValue(lead[field]));
  const warnings = collectWarnings(lead);

  const filledOptional = OPTIONAL_FIELDS.filter((field) => hasValue(lead[field])).length;
  const confidence = computeConfidence({
    missingCount: missingFields.length,
    warningCount: warnings.length,
    filledOptional
  });

  const status = decideStatus(missingFields, warnings, confidence);

  return {
    status,
    missingFields,
    warnings,
    confidence: Number(confidence.toFixed(2)),
    pipelineStage: "ai_validation",
    note: buildHumanNote(status, missingFields, warnings)
  };
}

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function collectWarnings(lead) {
  const warnings = [];

  if (lead.email && !EMAIL_REGEX.test(String(lead.email).trim())) {
    warnings.push({ field: "email", code: "INVALID_FORMAT", value: lead.email });
  }
  if (lead.phone && !PHONE_REGEX.test(String(lead.phone).trim())) {
    warnings.push({ field: "phone", code: "INVALID_FORMAT", value: lead.phone });
  }
  if (lead.firstName && lead.firstName === lead.firstName.toUpperCase() && lead.firstName.length > 2) {
    warnings.push({ field: "firstName", code: "ALL_UPPERCASE" });
  }
  if (lead.lastName && lead.lastName === lead.lastName.toUpperCase() && lead.lastName.length > 2) {
    warnings.push({ field: "lastName", code: "ALL_UPPERCASE" });
  }
  if (lead.company && /^(test|demo|asdf|xxx)/i.test(String(lead.company).trim())) {
    warnings.push({ field: "company", code: "LIKELY_TEST_DATA", value: lead.company });
  }
  if (lead.email && /(noreply|do-not-reply|donotreply)/i.test(String(lead.email))) {
    warnings.push({ field: "email", code: "TRANSACTIONAL_ADDRESS", value: lead.email });
  }
  return warnings;
}

function computeConfidence({ missingCount, warningCount, filledOptional }) {
  // Basis 1.0, Abzuege pro fehlendem Pflichtfeld und Warnung,
  // kleiner Bonus fuer ausgefuellte optionale Felder
  let score = 1.0;
  score -= missingCount * 0.25;
  score -= warningCount * 0.1;
  score += Math.min(filledOptional, 4) * 0.025;
  return Math.max(0, Math.min(1, score));
}

function decideStatus(missingFields, warnings, confidence) {
  if (missingFields.length > 0) return "needs_manual_review";
  if (warnings.some((w) => w.code === "LIKELY_TEST_DATA")) return "rejected_test_data";
  if (confidence < 0.6) return "needs_manual_review";
  return "ready_for_crm_review";
}

function buildHumanNote(status, missingFields, warnings) {
  if (status === "needs_manual_review" && missingFields.length > 0) {
    return `Pflichtfelder fehlen: ${missingFields.join(", ")}.`;
  }
  if (status === "rejected_test_data") {
    return "Eintrag wirkt wie Testdaten und wurde abgelehnt.";
  }
  if (warnings.length > 0) {
    return `AI Ergebnis akzeptiert, aber ${warnings.length} Warnung(en) zur manuellen Pruefung.`;
  }
  return "AI Ergebnis ist vollstaendig genug fuer CRM Pruefung.";
}

module.exports = {
  validateAiExtraction,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS
};

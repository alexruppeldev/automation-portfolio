// Regelbasiertes Scoring fuer den SugarCRM Fit eines Lead Kandidaten.
//
// Pipeline Stufe: Website Inhalt -> [Rule Score] -> Schwelle -> AI Scoring
//
// Die Funktion bewertet einen extrahierten Website Inhalt (Startseite + Impressum)
// gegen positive Signale (Vertrieb, Service, mehrere Standorte, Wachstum) und
// gegen Anti Patterns (Job Portal, Branchenbuch, Agentur, CRM Berater).
//
// Ziel: nur Kandidaten mit einem Mindest-Score landen im AI Scoring,
// um SerpAPI Volumen und AI Kosten unter Kontrolle zu halten.

const POSITIVE_SIGNALS = [
  { key: "vertrieb", patterns: [/\bvertrieb(?:steam)?\b/i, /\bsales\s*team\b/i, /\baussendienst\b/i], weight: 3 },
  { key: "kundenservice", patterns: [/\bkundenservice\b/i, /\bservice\s*hotline\b/i, /\bcustomer\s*support\b/i], weight: 2 },
  { key: "standorte", patterns: [/\bstandorte\b/i, /\bniederlassungen\b/i, /\bfilialen\b/i], weight: 3 },
  { key: "internationalisierung", patterns: [/\binternational\b/i, /\bweltweit\b/i, /\bglobal\b/i], weight: 1 },
  { key: "wachstum", patterns: [/\bwachstum\b/i, /\bexpansion\b/i, /\bneue\s*standorte\b/i], weight: 2 },
  { key: "b2b", patterns: [/\bb2b\b/i, /\bgeschaeftskunden\b/i, /\bgewerbekunden\b/i], weight: 2 },
  { key: "kontakt", patterns: [/\bkontakt(?:formular)?\b/i, /\bansprechpartner\b/i], weight: 1 },
  { key: "telefon", patterns: [/\+49\s?\d/, /\b0\d{2,4}[\s/-]?\d/], weight: 1 },
  { key: "email", patterns: [/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/], weight: 1 }
];

const ANTI_PATTERNS = [
  { key: "jobseite", patterns: [/\bstellenboerse\b/i, /\bjobboerse\b/i, /\bkarriereportal\b/i], penalty: 8 },
  { key: "branchenbuch", patterns: [/\bbranchenbuch\b/i, /\bfirmenverzeichnis\b/i, /\bunternehmensregister\b/i], penalty: 8 },
  { key: "agentur", patterns: [/\bwerbeagentur\b/i, /\bdigitalagentur\b/i, /\bmarketingagentur\b/i], penalty: 4 },
  { key: "crm_berater", patterns: [/\bcrm[-\s]?berater\b/i, /\bcrm[-\s]?consultant\b/i, /\bsugarcrm\s+partner\b/i, /\bsalesforce\s+partner\b/i], penalty: 6 },
  { key: "aggregator", patterns: [/\bvergleichsportal\b/i, /\bpreisvergleich\b/i], penalty: 8 },
  { key: "blog_only", patterns: [/\bblog\s+ueber\b/i, /\btagebuch\b/i], penalty: 3 },
  { key: "freelancer", patterns: [/\bfreelance(?:r|rin)\b/i, /\beinzelunternehmer(?:in)?\b/i], penalty: 5 }
];

const RULE_THRESHOLD = 6; // minimaler Score fuer den Uebergang in das AI Scoring

function scoreCrmSignals(content, options = {}) {
  const text = buildSearchText(content);
  if (!text || text.length < 200) {
    return {
      score: 0,
      passesThreshold: false,
      reason: "Inhalt zu kurz fuer eine zuverlaessige Bewertung.",
      signals: [],
      antiPatterns: []
    };
  }

  const signalsFound = findMatches(text, POSITIVE_SIGNALS);
  const antiFound = findMatches(text, ANTI_PATTERNS, true);

  const positiveScore = signalsFound.reduce((sum, s) => sum + s.weight, 0);
  const penaltyScore = antiFound.reduce((sum, a) => sum + a.penalty, 0);
  const finalScore = Math.max(0, positiveScore - penaltyScore);

  const threshold = options.threshold ?? RULE_THRESHOLD;

  return {
    score: finalScore,
    breakdown: {
      positive: positiveScore,
      penalty: penaltyScore
    },
    signals: signalsFound.map((s) => s.key),
    antiPatterns: antiFound.map((a) => a.key),
    passesThreshold: finalScore >= threshold && antiFound.length === 0,
    reason: buildReason(finalScore, signalsFound, antiFound, threshold)
  };
}

function buildSearchText(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  const parts = [
    content.title,
    content.metaDescription,
    content.bodyText,
    content.impressumText
  ].filter(Boolean);
  return parts.join("\n").toLowerCase();
}

function findMatches(text, rules, isAntiPattern = false) {
  const matches = [];
  for (const rule of rules) {
    const matched = rule.patterns.some((re) => re.test(text));
    if (matched) {
      matches.push({
        key: rule.key,
        weight: rule.weight || 0,
        penalty: rule.penalty || 0
      });
    }
  }
  return matches;
}

function buildReason(score, signals, antiPatterns, threshold) {
  if (antiPatterns.length > 0) {
    return `Anti Pattern erkannt: ${antiPatterns.map((a) => a.key).join(", ")}.`;
  }
  if (score >= threshold) {
    return `Score ${score} erreicht Schwelle ${threshold} ueber Signale: ${signals.map((s) => s.key).join(", ")}.`;
  }
  return `Score ${score} unter Schwelle ${threshold}.`;
}

function buildAuditEntry(domain, scoreResult, aiResult) {
  return {
    domain,
    accepted: Boolean(aiResult && aiResult.is_relevant),
    rule_score: scoreResult.score,
    rule_signals: scoreResult.signals.join(","),
    rule_anti_patterns: scoreResult.antiPatterns.join(","),
    rule_decision: scoreResult.passesThreshold ? "passed" : "rejected_rule",
    ai_score: aiResult ? aiResult.crm_fit_score : null,
    ai_recommendation: aiResult ? aiResult.recommendation : null,
    ai_target_role: aiResult ? aiResult.target_role : null,
    ai_reason: aiResult ? aiResult.reason : null,
    final_decision: deriveFinalDecision(scoreResult, aiResult)
  };
}

function deriveFinalDecision(scoreResult, aiResult) {
  if (!scoreResult.passesThreshold) return "rejected_rule";
  if (!aiResult) return "pending_ai";
  if (!aiResult.is_relevant) return "rejected_ai";
  return "accepted";
}

module.exports = {
  scoreCrmSignals,
  buildAuditEntry,
  POSITIVE_SIGNALS,
  ANTI_PATTERNS,
  RULE_THRESHOLD
};

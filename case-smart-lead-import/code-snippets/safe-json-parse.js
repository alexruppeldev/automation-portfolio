// Sichere Extraktion eines JSON Objekts aus dem AI Modell Output.
//
// Pipeline Stufe: AI Antwort -> [Safe JSON Parse] -> AI Validierung
//
// LLM Antworten kommen in der Praxis in verschiedenen Formen:
//  1. Reines JSON: {...}
//  2. JSON in einem Markdown Codeblock: ```json\n{...}\n```
//  3. Erklaerungstext gefolgt von JSON
//  4. JSON mit Trailing Commas oder Smart Quotes (haeufig bei Gemini)
//
// Strategie: nacheinander mehrere Parser versuchen und das erste valide Ergebnis zurueckgeben.
// Bei Fehlschlag wird ein strukturiertes Error Objekt geliefert,
// damit der Workflow zwischen "AI hat nichts geliefert" und "AI hat unbrauchbares JSON geliefert" unterscheiden kann.

const FENCE_REGEX = /```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/;
const SMART_QUOTES = {
  "\u201C": '"',
  "\u201D": '"',
  "\u2018": "'",
  "\u2019": "'"
};

function safeJsonParse(rawValue) {
  if (rawValue == null) {
    return failure("EMPTY_INPUT", "AI Antwort ist leer.");
  }

  // Falls bereits ein Objekt uebergeben wurde (z.B. von einem strukturierten AI Output)
  if (typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return { ok: true, value: rawValue, strategy: "passthrough" };
  }

  const text = String(rawValue);
  const strategies = [
    { name: "raw", extract: extractRaw },
    { name: "fenced", extract: extractFencedJson },
    { name: "first-object", extract: extractFirstObject },
    { name: "sanitized", extract: extractSanitized }
  ];

  let lastError = null;
  for (const strategy of strategies) {
    const candidate = strategy.extract(text);
    if (!candidate) continue;
    try {
      const value = JSON.parse(candidate);
      return { ok: true, value, strategy: strategy.name };
    } catch (error) {
      lastError = error.message;
    }
  }

  return failure("INVALID_JSON", "AI Output konnte mit keiner Strategie geparst werden.", { lastError });
}

function extractRaw(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  return null;
}

function extractFencedJson(text) {
  const match = text.match(FENCE_REGEX);
  return match ? match[1].trim() : null;
}

function extractFirstObject(text) {
  // findet das erste vollstaendige {...} im Text durch Klammer-Zaehlung
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let stringChar = null;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractSanitized(text) {
  let candidate = extractFirstObject(text);
  if (!candidate) return null;
  // Smart Quotes ersetzen
  for (const [smart, plain] of Object.entries(SMART_QUOTES)) {
    candidate = candidate.split(smart).join(plain);
  }
  // Trailing Commas vor } oder ] entfernen
  candidate = candidate.replace(/,(\s*[}\]])/g, "$1");
  return candidate;
}

function failure(code, message, extras = {}) {
  return {
    ok: false,
    error: { code, message, ...extras }
  };
}

module.exports = { safeJsonParse, extractFirstObject };

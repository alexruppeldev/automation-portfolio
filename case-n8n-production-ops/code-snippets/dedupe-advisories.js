// Filtert neue GitHub Security Advisories gegen einen bekannten Stand.
//
// Pipeline Stufe: GitHub Advisory Fetch -> [Dedupe + Filter] -> Alert senden
//
// Aufgaben:
//  - Advisories gegen lokale Liste bekannter IDs abgleichen
//  - nach Mindest-Severity filtern (low/medium/high/critical)
//  - relevante Pakete priorisieren (n8n und direkte Abhaengigkeiten)
//  - Advisories aelter als die konfigurierte Frist verwerfen
//  - neuen "known" Stand fuer das naechste Intervall berechnen

const SEVERITY_ORDER = { low: 0, medium: 1, moderate: 1, high: 2, critical: 3 };
const DEFAULT_OPTIONS = {
  minSeverity: "high",
  maxAgeDays: 90,
  relevantPackages: null // null = alle Pakete, sonst Array von Paketnamen
};

function dedupeAndFilterAdvisories(advisories, knownIds, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const knownSet = new Set(knownIds || []);
  const minLevel = SEVERITY_ORDER[config.minSeverity.toLowerCase()] ?? 2;
  const cutoffDate = config.maxAgeDays
    ? Date.now() - config.maxAgeDays * 24 * 60 * 60 * 1000
    : null;

  const newRelevant = [];
  const skipped = { knownAlready: 0, belowSeverity: 0, tooOld: 0, packageNotRelevant: 0 };

  for (const raw of advisories) {
    const advisory = normalizeAdvisory(raw);

    if (knownSet.has(advisory.id)) {
      skipped.knownAlready += 1;
      continue;
    }
    if ((SEVERITY_ORDER[advisory.severity] ?? -1) < minLevel) {
      skipped.belowSeverity += 1;
      continue;
    }
    if (cutoffDate && advisory.publishedAt && advisory.publishedAt < cutoffDate) {
      skipped.tooOld += 1;
      continue;
    }
    if (!isPackageRelevant(advisory.affectedPackages, config.relevantPackages)) {
      skipped.packageNotRelevant += 1;
      continue;
    }

    newRelevant.push(advisory);
  }

  newRelevant.sort(compareBySeverity);

  return {
    new: newRelevant,
    skipped,
    nextKnownIds: buildNextKnownIds(knownIds, advisories, config),
    summary: {
      input: advisories.length,
      relevant: newRelevant.length,
      knownAlready: skipped.knownAlready,
      filtered: skipped.belowSeverity + skipped.tooOld + skipped.packageNotRelevant
    }
  };
}

function normalizeAdvisory(raw) {
  return {
    id: String(raw.ghsa_id || raw.id || "").trim(),
    severity: String(raw.severity || "low").toLowerCase(),
    summary: raw.summary || "",
    publishedAt: parseDate(raw.published_at || raw.publishedAt),
    updatedAt: parseDate(raw.updated_at || raw.updatedAt),
    affectedPackages: extractPackages(raw),
    url: raw.html_url || raw.url || null
  };
}

function parseDate(value) {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function extractPackages(advisory) {
  const vulns = advisory.vulnerabilities || [];
  return vulns
    .map((v) => v.package && (v.package.name || v.package.ecosystem))
    .filter(Boolean);
}

function isPackageRelevant(packages, relevantPackages) {
  if (!relevantPackages || relevantPackages.length === 0) return true;
  if (!packages || packages.length === 0) return false;
  const relevantSet = new Set(relevantPackages.map((p) => p.toLowerCase()));
  return packages.some((p) => relevantSet.has(p.toLowerCase()));
}

function compareBySeverity(a, b) {
  const diff = (SEVERITY_ORDER[b.severity] ?? -1) - (SEVERITY_ORDER[a.severity] ?? -1);
  if (diff !== 0) return diff;
  // bei gleicher Severity: neueste zuerst
  return (b.publishedAt || 0) - (a.publishedAt || 0);
}

function buildNextKnownIds(knownIds, advisories, config) {
  // alle aktuell gesehenen IDs in den Stand uebernehmen,
  // aber alte IDs nach Cutoff Date wieder aushaengen, damit die Liste nicht unbegrenzt waechst
  const cutoffDate = config.maxAgeDays
    ? Date.now() - config.maxAgeDays * 24 * 60 * 60 * 1000
    : null;
  const fresh = new Set(knownIds || []);
  for (const advisory of advisories) {
    const id = advisory.ghsa_id || advisory.id;
    if (!id) continue;
    const published = parseDate(advisory.published_at);
    if (cutoffDate && published && published < cutoffDate) continue;
    fresh.add(id);
  }
  return Array.from(fresh);
}

module.exports = {
  dedupeAndFilterAdvisories,
  normalizeAdvisory,
  SEVERITY_ORDER
};

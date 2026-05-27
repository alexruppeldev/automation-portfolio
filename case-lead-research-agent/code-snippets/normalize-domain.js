// Domain Normalisierung und Filter fuer die B2B Lead Recherche.
//
// Pipeline Stufe: SerpAPI Ergebnisse -> [Normalisierung + Blacklist] -> Website Fetch
//
// Aufgaben:
//  - URLs auf registrierbare Domains reduzieren
//  - Tracking-Subdomains (www, m, blog, shop, news) entfernen
//  - Tracking Query Params (utm_*, fbclid, gclid) wegfiltern
//  - Domains gegen Blacklist (Job Portale, Aggregatoren, Branchenbuecher) pruefen
//  - bereits bekannte Domains aus frueheren Laeufen ueberspringen
//  - Duplikate innerhalb desselben Laufs verwerfen

const TRACKING_SUBDOMAINS = new Set([
  "www", "m", "mobile", "blog", "news", "shop", "store", "en", "de", "fr", "it"
]);

const DEFAULT_BLACKLIST = [
  "linkedin.com", "xing.com", "indeed.com", "stepstone.de", "stellenanzeigen.de",
  "kununu.com", "monster.de", "glassdoor.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "youtube.com", "tiktok.com",
  "wikipedia.org", "wikidata.org",
  "gelbeseiten.de", "11880.com", "dasoertliche.de", "branchenbuch.com",
  "amazon.de", "amazon.com", "ebay.de", "etsy.com",
  "google.com", "google.de", "bing.com",
  "europa.eu", "bund.de"
];

const TRACKING_PARAMS = [
  /^utm_/, /^fbclid$/, /^gclid$/, /^mc_/, /^_hsenc$/, /^_hsmi$/, /^hsCtaTracking$/
];

function normalizeDomain(rawUrl) {
  if (!rawUrl) return null;
  let parsed;
  try {
    const withProto = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    parsed = new URL(withProto);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === "localhost") return null;

  // IP Adressen ablehnen
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;

  const parts = hostname.split(".");
  // Tracking Subdomains entfernen, aber nicht die letzten beiden Komponenten antasten
  while (parts.length > 2 && TRACKING_SUBDOMAINS.has(parts[0])) {
    parts.shift();
  }
  const domain = parts.join(".");
  return {
    domain,
    originalHost: parsed.hostname,
    path: parsed.pathname,
    cleanUrl: buildCleanUrl(parsed, domain)
  };
}

function buildCleanUrl(parsed, domain) {
  const filteredParams = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    if (TRACKING_PARAMS.some((re) => re.test(key))) continue;
    filteredParams.append(key, value);
  }
  const query = filteredParams.toString();
  return `https://${domain}${parsed.pathname.replace(/\/$/, "") || ""}${query ? `?${query}` : ""}`;
}

function isBlacklisted(domain, blacklist = DEFAULT_BLACKLIST) {
  if (!domain) return false;
  return blacklist.some((entry) => domain === entry || domain.endsWith(`.${entry}`));
}

function processSerpResults(serpResults, options = {}) {
  const blacklist = options.blacklist || DEFAULT_BLACKLIST;
  const knownDomains = new Set((options.knownDomains || []).map((d) => d.toLowerCase()));
  const allowedTlds = options.allowedTlds || null;

  const seen = new Set();
  const accepted = [];
  const rejected = { invalid: 0, blacklisted: 0, known: 0, duplicate: 0, wrongTld: 0 };

  for (const result of serpResults) {
    const url = result.link || result.url;
    const normalized = normalizeDomain(url);
    if (!normalized) {
      rejected.invalid += 1;
      continue;
    }
    if (isBlacklisted(normalized.domain, blacklist)) {
      rejected.blacklisted += 1;
      continue;
    }
    if (knownDomains.has(normalized.domain)) {
      rejected.known += 1;
      continue;
    }
    if (seen.has(normalized.domain)) {
      rejected.duplicate += 1;
      continue;
    }
    if (allowedTlds && !matchesTld(normalized.domain, allowedTlds)) {
      rejected.wrongTld += 1;
      continue;
    }

    seen.add(normalized.domain);
    accepted.push({
      domain: normalized.domain,
      url: normalized.cleanUrl,
      title: result.title || null,
      snippet: result.snippet || null,
      sourceQuery: result.query || null
    });
  }

  return {
    accepted,
    rejected,
    summary: {
      input: serpResults.length,
      accepted: accepted.length,
      rejectedTotal: Object.values(rejected).reduce((a, b) => a + b, 0)
    }
  };
}

function matchesTld(domain, allowedTlds) {
  return allowedTlds.some((tld) => {
    const normalized = tld.startsWith(".") ? tld.slice(1) : tld;
    return domain.endsWith(`.${normalized}`) || domain === normalized;
  });
}

module.exports = {
  normalizeDomain,
  isBlacklisted,
  processSerpResults,
  DEFAULT_BLACKLIST
};

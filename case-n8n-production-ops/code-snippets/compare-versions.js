// SemVer-Vergleich und Klassifizierung von n8n Updates.
//
// Pipeline Stufe: Aktuelle Version + Ziel-Version -> [Vergleich] -> Update Entscheidung
//
// Aufgaben:
//  - Versions-Strings parsen und vergleichen (auch mit "v" Prefix oder Pre-Release Tags)
//  - Update-Klasse bestimmen: none | patch | minor | major | downgrade
//  - Smoke Test Erwartung ableiten (z.B. Major Update braucht erweiterten Test)
//  - Empfehlung erzeugen, ob automatisches Update ausgefuehrt werden darf

const PRERELEASE_LABELS = ["alpha", "beta", "rc", "next", "canary"];

function compareVersions(currentRaw, targetRaw) {
  const current = parseVersion(currentRaw);
  const target = parseVersion(targetRaw);

  if (!current.valid || !target.valid) {
    return {
      ok: false,
      error: {
        code: "INVALID_VERSION",
        message: "Eine der Versionen ist nicht parsbar.",
        current: currentRaw,
        target: targetRaw
      }
    };
  }

  const ordering = compareParsed(current, target);
  const updateClass = classifyUpdate(current, target, ordering);
  const smokeTest = recommendSmokeTest(updateClass, target);

  return {
    ok: true,
    current: current.formatted,
    target: target.formatted,
    ordering, // -1, 0, 1
    updateClass,
    isPrerelease: target.prerelease !== null,
    smokeTest,
    autoUpdateAllowed: isAutoUpdateAllowed(updateClass, target)
  };
}

function parseVersion(raw) {
  if (!raw) return { valid: false };
  const cleaned = String(raw).trim().replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/);
  if (!match) return { valid: false };

  const [, major, minor, patch, prerelease = null, build = null] = match;
  return {
    valid: true,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease,
    build,
    formatted: cleaned
  };
}

function compareParsed(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

function comparePrerelease(a, b) {
  if (a === null && b === null) return 0;
  // eine Version ohne Pre-Release ist groesser als eine mit
  if (a === null) return 1;
  if (b === null) return -1;
  const aParts = a.split(".");
  const bParts = b.split(".");
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const ap = aParts[i];
    const bp = bParts[i];
    if (ap === bp) continue;
    if (ap === undefined) return -1;
    if (bp === undefined) return 1;
    const aNum = /^\d+$/.test(ap);
    const bNum = /^\d+$/.test(bp);
    if (aNum && bNum) return Number(ap) < Number(bp) ? -1 : 1;
    if (aNum) return -1;
    if (bNum) return 1;
    return ap < bp ? -1 : 1;
  }
  return 0;
}

function classifyUpdate(current, target, ordering) {
  if (ordering === 0) return "none";
  if (ordering === 1) return "downgrade";
  if (current.major !== target.major) return "major";
  if (current.minor !== target.minor) return "minor";
  return "patch";
}

function recommendSmokeTest(updateClass, target) {
  const isPrerelease = target.prerelease !== null;
  if (updateClass === "none") return { required: false };
  if (updateClass === "downgrade") {
    return {
      required: true,
      level: "full",
      reason: "Downgrade kann Datenmodell- oder Migrations-Inkompatibilitaeten ausloesen."
    };
  }
  if (updateClass === "major" || isPrerelease) {
    return {
      required: true,
      level: "full",
      reason: isPrerelease
        ? "Pre-Release Versionen erfordern vollstaendigen Smoke Test."
        : "Major Update kann Breaking Changes enthalten."
    };
  }
  if (updateClass === "minor") {
    return {
      required: true,
      level: "standard",
      reason: "Minor Update koennte neue Features mit Seiteneffekten enthalten."
    };
  }
  return { required: true, level: "minimal", reason: "Patch Update, kurzer Healthcheck reicht." };
}

function isAutoUpdateAllowed(updateClass, target) {
  if (target.prerelease !== null) return false;
  if (PRERELEASE_LABELS.some((label) => target.prerelease && target.prerelease.includes(label))) return false;
  return updateClass === "patch" || updateClass === "minor";
}

module.exports = {
  compareVersions,
  parseVersion
};

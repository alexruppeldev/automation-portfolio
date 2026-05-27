// Aggregiert mehrere Subsystem Checks zu einer Healthcheck Response.
//
// Pipeline Stufe: Healthcheck Webhook -> [Aggregator] -> HTTP Response
//
// Liefert pro Subsystem (Datenbank, Storage, externe API, Worker Queue)
// einen Status (ok | degraded | down) und aggregiert das zu einem
// Gesamtstatus. Die Response ist mit RFC 8615 / health+json kompatibel
// und kann von externen Monitoring Tools wie UptimeRobot oder Healthchecks.io
// direkt verarbeitet werden.

const STATUS = {
  OK: "ok",
  DEGRADED: "degraded",
  DOWN: "down"
};

const SEVERITY_ORDER = { ok: 0, degraded: 1, down: 2 };

function buildHealthResponse(subsystemResults, options = {}) {
  const startTime = options.processStartTime || Date.now();
  const checks = subsystemResults.map(normalizeCheck);
  const overall = aggregateStatus(checks);

  return {
    status: overall,
    service: options.serviceName || "n8n-automation",
    version: options.version || null,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: checks.reduce((acc, check) => {
      acc[check.name] = {
        status: check.status,
        durationMs: check.durationMs,
        message: check.message || undefined,
        observed: check.observed || undefined
      };
      return acc;
    }, {})
  };
}

function normalizeCheck(raw) {
  const status = STATUS[String(raw.status || "").toUpperCase()] || STATUS.DOWN;
  return {
    name: raw.name || "unknown",
    status,
    durationMs: typeof raw.durationMs === "number" ? raw.durationMs : null,
    message: raw.message || null,
    observed: raw.observed || null
  };
}

function aggregateStatus(checks) {
  if (checks.length === 0) return STATUS.OK;
  return checks.reduce((worst, check) => {
    return SEVERITY_ORDER[check.status] > SEVERITY_ORDER[worst]
      ? check.status
      : worst;
  }, STATUS.OK);
}

function httpStatusFor(healthStatus) {
  switch (healthStatus) {
    case STATUS.OK: return 200;
    case STATUS.DEGRADED: return 200;
    case STATUS.DOWN: return 503;
    default: return 503;
  }
}

// Beispiel-Subsystem-Checker fuer einen DB Ping
async function checkDatabase(ping) {
  const start = Date.now();
  try {
    await ping();
    return {
      name: "database",
      status: STATUS.OK,
      durationMs: Date.now() - start
    };
  } catch (error) {
    return {
      name: "database",
      status: STATUS.DOWN,
      durationMs: Date.now() - start,
      message: error.message
    };
  }
}

module.exports = {
  buildHealthResponse,
  httpStatusFor,
  checkDatabase,
  STATUS
};

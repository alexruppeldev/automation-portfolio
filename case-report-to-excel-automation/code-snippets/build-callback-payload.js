// Erzeugt die Callback Payloads fuer Erfolg und Fehler nach dem Report Lauf.
//
// Pipeline Stufe: Excel hochladen -> [Success/Error Callback] -> SugarCRM Webhook
//
// Drei Builder:
//  - buildSuccessCallback fuer erfolgreich erzeugte und hochgeladene Reports
//  - buildErrorCallback fuer Fehler an beliebiger Stelle der Pipeline
//  - buildPartialCallback fuer Faelle, in denen die Datei zwar erstellt wurde,
//    der CRM Upload aber fehlgeschlagen ist (z.B. Token Probleme)

const ERROR_CODES = {
  REPORT_GENERATION_FAILED: "Report Erstellung fehlgeschlagen.",
  TEMPLATE_MAPPING_FAILED: "Template Mapping fehlgeschlagen.",
  CSV_PARSE_FAILED: "CSV konnte nicht gelesen werden.",
  CRM_UPLOAD_FAILED: "CRM Upload fehlgeschlagen.",
  CRM_AUTH_FAILED: "Authentifizierung am CRM fehlgeschlagen.",
  TIMEOUT: "Verarbeitung hat das Zeitlimit ueberschritten."
};

function buildSuccessCallback(request, result) {
  return {
    correlationId: request.correlationId,
    reportId: request.reportId,
    status: "success",
    document: {
      id: result.documentId,
      fileName: result.fileName,
      sizeBytes: result.fileSize || null,
      sheet: result.sheet || null
    },
    metrics: {
      rowsProcessed: result.rowsProcessed || 0,
      cellsWritten: result.cellsWritten || 0,
      durationMs: result.durationMs || null
    },
    message: "Generated report was uploaded to CRM.",
    completedAt: new Date().toISOString()
  };
}

function buildErrorCallback(request, error) {
  const code = error.code && ERROR_CODES[error.code] ? error.code : "REPORT_GENERATION_FAILED";
  return {
    correlationId: request.correlationId,
    reportId: request.reportId,
    status: "error",
    errorCode: code,
    errorStage: error.stage || "unknown",
    message: error.publicMessage || ERROR_CODES[code],
    retryable: isRetryable(code),
    completedAt: new Date().toISOString()
  };
}

function buildPartialCallback(request, result, error) {
  return {
    correlationId: request.correlationId,
    reportId: request.reportId,
    status: "partial",
    errorCode: error.code || "CRM_UPLOAD_FAILED",
    message: "Report wurde erstellt, aber der CRM Upload ist fehlgeschlagen.",
    localArtifact: {
      fileName: result.fileName,
      retentionHint: "Datei steht intern fuer manuellen Upload bereit."
    },
    retryable: true,
    completedAt: new Date().toISOString()
  };
}

function isRetryable(code) {
  return ["CRM_UPLOAD_FAILED", "CRM_AUTH_FAILED", "TIMEOUT"].includes(code);
}

function withRequestContext(callback, request) {
  return {
    ...callback,
    requestedBy: request.requestedBy ? request.requestedBy.id : null,
    receivedAt: request.receivedAt
  };
}

module.exports = {
  buildSuccessCallback,
  buildErrorCallback,
  buildPartialCallback,
  withRequestContext,
  ERROR_CODES
};

// Deterministischer Vergleich zugeordneter Positionen.
//
// Pipeline Stufe: Positionsmatching -> [Vergleich] -> Historie anwenden -> HTML Pruefbericht
//
// Die KI liest nur aus. Ob eine Abweichung vorliegt, entscheiden ausschliesslich
// diese Regeln. Das macht jedes Ergebnis nachvollziehbar und reproduzierbar.
//
// Schweregrade:  MATCH < INFO < REVIEW < BLOCKING
// Gesamtstatus:  MATCH | MANUAL_REVIEW | MISMATCH
//
// Preistoleranz gilt nur fuer Preisfelder. Menge und Rabatt muessen exakt passen.
// Fehlende oder zusaetzliche Positionen bekommen einen eigenen Check positionPresence,
// damit auch sie im Bericht ein Feedbackfeld erhalten.

const SEVERITY = { MATCH: 0, INFO: 1, REVIEW: 2, BLOCKING: 3 };
const worst = (list) => list.reduce((current, value) => SEVERITY[value] > SEVERITY[current] ? value : current, 'MATCH');

const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const text = (value) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

function createComparer(tolerance) {
  const compareNumber = (a, b, fieldId, label, useTolerance = true, unit = '') => {
    if (a === null || a === undefined || b === null || b === undefined) {
      const bothEmpty = (a === null || a === undefined) && (b === null || b === undefined);
      return { fieldId, field: label, comparisonType: bothEmpty ? 'BOTH_EMPTY' : 'ONE_SIDED',
        severity: bothEmpty ? 'MATCH' : 'INFO', orderValue: a, confirmationValue: b, difference: null, unit,
        message: label + ' ist nicht in beiden Belegen angegeben.' };
    }
    const difference = roundCurrency(b - a);
    const absolute = Math.abs(difference);
    const percent = Math.abs(a) < 1e-12 ? (Math.abs(b) < 1e-12 ? 0 : null) : absolute / Math.abs(a) * 100;
    const within = useTolerance
      ? (percent === null ? absolute < 0.005 : (percent <= tolerance + 1e-9 || absolute < 0.005))
      : absolute < 1e-9;
    return {
      fieldId, field: label,
      comparisonType: within ? 'EQUAL' : 'DIFFERENT',
      severity: within ? 'MATCH' : 'BLOCKING',
      orderValue: a, confirmationValue: b, difference, differencePercent: percent, unit,
      message: within ? label + ' stimmt überein.' : label + ' weicht um ' + difference.toFixed(2) + ' ' + unit + ' ab.',
    };
  };

  const compareText = (a, b, fieldId, label, mismatchSeverity = 'INFO', oneSidedSeverity = 'REVIEW') => {
    const left = text(a);
    const right = text(b);
    if (!left && !right) return null;
    if (!left) return { fieldId, field: label, comparisonType: 'ADDED_IN_CONFIRMATION', severity: oneSidedSeverity,
      orderValue: a, confirmationValue: b, message: label + ' wird nur in der Auftragsbestätigung festgelegt.' };
    if (!right) return { fieldId, field: label, comparisonType: 'MISSING_IN_CONFIRMATION', severity: oneSidedSeverity,
      orderValue: a, confirmationValue: b, message: label + ' steht in der Bestellung, fehlt aber in der Auftragsbestätigung.' };
    const equal = left === right;
    return { fieldId, field: label, comparisonType: equal ? 'EQUAL' : 'DIFFERENT', severity: equal ? 'MATCH' : mismatchSeverity,
      orderValue: a, confirmationValue: b, message: equal ? label + ' stimmt überein.' : label + ' unterscheidet sich.' };
  };

  return { compareNumber, compareText };
}

function comparePosition(match, left, right, tolerance, currency = 'EUR') {
  const { compareNumber, compareText } = createComparer(tolerance);

  if (!left || !right) {
    return {
      ...match,
      checks: [{ fieldId: 'positionPresence', field: 'Position vorhanden', comparisonType: match.matchingStatus,
        severity: 'REVIEW', orderValue: left ? left.sourcePosition : null, confirmationValue: right ? right.sourcePosition : null }],
      severity: 'REVIEW',
      status: match.matchingStatus,
    };
  }

  const checks = [];
  checks.push(compareNumber(left.quantity, right.quantity, 'quantity', 'Menge', false));
  const unitCheck = compareText(left.unit, right.unit, 'unit', 'Einheit', 'REVIEW', 'INFO');
  if (unitCheck) checks.push(unitCheck);
  checks.push(compareNumber(left.unitPriceBeforeDiscount, right.unitPriceBeforeDiscount, 'unitPriceBeforeDiscount', 'Preis vor Rabatt', true, currency));
  checks.push(compareNumber(left.effectiveDiscountPercent, right.effectiveDiscountPercent, 'effectiveDiscountPercent', 'Rabatt in Prozentpunkten', false, '%'));
  checks.push(compareNumber(left.effectiveUnitPrice, right.effectiveUnitPrice, 'effectiveUnitPrice', 'Effektiver Stückpreis', true, currency));
  checks.push(compareNumber(left.lineTotal, right.lineTotal, 'lineTotal', 'Positionssumme', true, currency));
  const deliveryCheck = compareText(left.deliveryText, right.deliveryText, 'positionDeliveryText', 'Liefertermin Position', 'INFO', 'INFO');
  if (deliveryCheck) checks.push(deliveryCheck);

  const severity = worst(checks.map((check) => check.severity));
  return {
    ...match,
    checks,
    severity,
    status: (severity === 'MATCH' || severity === 'INFO') ? 'MATCH' : (severity === 'BLOCKING' ? 'MISMATCH' : 'REVIEW'),
  };
}

// Summe der Positionsabweichungen gegen Differenz der Belegsummen.
// Passt das nicht, fehlt vermutlich eine Position oder eine Nebenkostenzeile.
function reconcile(positionResults, order, confirmation) {
  const positionDelta = roundCurrency(positionResults
    .reduce((sum, result) => {
      const check = result.checks.find((entry) => entry.fieldId === 'lineTotal');
      return sum + (check && typeof check.difference === 'number' ? check.difference : 0);
    }, 0));
  const documentDelta = (order.netTotal !== null && confirmation.netTotal !== null)
    ? roundCurrency(confirmation.netTotal - order.netTotal) : null;
  return {
    positionDelta,
    documentDelta,
    consistent: documentDelta === null ? null : Math.abs(positionDelta - documentDelta) < 0.005,
  };
}

function overallStatus(severities) {
  return { MATCH: 'MATCH', INFO: 'MATCH', REVIEW: 'MANUAL_REVIEW', BLOCKING: 'MISMATCH' }[worst(severities)];
}

module.exports = { comparePosition, reconcile, overallStatus, createComparer };

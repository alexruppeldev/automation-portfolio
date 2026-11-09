// Prüft, ob Bestellung und Auftragsbestätigung überhaupt zusammengehören.
//
// Pipeline Stufe: KI-Extraktion beider PDFs -> [Belegpaarung] -> Positionsmatching
//
// Ohne diese Prüfung würde ein falsch hochgeladenes Belegpaar Position für
// Position verglichen und liefert einen Bericht voller Scheinabweichungen.
//
// Status:
//  - PAIRED               mindestens ein Merkmal passt, keins widerspricht
//  - UNVERIFIED           nichts widerspricht, aber nichts ist bestätigt
//  - WRONG_DOCUMENT_PAIR  mindestens ein Konflikt, Matching wird blockiert

const tokens = (value) => String(value ?? '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);

// Bestellnummer als zusammenhängende Token-Folge in einem Referenztext suchen,
// z. B. "BE-2026-0417" in "Ihre Bestellung BE-2026-0417 vom 14.09.2026"
const containsSequence = (haystack, needle) => {
  if (needle.length === 0 || haystack.length < needle.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    if (needle.every((token, j) => haystack[i + j] === token)) return true;
  }
  return false;
};

// Rechtsformen ignorieren, damit "Muster GmbH" und "Muster" gleich sind
const companyKey = (value) => tokens(value)
  .filter((token) => !['GMBH', 'AG', 'KG', 'OHG', 'MBH', 'CO', 'UG', 'SE', 'GBR', 'EK'].includes(token))
  .join('');

function checkDocumentPairing(order, confirmation) {
  const checks = [];
  const addCheck = (field, result, detail) => checks.push({ field, result, detail });

  const orderSupplier = companyKey(order.supplier);
  const confirmationSupplier = companyKey(confirmation.supplier);
  if (!orderSupplier || !confirmationSupplier) {
    addCheck('Lieferant', 'UNKNOWN', 'In mindestens einem Beleg nicht eindeutig lesbar.');
  } else if (orderSupplier === confirmationSupplier || orderSupplier.includes(confirmationSupplier) || confirmationSupplier.includes(orderSupplier)) {
    addCheck('Lieferant', 'MATCH', order.supplier + ' / ' + confirmation.supplier);
  } else {
    addCheck('Lieferant', 'CONFLICT', 'Bestellung nennt "' + order.supplier + '", Bestätigung nennt "' + confirmation.supplier + '".');
  }

  const orderNumberTokens = tokens(order.orderNumber);
  const confirmationReferences = [confirmation.orderNumber, ...(confirmation.referenceTexts || [])].filter(Boolean);
  if (orderNumberTokens.length === 0) {
    addCheck('Bestellnummer', 'UNKNOWN', 'Die Bestellung nennt keine Bestellnummer.');
  } else if (confirmationReferences.some((reference) => containsSequence(tokens(reference), orderNumberTokens))) {
    addCheck('Bestellnummer', 'MATCH', order.orderNumber);
  } else {
    addCheck('Bestellnummer', 'CONFLICT', 'Bestellnummer "' + order.orderNumber + '" taucht in keiner Referenzangabe der Bestätigung auf.');
  }

  const orderCustomerNumber = tokens(order.customerNumber).join('');
  const confirmationCustomerNumber = tokens(confirmation.customerNumber).join('');
  if (!orderCustomerNumber || !confirmationCustomerNumber) {
    addCheck('Kundennummer', 'UNKNOWN', 'Nicht in beiden Belegen ausgewiesen.');
  } else if (orderCustomerNumber === confirmationCustomerNumber) {
    addCheck('Kundennummer', 'MATCH', confirmation.customerNumber);
  } else {
    addCheck('Kundennummer', 'CONFLICT', orderCustomerNumber + ' gegen ' + confirmationCustomerNumber);
  }

  const orderCurrency = String(order.currency || '').toUpperCase().trim();
  const confirmationCurrency = String(confirmation.currency || '').toUpperCase().trim();
  if (!orderCurrency || !confirmationCurrency) {
    addCheck('Währung', 'UNKNOWN', 'Nicht in beiden Belegen ausgewiesen.');
  } else if (orderCurrency === confirmationCurrency) {
    addCheck('Währung', 'MATCH', orderCurrency);
  } else {
    addCheck('Währung', 'CONFLICT', orderCurrency + ' gegen ' + confirmationCurrency);
  }

  const conflicts = checks.filter((check) => check.result === 'CONFLICT');
  const confirmedMatches = checks.filter((check) => check.result === 'MATCH');
  const status = conflicts.length > 0
    ? 'WRONG_DOCUMENT_PAIR'
    : (confirmedMatches.length === 0 ? 'UNVERIFIED' : 'PAIRED');

  return { status, checks };
}

module.exports = { checkDocumentPairing };

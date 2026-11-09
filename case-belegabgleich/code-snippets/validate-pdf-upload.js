// Validiert den Formular-Upload, bevor ein einziger OpenAI Aufruf entsteht.
//
// Pipeline Stufe: Form Trigger -> [Eingaben validieren] -> Eingabe gueltig? -> PDF vorbereiten
//
// Schwerpunkte:
//  - PDF nicht nur ueber Endung und MIME Typ pruefen, sondern ueber die Signatur %PDF-
//    (eine umbenannte TXT oder JSON Datei faellt damit raus)
//  - E-Mail und Preistoleranz pruefen
//  - Feedback-URL fuer den interaktiven Bericht aus den Request Headern der aktuellen
//    n8n Instanz ableiten, statt localhost oder eine Testinstanz fest einzutragen
//
// Im n8n Code Node kommt der Buffer ueber this.helpers.getBinaryDataBuffer(0, property).

const PDF_SIGNATURE = '%PDF-';

function validatePdfFile(file, buffer, label) {
  if (!file) return label + ' fehlt.';

  let valid = true;
  const mime = String(file.mimeType || '').toLowerCase();
  const name = String(file.fileName || '').toLowerCase();

  if (!name.endsWith('.pdf')) valid = false;
  if (mime && mime !== 'application/pdf') valid = false;
  if (!buffer || buffer.subarray(0, 5).toString('ascii') !== PDF_SIGNATURE) valid = false;

  return valid ? null : label + ' muss eine gültige PDF-Datei sein.';
}

function validateForm(json, files) {
  const errors = [];

  const orderError = validatePdfFile(files.order_pdf?.meta, files.order_pdf?.buffer, 'Bestell-Datei');
  if (orderError) errors.push(orderError);
  const confirmationError = validatePdfFile(files.confirmation_pdf?.meta, files.confirmation_pdf?.buffer, 'Auftragsbestätigungs-Datei');
  if (confirmationError) errors.push(confirmationError);

  const email = String(json.recipient_email || '').trim();
  if (!email) errors.push('E-Mail-Adresse fehlt.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('E-Mail-Adresse ist nicht plausibel.');
  }

  const tolerance = Number(String(json.price_tolerance_percent ?? '0').replace(',', '.'));
  if (!Number.isFinite(tolerance)) errors.push('Preistoleranz muss numerisch sein.');
  if (Number.isFinite(tolerance) && tolerance < 0) errors.push('Preistoleranz darf nicht negativ sein.');

  // hinter einem Reverse Proxy stehen Protokoll und Host in x-forwarded-*
  const headers = json.headers && typeof json.headers === 'object' ? json.headers : {};
  const firstHeader = (value) => String(value ?? '').split(',')[0].trim();
  let protocol = firstHeader(headers['x-forwarded-proto']);
  const host = firstHeader(headers['x-forwarded-host']) || firstHeader(headers.host);
  if (!protocol && host) {
    protocol = /^(localhost|127\.0\.0\.1)(:|$)/i.test(host) ? 'http' : 'https';
  }
  if (!host) errors.push('n8n-Adresse konnte aus den Request-Headern nicht ermittelt werden.');

  return {
    inputValid: errors.length === 0,
    inputErrors: errors,
    recipientEmail: email,
    priceTolerancePercent: Number.isFinite(tolerance) ? tolerance : 0,
    feedbackWebhookUrl: host ? protocol + '://' + host + '/webhook/belegabgleich-feedback' : null,
  };
}

module.exports = { validateForm, validatePdfFile };

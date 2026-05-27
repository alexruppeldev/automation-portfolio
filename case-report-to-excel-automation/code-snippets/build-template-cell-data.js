// Baut die Cell Daten Liste fuer die Excel Template Befuellung.
//
// Pipeline Stufe: CSV Inhalt -> [Header Mapping + Cell Mapping] -> XLSX Cells befuellen
//
// Aufgabe:
//  - CSV Header gegen die Header der Excel Vorlage matchen (case- und whitespace-tolerant)
//  - pro CSV Zeile eine Liste von Cell Updates erzeugen ({sheet, address, value, type})
//  - Werte nach Typ casten (Number, Currency, Date, Text)
//  - optionale Aggregations-Zeile (Summen und Durchschnitt) am Ende anhaengen

const NUMBER_LOCALES = {
  de: { decimal: ",", thousands: "." },
  en: { decimal: ".", thousands: "," }
};

function buildTemplateCellData(templateHeaders, csvRows, options = {}) {
  const headerMap = buildHeaderMap(templateHeaders);
  const locale = options.locale || "de";
  const startRow = options.startRow || 5;
  const sheet = options.sheet || "Sheet1";

  const matchedHeaders = matchCsvHeaders(csvRows[0] || [], headerMap);
  if (matchedHeaders.matched.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_HEADERS_MATCHED",
        message: "Keine CSV Spalte konnte einer Template Spalte zugeordnet werden.",
        csvHeaders: csvRows[0],
        templateHeaders: templateHeaders.map((h) => h.label)
      }
    };
  }

  const cellData = [];
  const dataRows = csvRows.slice(1);
  const totals = initTotals(matchedHeaders.matched);

  dataRows.forEach((row, rowIndex) => {
    const excelRow = startRow + rowIndex;
    for (const match of matchedHeaders.matched) {
      const rawValue = row[match.csvIndex];
      const typed = castValue(rawValue, match.template.type, locale);
      cellData.push({
        sheet,
        address: `${match.template.column}${excelRow}`,
        value: typed.value,
        type: typed.type
      });
      accumulateTotal(totals, match.template.label, typed);
    }
  });

  if (options.appendTotals) {
    appendTotalsRow({
      cellData,
      totals,
      matched: matchedHeaders.matched,
      sheet,
      row: startRow + dataRows.length
    });
  }

  return {
    ok: true,
    cellData,
    summary: {
      rowsProcessed: dataRows.length,
      cellsWritten: cellData.length,
      headersMatched: matchedHeaders.matched.length,
      headersUnmatched: matchedHeaders.unmatched
    }
  };
}

function buildHeaderMap(templateHeaders) {
  const map = new Map();
  for (const header of templateHeaders) {
    const key = normalizeHeaderKey(header.label);
    map.set(key, header);
    // gaengige Synonyme als zusaetzliche Keys registrieren
    if (header.aliases) {
      for (const alias of header.aliases) {
        map.set(normalizeHeaderKey(alias), header);
      }
    }
  }
  return map;
}

function matchCsvHeaders(csvHeaderRow, headerMap) {
  const matched = [];
  const unmatched = [];
  csvHeaderRow.forEach((label, csvIndex) => {
    const key = normalizeHeaderKey(label);
    const template = headerMap.get(key);
    if (template) {
      matched.push({ csvIndex, csvLabel: label, template });
    } else {
      unmatched.push(label);
    }
  });
  return { matched, unmatched };
}

function normalizeHeaderKey(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[äöüß]/g, (ch) => ({ "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" }[ch]))
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function castValue(rawValue, type, locale) {
  const value = rawValue == null ? "" : String(rawValue).trim();
  if (value === "") return { value: null, type: "blank" };

  switch (type) {
    case "number":
      return castNumber(value, locale);
    case "currency":
      return castCurrency(value, locale);
    case "date":
      return castDate(value);
    case "percent":
      return castPercent(value, locale);
    default:
      return { value, type: "text" };
  }
}

function castNumber(value, locale) {
  const { decimal, thousands } = NUMBER_LOCALES[locale] || NUMBER_LOCALES.de;
  const cleaned = value
    .replace(new RegExp(`\\${thousands}`, "g"), "")
    .replace(decimal, ".");
  const parsed = Number(cleaned);
  if (Number.isFinite(parsed)) {
    return { value: parsed, type: "number" };
  }
  return { value, type: "text" };
}

function castCurrency(value, locale) {
  const numeric = value.replace(/[€$£\s]/g, "");
  const cast = castNumber(numeric, locale);
  if (cast.type === "number") {
    return { value: cast.value, type: "currency" };
  }
  return { value, type: "text" };
}

function castPercent(value, locale) {
  const numeric = value.replace(/%\s*$/, "");
  const cast = castNumber(numeric, locale);
  if (cast.type === "number") {
    return { value: cast.value / 100, type: "percent" };
  }
  return { value, type: "text" };
}

function castDate(value) {
  // ISO Datum direkt
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return { value: date, type: "date" };
  }
  // deutsches Datum dd.mm.yyyy
  const dotMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, dd, mm, yyyy] = dotMatch;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(date.getTime())) return { value: date, type: "date" };
  }
  return { value, type: "text" };
}

function initTotals(matched) {
  const totals = {};
  for (const match of matched) {
    if (["number", "currency", "percent"].includes(match.template.type)) {
      totals[match.template.label] = { sum: 0, count: 0, type: match.template.type, column: match.template.column };
    }
  }
  return totals;
}

function accumulateTotal(totals, label, typed) {
  const entry = totals[label];
  if (!entry) return;
  if (typed.type === "number" || typed.type === "currency" || typed.type === "percent") {
    entry.sum += typed.value;
    entry.count += 1;
  }
}

function appendTotalsRow({ cellData, totals, sheet, row }) {
  for (const [, entry] of Object.entries(totals)) {
    if (entry.count === 0) continue;
    const value = entry.type === "number" ? entry.sum : entry.sum;
    cellData.push({
      sheet,
      address: `${entry.column}${row}`,
      value,
      type: entry.type,
      isAggregate: true
    });
  }
}

module.exports = {
  buildTemplateCellData,
  normalizeHeaderKey,
  castValue
};

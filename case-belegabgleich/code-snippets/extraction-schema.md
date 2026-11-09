# KI-Extraktion: Schema und Regeln

Beide PDFs gehen einzeln als Base64 an die OpenAI Responses API. Die Antwort ist über `text.format` mit `strict: true` an ein festes JSON Schema gebunden. Jedes Feld ist Pflicht, unbekannte Werte kommen als `null`.

## Dokument

| Feld | Typ | Zweck |
|---|---|---|
| `documentType` | enum `order` / `confirmation` | Rolle des Belegs |
| `supplier`, `customer`, `customerNumber` | string \| null | Belegpaarung |
| `orderNumber`, `confirmationNumber` | string \| null | Belegpaarung |
| `referenceTexts` | string[] | Freitext Referenzen, z. B. "Ihre Bestellung ... vom ..." |
| `currency` | string \| null | Belegpaarung und Vergleich |
| `paymentTerms`, `incoterms`, `deliveryText`, `deliveryInstructions` | string \| null | Vertragsfelder |
| `additionalTerms` | string[] | weitere Bedingungen |
| `netTotal`, `vatRate`, `vatAmount`, `grossTotal` | number \| null | Summenprüfung |
| `positions` | Position[] | nur Warenpositionen |
| `nonItemLines` | NonItemLine[] | Zwischensummen, Fracht, Rabatte, Steuer, Text |
| `extractionWarnings` | string[] | Unsicherheiten der KI |

## Position

| Feld | Typ |
|---|---|
| `sourcePosition` | string \| null |
| `articleNumber`, `manufacturerArticleNumber` | string \| null |
| `description`, `configurationText`, `variant` | string \| null |
| `quantity`, `unit` | number \| null, string \| null |
| `unitPriceBeforeDiscount` | number \| null |
| `discountComponents` | number[] (z. B. Staffelrabatt 40 + 5) |
| `effectiveDiscountPercent` | number \| null |
| `lineTotal` | number \| null |
| `deliveryText`, `sourcePage` | string \| null, number \| null |

## NonItemLine

```json
{
  "lineType": "SUBTOTAL | CHARGE | DISCOUNT | TAX | TOTAL | TEXT | UNKNOWN",
  "label": "Frachtpauschale",
  "amount": 45.00
}
```

## Plausibilisierung nach der KI-Antwort

Die KI-Antwort wird nicht ungeprüft übernommen. Ein Code Node rechnet nach:

- Menge x effektiver Stückpreis gegen `lineTotal`
- Rabattkomponenten gegen `effectiveDiscountPercent`
- Summe der Positionen plus Nicht-Warenzeilen gegen `netTotal`
- `netTotal` + `vatAmount` gegen `grossTotal`

Bei Widersprüchen läuft genau ein Korrekturdurchlauf am Originaldokument, mit den gefundenen Widersprüchen im Prompt. Danach gilt das Ergebnis als `VALID` oder geht mit `REVIEW` in den Bericht.

## Datenschutz

- `store: false` bei allen OpenAI Requests
- PDFs werden nicht in PostgreSQL gespeichert, nur Prüflauf-Metadaten und Prüferfeedback
- Im Normalfall 2 API Aufrufe pro Prüfung, maximal 4 mit Korrekturläufen

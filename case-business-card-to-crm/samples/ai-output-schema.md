# AI Output Schema

Dieses Schema beschreibt die bereinigte Antwort des AI Visitenkarten Scans.
Der Output wird vom Frontend angezeigt und kann danach an die CRM Lead Erstellung übergeben werden.

```json
{
  "ok": true,
  "result_text": "Human readable scan result",
  "card": {
    "firma": "string|null",
    "vorname": "string|null",
    "nachname": "string|null",
    "job_titel": "string|null",
    "email": "string|null",
    "telefon_mobil": "string|null",
    "telefon_buero": "string|null",
    "telefax": "string|null",
    "webseite": "string|null",
    "adresse_strasse": "string|null",
    "adresse_plz": "string|null",
    "adresse_stadt": "string|null",
    "adresse_land": "string|null",
    "source": "ai_business_card_scan",
    "confidence_note": "string"
  },
  "count": 1,
  "errors": []
}
```

# n8n Production Ops

Betriebsnahe n8n Automationen für Backup, Security Advisory Monitoring, Update Check und Healthcheck.

## Stack

n8n, GitHub Security Advisories API, Docker Update Workflow, Slack/E-Mail Benachrichtigung, interner Healthcheck Endpoint.

## Ablauf

```mermaid
flowchart TB
  A[Daily Backup] --> B[Backup Summary]
  C[Security Advisory Monitor] --> D[Security Alert]
  E[n8n Update Check] --> F[Update Hinweis]
  G[Update Result Callback] --> H[Smoke Test Ergebnis]
  I[Internal Healthcheck] --> J[Healthy Response]
```

## Screenshots

### Ops Canvas
![Ops Canvas](screenshots/01-overview.png)

### Backup Ergebnis
![Backup Ergebnis](screenshots/02-result-backup.png)

### Security Advisory
![Security Advisory](screenshots/03-result-advisory.png)

### Update Check
![Update Check](screenshots/04-result-update-check.png)

### Update Callback
![Update Callback](screenshots/05-result-update-callback.png)

## Code Snippets

| Datei | Zweck |
|---|---|
| `code-snippets/build-health-response.js` | Aggregiert mehrere Subsystem Checks zu einer health+json kompatiblen Response, leitet HTTP Status ab |
| `code-snippets/dedupe-advisories.js` | Filtert GitHub Advisories nach Severity, Alter und Relevanz, pflegt rollierende Known-IDs Liste |
| `code-snippets/compare-versions.js` | SemVer-Vergleich, Update-Klassifizierung (patch/minor/major), Smoke Test Empfehlung, Auto-Update Entscheidung |

## Inhalt

```text
screenshots/    Demo Bilder
samples/        Beispiel Input und Output
code-snippets/  Ausgewählte bereinigte Logik
```

Die vollständigen n8n Workflow Exporte sind bewusst nicht enthalten.

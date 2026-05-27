# Automation Portfolio

Praktische Demos aus realen n8n, AI und SugarCRM Projekten. Sanitisiert, anonymisiert, ohne Workflow Exporte und Credentials.

> **Hinweis fuer Recruiter:** Dieses Repo enthaelt Architektur Screenshots, Code Auszuege und Beispiel Payloads. Die vollstaendigen n8n Workflow Exporte werden bewusst nicht veroeffentlicht, weil sie kundenspezifische Logik enthalten. Eine Live Demo oder ein Walkthrough kann auf Anfrage gezeigt werden.

## Kontakt

- **Name:** Alexander Ruppel
- **Rolle:** n8n Automation und SugarCRM Developer
- **GitHub:** [github.com/alexruppeldev](https://github.com/alexruppeldev)
- **Standort:** Nuernberg, Deutschland
- **Kontakt:** ueber GitHub Profil

## Tech Stack

| Bereich | Werkzeuge |
|---|---|
| Automation | n8n (self hosted, Docker), Webhooks, OAuth 2.0, asynchrone Callbacks |
| AI | Gemini, OpenAI, strukturierte JSON Extraktion, Prompt Engineering |
| CRM | SugarCRM REST API v11, Lead und Contact Modelle, Duplikatpruefung |
| Daten | XLSX, CSV, SerpAPI, HTML Parsing |
| Betrieb | Backup Automation, Healthchecks, Security Advisory Monitoring, Update Workflow |

## Cases

| # | Case | Was es loest | Stack |
|---|---|---|---|
| 1 | [AI Visitenkarten Import](case-business-card-to-crm/) | Visitenkarte fotografieren, Felder per AI extrahieren, als SugarCRM Lead vorbereiten | n8n, Gemini Vision, SugarCRM, OAuth |
| 2 | [Report to Excel Automation](case-report-to-excel-automation/) | CSV Report annehmen, Excel Vorlage befuellen, im CRM ablegen, Callback | n8n, XLSX, SugarCRM, async Webhook |
| 3 | [Smart Lead Import](case-smart-lead-import/) | Freitext zu strukturiertem Lead, Duplikatpruefung gegen Lead und Contact | n8n, Gemini, SugarCRM, Duplicate Detection |
| 4 | [n8n Production Ops](case-n8n-production-ops/) | Backup, Security Advisories, Update Check, Healthcheck | n8n, GitHub Advisories API, Docker |
| 5 | [AI Lead Research Agent](case-lead-research-agent/) | B2B Lead Recherche mit Regel und AI Scoring, Audit Export | n8n, SerpAPI, Gemini, SugarCRM Fit Scoring, XLSX |

## Was du in jedem Case findest

```text
README.md           Problem, Stack, Ablauf, Highlights
architecture.mermaid Architekturdiagramm
screenshots/        Frontend, n8n Canvas, Ergebnis
samples/            Beispiel Input und Output (anonymisiert)
code-snippets/      Ausgewaehlte bereinigte Logik
```

## Was bewusst NICHT enthalten ist

- Vollstaendige n8n Workflow Exporte
- Credentials, API Keys, OAuth Secrets
- Echte Kundendaten, interne URLs oder Pfade
- Kundenspezifische Anpassungen ohne Freigabe

## Lizenz

PolyForm Noncommercial 1.0.0 fuer den enthaltenen Code. Screenshots und Doku sind fuer Bewerbungs und Demonstrationszwecke gedacht, keine kommerzielle Weiterverwendung.

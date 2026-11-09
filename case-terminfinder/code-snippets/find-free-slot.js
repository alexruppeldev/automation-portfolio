// Sucht den frühesten gemeinsamen freien Slot für mehrere Teilnehmer.
//
// Pipeline Stufe: Termine laden (PostgreSQL) -> [Slot-Suche] -> Bestätigung im Formular
//
// Input:  state mit Teilnehmern, Dauer und Suchzeitraum, termine aus der Datenbank (UTC ISO)
// Output: gefundener Slot als UTC ISO plus Anzeige in Europe/Berlin
//
// Schwerpunkte:
//  - Termine aller Teilnehmer zu belegten Blöcken zusammenführen
//  - Arbeitsfenster je Tag in Europe/Berlin berechnen, Sommer und Winterzeit inklusive
//  - Wochenenden und Mittagspause auslassen, 15 Minuten Raster
//  - searchAfterMs für "erneut suchen", damit der nächste Slot nach dem letzten Vorschlag kommt

const TZ = 'Europe/Berlin';
const RASTER = 15;
const MAX_TAGE = 400;

const zoneFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23'
});

function zoneParts(ms) {
  const out = {};
  for (const p of zoneFormatter.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

function offsetAt(ms) {
  const p = zoneParts(ms);
  const rounded = Math.floor(ms / 1000) * 1000;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - rounded;
}

// Lokale Uhrzeit in Berlin auf echten UTC Zeitpunkt umrechnen
function localWallToMs(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm, ss || 0, 0);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const next = target - offsetAt(guess);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function formatLocal(ms) {
  const p = zoneParts(ms);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

function findFreeSlot(s, termine, now = Date.now()) {
  const teilnehmer = JSON.parse(String(s.teilnehmerJson || '[]'));
  const dauerMs = Number(s.dauer) * 60000;

  // nur Termine der ausgewählten Teilnehmer, sortiert und überlappende zusammengefasst
  const sperren = termine
    .filter(r => teilnehmer.includes(r.kurzname))
    .map(r => [Date.parse(r.beginn), Date.parse(r.ende)])
    .filter(([von, bis]) => Number.isFinite(von) && Number.isFinite(bis) && bis > von)
    .sort((a, b) => a[0] - b[0]);

  const belegt = [];
  for (const [von, bis] of sperren) {
    const letzte = belegt[belegt.length - 1];
    if (letzte && von <= letzte[1]) {
      letzte[1] = Math.max(letzte[1], bis);
    } else {
      belegt.push([von, bis]);
    }
  }

  const fruehesterStart = Math.max(now, Number(s.searchAfterMs || 0));

  for (let i = 0; i < MAX_TAGE; i++) {
    const datum = addDays(String(s.vonDatum), i);
    if (datum > String(s.bisDatum)) break;

    const wt = weekday(datum);
    if (wt === 0 || wt === 6) continue;

    // Vormittag und Nachmittag, Mittagspause liegt dazwischen
    const fenster = [
      [localWallToMs(datum, '08:00:00'), localWallToMs(datum, '12:00:00')],
      [localWallToMs(datum, '13:00:00'), localWallToMs(datum, '17:00:00')],
    ];

    for (const [fVon, fBis] of fenster) {
      for (let t = fVon; t + dauerMs <= fBis; t += RASTER * 60000) {
        if (t < fruehesterStart) continue;
        if (belegt.some(([von, bis]) => von < t + dauerMs && t < bis)) continue;

        const ende = zoneParts(t + dauerMs);
        return {
          gefunden: true,
          slotBeginn: new Date(t).toISOString(),
          slotEnde: new Date(t + dauerMs).toISOString(),
          anzeige: formatLocal(t) + ' bis ' + ende.hour + ':' + ende.minute + ' Uhr'
        };
      }
    }
  }

  return { gefunden: false };
}

module.exports = { findFreeSlot, localWallToMs };

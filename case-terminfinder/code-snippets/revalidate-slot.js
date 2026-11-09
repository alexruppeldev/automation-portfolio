// Prüft einen bestätigten Slot unmittelbar vor dem Speichern erneut.
//
// Pipeline Stufe: Bestätigung -> Termine vor Anlage laden -> [Konfliktcheck] -> Termin speichern
//
// Zwischen Vorschlag und Speichern können Minuten vergehen. In der Zeit kann ein
// anderer Termin eingetragen werden. Deshalb wird der Slot hier gegen die aktuellen
// Datenbankwerte und die Terminregeln geprüft und nicht dem Formular vertraut.
//
// Ergebnis:
//  - frei      -> speichern
//  - konflikt  -> automatisch neuen Slot ab diesem Zeitpunkt suchen
//  - fehler    -> State im Formular manipuliert oder technisch ungültig

const TZ = 'Europe/Berlin';
const ARBEIT_VON = 8 * 60;
const ARBEIT_BIS = 17 * 60;
const PAUSE_VON = 12 * 60;
const PAUSE_BIS = 13 * 60;
const RASTER = 15;

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

function weekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function revalidateSlot(s, termine, now = Date.now()) {
  const teilnehmer = JSON.parse(String(s.teilnehmerJson || '[]'));
  const start = Number(s.slotBeginnMs);
  const end = Number(s.slotEndeMs);
  const dauer = Number(s.dauer);
  const vonMs = Date.parse(String(s.vonIso));
  const bisExklusivMs = Date.parse(String(s.bisExklusivIso));

  if (![start, end, dauer, vonMs, bisExklusivMs].every(Number.isFinite) || end <= start) {
    return { status: 'fehler', fehlertext: 'Gespeicherter Slot ist technisch ungültig.' };
  }

  const sp = zoneParts(start);
  const ep = zoneParts(end);
  const startDate = `${sp.year}-${sp.month}-${sp.day}`;
  const endDate = `${ep.year}-${ep.month}-${ep.day}`;
  const startMin = Number(sp.hour) * 60 + Number(sp.minute);
  const endMin = Number(ep.hour) * 60 + Number(ep.minute);

  const sameDay = startDate === endDate;
  const inArbeitsfenster =
    (startMin >= ARBEIT_VON && endMin <= PAUSE_VON) ||
    (startMin >= PAUSE_BIS && endMin <= ARBEIT_BIS);
  const rasterOk = Number(sp.minute) % RASTER === 0 && Number(sp.second) === 0;
  const dauerOk = end - start === dauer * 60000;
  const suchbereichOk = start >= vonMs && end <= bisExklusivMs;
  const wt = weekday(startDate);
  const werktagOk = wt >= 1 && wt <= 5;

  if (!sameDay || !inArbeitsfenster || !rasterOk || !dauerOk || !suchbereichOk || !werktagOk) {
    return { status: 'fehler', fehlertext: 'Der gespeicherte Slot verletzt die serverseitigen Terminregeln.' };
  }

  if (start < now) {
    return { status: 'konflikt', konfliktGrund: 'zeit_abgelaufen' };
  }

  const konflikte = termine
    .filter(r => teilnehmer.includes(r.kurzname))
    .filter(r => {
      const von = Date.parse(r.beginn);
      const bis = Date.parse(r.ende);
      return Number.isFinite(von) && Number.isFinite(bis) && von < end && start < bis;
    });

  if (konflikte.length) {
    return {
      status: 'konflikt',
      konfliktGrund: 'belegt',
      konfliktMit: [...new Set(konflikte.map(r => r.kurzname))]
    };
  }

  return { status: 'frei' };
}

module.exports = { revalidateSlot };

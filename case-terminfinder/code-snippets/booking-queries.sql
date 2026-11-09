
-- 1) Termine für den Suchzeitraum laden
--    Zeitspalten werden explizit als UTC ISO gelesen, gerechnet wird danach in Europe/Berlin.
SELECT "terminGruppe",
kurzname,
bezeichnung,
to_char(beginn AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS beginn,
to_char(ende AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ende,
bemerkung
FROM termine
WHERE ende >= $1::timestamptz
  AND beginn < $2::timestamptz
ORDER BY beginn, ende;

-- 2) Termin speichern, ein Aufruf je Teilnehmer (Query Batching: Independent)
--    RETURNING liefert die terminGruppe für die anschließende Vollständigkeitsprüfung.
INSERT INTO termine (
  "terminGruppe", kurzname, bezeichnung, beginn, ende, bemerkung
) VALUES (
  $1, $2, $3, $4::timestamptz, $5::timestamptz, $6
)
RETURNING "terminGruppe";

-- 3) Rollback bei Teilbuchung
--    Wurden nicht alle erwarteten Datensätze gespeichert, wird die ganze Gruppe entfernt.
DELETE FROM termine
WHERE "terminGruppe" = $1
RETURNING "terminGruppe";

-- Tabellenstruktur
CREATE TABLE IF NOT EXISTS termine (
  id serial PRIMARY KEY,
  "terminGruppe" text,
  kurzname text NOT NULL,
  bezeichnung text,
  beginn timestamptz NOT NULL,
  ende timestamptz NOT NULL,
  bemerkung text
);

CREATE INDEX IF NOT EXISTS idx_termine_kurzname_beginn ON termine (kurzname, beginn);

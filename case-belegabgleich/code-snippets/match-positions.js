// Ordnet Positionen der Bestellung den Positionen der Auftragsbestätigung zu.
//
// Pipeline Stufe: Belegpaarung -> [Positionsmatching] -> deterministischer Vergleich
//
// Lieferanten schreiben Artikelnummern oft anders als der Besteller
// (z. B. "MB-7120" in der Bestellung, "7120" in der Bestätigung). Die Reihenfolge
// der Positionen ist auch nicht verlässlich. Deshalb wird vor jedem Wertvergleich
// erst sauber zugeordnet, Menge und Preis spielen für die Zuordnung keine Rolle.
//
// Kaskade:
//  - Stufe 0: Artikelnummer exakt gleich und auf beiden Seiten eindeutig
//  - Stufe 1: ARTICLE        (Artikel- und Herstellernummer)
//  - Stufe 2: CONFIGURATION  (Konfiguration und Variante)
//  - Stufe 3: DESCRIPTION    (Beschreibung)
//
// Pro Stufe zählen nur Bridge-Tokens, also Tokens die in beiden Belegen vorkommen.
// Seltene Tokens wiegen mehr (IDF). Ein Paar wird nur akzeptiert, wenn es für beide
// Seiten gegenseitig der beste Kandidat ist und es keinen Gleichstand gibt.
// Keine feste Mindest-Coverage, damit unterschiedliche Präfixe kein Problem sind.

const EPSILON = 1e-9;

const cleanString = (value) => value === null || value === undefined ? '' : String(value).trim().replace(/\s+/g, ' ');

const canonicalTokens = (value) => cleanString(value)
  .replace(/[ÄäÅå]/g, 'A').replace(/[Öö]/g, 'O').replace(/[Üü]/g, 'U').replace(/ß/g, 'SS')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toUpperCase()
  .split(/[^A-Z0-9]+/)
  .filter((token) => token.length > 0);

const canonicalKey = (value) => canonicalTokens(value).join('-');

const SIGNALS = [
  { stage: 1, name: 'ARTICLE', text: (p) => [p.articleNumber, p.manufacturerArticleNumber].filter(Boolean).join(' ') },
  { stage: 2, name: 'CONFIGURATION', text: (p) => [p.configurationText, p.variant].filter(Boolean).join(' ') },
  { stage: 3, name: 'DESCRIPTION', text: (p) => p.description || '' },
];

function matchPositions(order, confirmation, pairingStatus) {
  const buildIndex = (signal) => {
    const orderUniverse = new Set();
    const confirmationUniverse = new Set();
    const frequency = new Map();
    const totalPositions = order.positions.length + confirmation.positions.length;

    const collect = (positions, universe) => {
      for (const position of positions) {
        for (const token of new Set(canonicalTokens(signal.text(position)))) {
          universe.add(token);
          frequency.set(token, (frequency.get(token) || 0) + 1);
        }
      }
    };
    collect(order.positions, orderUniverse);
    collect(confirmation.positions, confirmationUniverse);

    const bridge = new Set([...orderUniverse].filter((token) => confirmationUniverse.has(token)));
    return { bridge, weight: (token) => Math.log(totalPositions / frequency.get(token)) };
  };

  const indexes = SIGNALS.map((signal) => ({ signal, index: buildIndex(signal) }));

  const pairScore = (left, right, signal, index) => {
    const a = new Set(canonicalTokens(signal.text(left)).filter((token) => index.bridge.has(token)));
    const b = new Set(canonicalTokens(signal.text(right)).filter((token) => index.bridge.has(token)));
    const shared = [...a].filter((token) => b.has(token));
    const sum = (tokens) => tokens.reduce((total, token) => total + index.weight(token), 0);
    const sumShared = sum(shared);
    const sumMin = Math.min(sum([...a]), sum([...b]));
    return {
      coverage: sumMin > EPSILON ? sumShared / sumMin : 0,
      evidence: sumShared,
      sharedTokens: shared,
    };
  };

  const resolveStageZero = (freeOrder, freeConfirmation) => {
    const countBy = (positions) => {
      const map = new Map();
      for (const position of positions) {
        const key = canonicalKey(position.articleNumber);
        if (key) map.set(key, (map.get(key) || 0) + 1);
      }
      return map;
    };
    const orderCount = countBy(freeOrder);
    const confirmationCount = countBy(freeConfirmation);
    const matches = [];
    for (const left of freeOrder) {
      const key = canonicalKey(left.articleNumber);
      if (!key || orderCount.get(key) !== 1 || confirmationCount.get(key) !== 1) continue;
      const right = freeConfirmation.find((candidate) => canonicalKey(candidate.articleNumber) === key);
      if (right) {
        matches.push({ orderPositionIndex: left.index, confirmationPositionIndex: right.index, stage: 0, signal: 'EXACT_ARTICLE' });
      }
    }
    return matches;
  };

  const resolveStage = (freeOrder, freeConfirmation, signal, index) => {
    const scores = new Map();
    for (const left of freeOrder) {
      for (const right of freeConfirmation) {
        scores.set(left.index + ':' + right.index, pairScore(left, right, signal, index));
      }
    }

    const rank = (self, others, isForward) => {
      const ranked = others
        .map((other) => {
          const key = isForward ? self.index + ':' + other.index : other.index + ':' + self.index;
          return { other, ...scores.get(key) };
        })
        .filter((entry) => entry.evidence > EPSILON)
        .sort((x, y) => y.coverage - x.coverage);

      if (ranked.length === 0) return { usable: false, reason: 'NO_POSITIVE_EVIDENCE' };
      if (ranked.length > 1 && Math.abs(ranked[0].coverage - ranked[1].coverage) < EPSILON) {
        return { usable: false, reason: 'TIE' };
      }
      return { usable: true, best: ranked[0] };
    };

    const matches = [];
    for (const left of freeOrder) {
      const forward = rank(left, freeConfirmation, true);
      if (!forward.usable) continue;
      const right = forward.best.other;
      // Gegenprobe: ist left auch für right der beste Kandidat?
      const backward = rank(right, freeOrder, false);
      if (!backward.usable || backward.best.other.index !== left.index) continue;
      matches.push({
        orderPositionIndex: left.index, confirmationPositionIndex: right.index,
        stage: signal.stage, signal: signal.name,
        coverage: Number(forward.best.coverage.toFixed(4)),
        sharedTokens: forward.best.sharedTokens,
      });
    }
    return matches;
  };

  const usedOrder = new Set();
  const usedConfirmation = new Set();
  const matches = [];

  // falsches Belegpaar -> gar nicht erst zuordnen
  if (pairingStatus !== 'WRONG_DOCUMENT_PAIR') {
    let progress = true;
    let guard = 0;
    while (progress && guard < 50) {
      guard += 1;
      progress = false;
      const freeOrder = order.positions.filter((position) => !usedOrder.has(position.index));
      const freeConfirmation = confirmation.positions.filter((position) => !usedConfirmation.has(position.index));
      if (freeOrder.length === 0 || freeConfirmation.length === 0) break;

      const commit = (batch) => {
        const accepted = batch.filter((match) => !usedOrder.has(match.orderPositionIndex) && !usedConfirmation.has(match.confirmationPositionIndex));
        for (const match of accepted) {
          usedOrder.add(match.orderPositionIndex);
          usedConfirmation.add(match.confirmationPositionIndex);
          matches.push({ ...match, matchingStatus: 'MATCHED' });
        }
        return accepted.length > 0;
      };

      // nach jedem Treffer wieder bei der stärksten Stufe anfangen
      if (commit(resolveStageZero(freeOrder, freeConfirmation))) {
        progress = true;
        continue;
      }
      for (const entry of indexes) {
        if (commit(resolveStage(freeOrder, freeConfirmation, entry.signal, entry.index))) {
          progress = true;
          break;
        }
      }
    }
  }

  for (const position of order.positions) {
    if (!usedOrder.has(position.index)) {
      matches.push({ orderPositionIndex: position.index, confirmationPositionIndex: null, matchingStatus: 'MISSING_IN_CONFIRMATION' });
    }
  }
  for (const position of confirmation.positions) {
    if (!usedConfirmation.has(position.index)) {
      matches.push({ orderPositionIndex: null, confirmationPositionIndex: position.index, matchingStatus: 'NOT_IN_ORDER' });
    }
  }

  return matches;
}

module.exports = { matchPositions, canonicalTokens };

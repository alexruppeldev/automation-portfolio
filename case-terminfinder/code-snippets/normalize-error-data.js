// Vereinheitlicht die Daten des n8n Error Triggers für die Fehlermail.
//
// Pipeline Stufe: Error Trigger -> [Fehlerdaten vereinheitlichen] -> Fehlermail senden
//
// n8n liefert zwei unterschiedliche Strukturen:
//  - Fehler während der Ausführung: Daten unter execution, mit id und url
//  - Fehler im Trigger Node: Daten unter trigger, es gibt keine Execution und keinen Link
//
// Der separate Error Workflow wird im Hauptworkflow unter Workflow Settings zugeordnet.

function normalizeErrorData(d) {
  const exec = d.execution || {};
  const trig = d.trigger || {};
  const wf = d.workflow || {};

  const fehler = exec.error || trig.error || {};

  return {
    workflowName: wf.name || 'unbekannter Workflow',
    workflowId: wf.id || '',
    quelle: exec.error ? 'Ausführung' : (trig.error ? 'Trigger-Node' : 'unbekannt'),
    executionId: exec.id || '',
    node: exec.lastNodeExecuted || trig.error?.node?.name || '',
    meldung: fehler.message || 'Keine Fehlermeldung übermittelt.',
    zeitpunkt: exec.error?.timestamp || trig.error?.timestamp || '',
    // nur gesetzt, wenn die Execution gespeichert wurde
    url: exec.url || ''
  };
}

module.exports = { normalizeErrorData };

import { selectLatestRun, type LedgerFile, type SelectedRun } from './ledger-data';

/** A recorded run link must never fall through to a different run's evidence. */
export function selectDashboardRun(
  ledger: LedgerFile | null,
  requestedRunId: string | null,
): SelectedRun | null {
  if (!ledger || requestedRunId === null) return selectLatestRun(ledger);
  return selectLatestRun({
    ...ledger,
    entries: ledger.entries.filter((entry) => entry.runId === requestedRunId),
    outcomes: ledger.outcomes.filter((outcome) => outcome.runId === requestedRunId),
  });
}

/** Add the current run to a dashboard destination, preserving filters and anchors. */
export function withRecordedRun(href: string, runId: string | null | undefined): string {
  if (runId === null || runId === undefined) return href;
  const hashIndex = href.indexOf('#');
  const hash = hashIndex < 0 ? '' : href.slice(hashIndex);
  const destination = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const queryIndex = destination.indexOf('?');
  const pathname = queryIndex < 0 ? destination : destination.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex < 0 ? '' : destination.slice(queryIndex + 1));
  params.set('run', runId);
  return `${pathname}?${params.toString()}${hash}`;
}

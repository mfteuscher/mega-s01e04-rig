import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.at === 'string' && Number.isFinite(Date.parse(event.at)) &&
    typeof event.job === 'string' && event.job.length > 0 &&
    (event.status === 'ok' || event.status === 'retry' || event.status === 'fail') &&
    (event.owner === null || typeof event.owner === 'string') &&
    (event.error === undefined || typeof event.error === 'string')
  );
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let source: string;
  try {
    source = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  const digest: NightDigest = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const jobs = new Map<string, DigestRow>();
  const errors = new Map<string, { at: number; text: string }>();
  const lines = source.split(/\r?\n/);
  // A final newline terminates a line; it does not create an extra bad record.
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      digest.badLines++;
      continue;
    }
    if (!isRunEvent(event)) {
      digest.badLines++;
      continue;
    }
    digest.counts[event.status]++;
    let row = jobs.get(event.job);
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0,
        lastStatus: event.status, lastError: null, firstTime: event.at, lastTime: event.at,
      };
      jobs.set(event.job, row);
    }
    if (event.error !== undefined) {
      const at = Date.parse(event.at);
      const previousError = errors.get(event.job);
      if (!previousError || at >= previousError.at) {
        errors.set(event.job, { at, text: event.error });
        row.lastError = event.error;
      }
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    // Rows follow event time even when a log arrives out of order.
    if (Date.parse(event.at) < Date.parse(row.firstTime)) row.firstTime = event.at;
    if (Date.parse(event.at) >= Date.parse(row.lastTime)) {
      row.lastTime = event.at;
      row.lastStatus = event.status;
      row.owner = event.owner;
    }
  }
  digest.rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const tempDirs: string[] = [];
function fixture(source: string) {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, '2026-10-28.jsonl'), source);
  return dir;
}
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true }); });

describe('readNight', () => {
  it('reads the sample without dropping the unowned job or bad line', () => {
    const digest = readNight('runs', '2026-10-28');
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows[0].owner).toBeNull();
    expect(digest?.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, firstTime: '2026-10-28T23:00:06+01:00', lastTime: '2026-10-29T05:00:04+01:00' });
    expect(digest?.rows[3]).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('distinguishes missing and empty nights and rejects paths', () => {
    const dir = fixture('');
    expect(readNight(dir, '2026-10-27')).toBeNull();
    expect(readNight(dir, '../../secret')).toBeNull();
    expect(readNight(dir, '2026-10-28')).toEqual({ night: '2026-10-28', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts invalid JSON and invalid records, preserving valid rows', () => {
    const dir = fixture([
      'broken', 'null', '{}', JSON.stringify({ at: 'no date', job: 'a', owner: null, status: 'ok' }),
      JSON.stringify({ at: '2026-10-28T02:00:00-06:00', job: 'a', owner: null, status: 'ok' }), '',
    ].join('\n'));
    const digest = readNight(dir, '2026-10-28');
    expect(digest?.badLines).toBe(4);
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0].firstTime).toBe('2026-10-28T02:00:00-06:00');
  });

  it('uses chronological first/last events and last error for unordered logs', () => {
    const event = (at: string, status: string, error?: string) => JSON.stringify({ at, job: 'a', owner: null, status, ...(error ? { error } : {}) });
    const dir = fixture([
      event('2026-10-28T03:00:00+01:00', 'ok'),
      event('2026-10-28T02:00:00+01:00', 'retry', 'new error'),
      event('2026-10-28T01:00:00+01:00', 'retry', 'old error'),
    ].join('\n'));
    expect(readNight(dir, '2026-10-28')?.rows[0]).toMatchObject({ runs: 3, retries: 2, lastStatus: 'ok', lastError: 'new error', firstTime: '2026-10-28T01:00:00+01:00', lastTime: '2026-10-28T03:00:00+01:00' });
  });
});

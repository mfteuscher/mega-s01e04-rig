import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};
const night = '2026-10-28';
const tempDirs: string[] = [];

async function makeRunsDir() {
  const dir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('digest routes', () => {
  it('serves matching sorted jobs as HTML and JSON, preserving details and escaping hostile text', async () => {
    const runsDir = await makeRunsDir();
    await writeFile(
      join(runsDir, `${night}.jsonl`),
      [
        '{ malformed line',
        JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'zeta', status: 'retry', owner: null, error: '<script>alert("x")</script> & "quoted"' }),
        JSON.stringify({ at: '2026-10-28T02:00:00+01:00', job: 'alpha', status: 'fail', owner: '<img src=x onerror=alert(1)>', error: '<b>broken</b>' }),
        JSON.stringify({ at: '2026-10-28T03:00:00+01:00', job: 'zeta', status: 'retry', owner: null, error: 'still retrying' }),
        JSON.stringify({ at: '2026-10-28T04:00:00+01:00', job: 'zeta', status: 'retry', owner: null, error: 'still retrying' }),
        JSON.stringify({ at: '2026-10-28T05:00:00+01:00', job: 'zeta', status: 'retry', owner: null, error: 'upstream & unavailable' }),
        JSON.stringify({ at: '2026-10-28T06:00:00+01:00', job: 'zeta', status: 'ok', owner: null, error: '<script>alert("x")</script> & \"quoted\"' }),
      ].join('\n'),
    );
    const app = createApp({ ...config, runsDir });

    const [pageResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const payload = await jsonResponse.json();

    expect(pageResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    // The JSON route wraps the rows in NightDigest; both representations expose identical order.
    const jsonJobs = payload.rows.map((row: { job: string }) => row.job);
    const pageJobs = Array.from(
      html.matchAll(/<tr(?: class="warn")?><td>([^<]+)<\/td>/g),
      (match) => match[1],
    );
    expect(jsonJobs).toEqual(['alpha', 'zeta']);
    expect(pageJobs).toEqual(jsonJobs);
    expect(payload).toMatchObject({ night, badLines: 1 });
    expect(payload.rows[0]).toMatchObject({
      job: 'alpha', owner: '<img src=x onerror=alert(1)>', runs: 1, retries: 0,
      lastStatus: 'fail', lastError: '<b>broken</b>',
      firstTime: '2026-10-28T02:00:00+01:00', lastTime: '2026-10-28T02:00:00+01:00',
    });
    expect(payload.rows[1]).toMatchObject({
      job: 'zeta', owner: null, runs: 5, retries: 4, lastStatus: 'ok',
      lastError: '<script>alert("x")</script> & \"quoted\"',
      firstTime: '2026-10-28T01:00:00+01:00', lastTime: '2026-10-28T06:00:00+01:00',
    });
    expect(html).toContain('ignored lines: 1');
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('2026-10-28T01:00:00+01:00');
    expect(html).toContain('2026-10-28T06:00:00+01:00');
    expect(html.match(/class="warn"/g)).toHaveLength(2);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quoted&quot;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;broken&lt;/b&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
  });

  it('returns 404 for a night with no file on both routes', async () => {
    const app = createApp({ ...config, runsDir: await makeRunsDir() });
    const [page, json] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(404);
    expect(json.status).toBe(404);
  });

  it('renders and returns an empty digest when the night file is empty', async () => {
    const runsDir = await makeRunsDir();
    await writeFile(join(runsDir, `${night}.jsonl`), '');
    const app = createApp({ ...config, runsDir });
    const [page, json] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await page.text();
    const payload = await json.json();
    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(payload).toMatchObject({ night, rows: [], badLines: 0 });
  });
});

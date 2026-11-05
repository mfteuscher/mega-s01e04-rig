import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('links each night to its digest and shows event counts', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const app = createApp(config);
    const res = await app.request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');

    for (const [night, counts] of [
      ['2026-10-28', '10 ok · 4 retry · 1 fail'],
      ['2026-10-27', ''],
    ]) {
      expect(html).toContain(`href="/digest/${night}"`);
      if (counts) expect(html).toContain(counts);
      const digest = await app.request(`/digest/${night}`);
      expect(digest.status).toBe(200);
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});

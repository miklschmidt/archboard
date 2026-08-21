// Does an arrow's `start` ref go stale when a human re-binds that arrow?
//
// An agent draws an arrow A -> B, so it carries `start: {id: A}` and the server
// owns its path. A human then drags the tail off A and onto C: Excalidraw
// updates `startBinding` and knows nothing about `start`. If nothing syncs the
// two, `rerouteBoundArrows` still believes the arrow starts at A — so moving A
// would drag an arrow that no longer touches it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = '/home/msc/Projects/whiteboard';
const PORT = 39000 + Math.floor(Math.random() * 900);
const base = `http://127.0.0.1:${PORT}`;
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'arrowprobe-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = spawn('bun', [path.join(repo, 'src/server.ts')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'pipe']
});
let err = ''; server.stderr.on('data', d => err += d);

const api = async (method, url, body) => {
  const r = await fetch(`${base}${url}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

try {
  for (let i = 0; i < 150; i++) {
    try { const h = await (await fetch(`${base}/health`)).json(); if (h?.pid === server.pid) break; } catch {}
    await sleep(100);
  }

  await api('POST', '/api/boards/new', { board: 'probe' });
  await api('POST', '/api/elements/batch?board=probe', {
    elements: [
      { id: 'boxA', type: 'rectangle', x: 0, y: 0, width: 100, height: 60, label: { text: 'A' } },
      { id: 'boxB', type: 'rectangle', x: 400, y: 0, width: 100, height: 60, label: { text: 'B' } },
      { id: 'boxC', type: 'rectangle', x: 0, y: 300, width: 100, height: 60, label: { text: 'C' } },
      { id: 'arr', type: 'arrow', x: 100, y: 30, points: [[0, 0], [300, 0]], start: { id: 'boxA' }, end: { id: 'boxB' } }
    ]
  });

  const before = (await api('GET', '/api/elements?board=probe')).body.elements;
  const arrow0 = before.find(e => e.id === 'arr');
  console.log('agent-drawn arrow:');
  console.log('  start        =', JSON.stringify(arrow0.start));
  console.log('  startBinding =', JSON.stringify(arrow0.startBinding?.elementId));

  // The human drags the tail from A onto C. Excalidraw rewrites startBinding
  // and the points; it has never heard of `start`, so it sends it back as-is.
  const rebound = { ...arrow0, startBinding: { elementId: 'boxC', focus: 0, gap: 4, fixedPoint: null }, points: [[0, 0], [300, -270]] };
  await api('POST', '/api/elements/changes?board=probe', { upserts: [rebound], deletes: [], clientId: 'probe-human' });

  const mid = (await api('GET', '/api/elements?board=probe')).body.elements.find(e => e.id === 'arr');
  console.log('\nafter the human re-binds the tail to C:');
  console.log('  start        =', JSON.stringify(mid.start), '   <- did it follow?');
  console.log('  startBinding =', JSON.stringify(mid.startBinding?.elementId));
  const pointsAfterRebind = JSON.stringify(mid.points);

  // Now an agent nudges box A, which the arrow no longer touches.
  await api('PUT', '/api/elements/boxA?board=probe', { x: 0, y: -200 });
  const after = (await api('GET', '/api/elements?board=probe')).body.elements.find(e => e.id === 'arr');
  console.log('\nafter an agent moves box A, which the arrow no longer touches:');
  console.log('  points before =', pointsAfterRebind);
  console.log('  points after  =', JSON.stringify(after.points));
  console.log('\nVERDICT:', pointsAfterRebind === JSON.stringify(after.points)
    ? 'the arrow was left alone. No stale-ref bug.'
    : '*** the arrow moved. Its `start` is stale and the server dragged it. ***');
} catch (e) {
  console.error('probe failed:', e.message, err.slice(-400));
} finally {
  server.kill('SIGTERM');
  await sleep(200);
  fs.rmSync(vault, { recursive: true, force: true });
}

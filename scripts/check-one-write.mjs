#!/usr/bin/env bun

// One intent, one write.
//
// Aligning twenty boxes is one thing a person asked for. It used to cost twenty
// HTTP writes, and so did distributing, locking, grouping and ungrouping them;
// `apply` cost one per update and one per delete on top of its batched create.
// That is a nuisance today. It is lost updates once the note is the only copy
// of the board and every write is a read-modify-write cycle against it
// (ADR 0015), and twenty separate acquisitions of the board's lock with
// nineteen gaps for another writer between them (ADR 0016).
//
// So the number of writes is measured rather than asserted about: a counting
// proxy sits between the client and a real canvas, and every intent below is
// driven through the code the CLI and MCP both call. Counting on the wire is
// the point — a check that read the source could not tell a batched call from a
// loop that happens to be written on one line.
//
// The rest of the file is what the batched path must not lose on the way:
// an agent's write is still an agent's write to the feed and is not stamped as
// the browser's, a report that says nothing about origin still gets exactly
// what the browser has always got, and a batched move still drags labels and
// arrows along behind it the way a single-element PUT does.

import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const src = (p) => join(repoRoot, 'src', p);

let failures = 0;
let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL: ${message}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const near = (a, b, slack = 0.5) => Math.abs(a - b) <= slack;

// A different port each run, so two checkouts running the suite at once do not
// serialise on one, and so this never lands on somebody's real canvas.
const PORT = 39000 + Math.floor(Math.random() * 2000);
const PROXY_PORT = PORT + 1;
const SETTLE_MS = 200;
const base = `http://127.0.0.1:${PORT}`;
const proxyBase = `http://127.0.0.1:${PROXY_PORT}`;
const vault = fs.mkdtempSync(join(os.tmpdir(), 'archboard-one-write-'));

const server = spawn(process.execPath, [src('server.ts')], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    ARCHBOARD_VAULT: vault,
    ARCHBOARD_SETTLE_MS: String(SETTLE_MS),
    LOG_LEVEL: 'error'
  },
  stdio: ['ignore', 'ignore', 'ignore']
});

// ─── The counter ─────────────────────────────────────────────
//
// Everything the client sends passes through here on its way to the canvas. A
// write is a POST, PUT or DELETE against an element route; reads are forwarded
// and ignored, because this is about how many times an intent touches the
// board, not how many times it looks at it.

let writes = [];
const proxy = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    const body = Buffer.concat(chunks);
    const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
    if (isWrite && req.url.startsWith('/api/elements')) {
      writes.push(`${req.method} ${req.url.split('?')[0]}`);
    }
    try {
      const upstream = await fetch(`${base}${req.url}`, {
        method: req.method,
        headers: { ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}) },
        ...(body.length > 0 ? { body } : {})
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' });
      res.end(text);
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: String(error) }));
    }
  });
});
await new Promise((resolve) => proxy.listen(PROXY_PORT, '127.0.0.1', resolve));

// The client reads its canvas URL at import time, so the proxy has to be the
// canvas before anything under src/ is loaded.
process.env.EXPRESS_SERVER_URL = proxyBase;
const { setRequestedBoard } = await import(src('core/canvas-client.ts'));
const ops = await import(src('core/element-ops.ts'));
const { boundTextPlacement } = await import(src('core/labels.ts'));

const api = async (method, url, body) => {
  const response = await fetch(`${base}${url}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  return response.json().catch(() => null);
};
const board = '?board=scratch';
const elementsOn = async () => (await api('GET', `/api/elements${board}`))?.elements ?? [];
const byId = async () => new Map((await elementsOn()).map((el) => [el.id, el]));

// One intent, and what it cost on the wire.
const spending = async (what, expected, run) => {
  writes = [];
  const result = await run();
  const spent = writes.slice();
  assert(spent.length === expected,
    `${what} should cost ${expected === 1 ? 'one write' : `${expected} writes`}, ` +
    `not ${spent.length}: ${spent.join(', ') || 'none'}`);
  return result;
};
const counting = (what, run) => spending(what, 1, run);

// The CLI a person actually types, pointed at the proxy.
const cli = async (args, stdin) => {
  const child = spawn(process.execPath, [src('bin.ts'), ...args], {
    cwd: repoRoot,
    env: { ...process.env, EXPRESS_SERVER_URL: proxyBase, LOG_LEVEL: 'error' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  if (stdin !== undefined) child.stdin.write(stdin);
  child.stdin.end();
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { err += chunk; });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  return { code, out, err };
};

try {
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/health`); break; } catch { await sleep(100); }
  }
  setRequestedBoard('scratch');

  // ─── Twenty boxes, and the five ways of moving them at once ───

  const boxes = Array.from({ length: 20 }, (_, i) => ({
    id: `box-${i}`,
    type: 'rectangle',
    x: 100 + i * 37,
    y: 100 + i * 53,
    width: 120,
    height: 80
  }));
  await api('POST', `/api/elements/batch${board}`, { elements: boxes });
  const ids = boxes.map((box) => box.id);

  await counting('aligning twenty boxes', () => ops.alignElements(ids, 'left'));
  let scene = await byId();
  const lefts = new Set(ids.map((id) => Math.round(scene.get(id).x)));
  assert(lefts.size === 1, `aligning left should have left one x, not ${lefts.size}`);

  await counting('distributing twenty boxes', () => ops.distributeElements(ids, 'vertical'));
  scene = await byId();
  const tops = ids.map((id) => scene.get(id).y).sort((a, b) => a - b);
  const gaps = tops.slice(1).map((y, i) => y - tops[i]);
  assert(gaps.every((gap) => near(gap, gaps[0], 0.01)),
    `distributing should have left even gaps, not ${gaps.map((g) => Math.round(g)).join(', ')}`);

  await counting('locking twenty boxes', () => ops.setElementsLocked(ids, true));
  scene = await byId();
  assert(ids.every((id) => scene.get(id).locked === true), 'locking should have locked every box');
  await counting('unlocking twenty boxes', () => ops.setElementsLocked(ids, false));

  // An element already in a group, to prove the write appends rather than
  // replaces — the reason grouping used to read every element first.
  await api('PUT', `/api/elements/box-0${board}`, { groupIds: ['existing'] });
  const { groupId } = await counting('grouping twenty boxes', () => ops.groupElements(ids));
  scene = await byId();
  assert(ids.every((id) => (scene.get(id).groupIds ?? []).includes(groupId)),
    'grouping should have put every box in the new group');
  assert((scene.get('box-0').groupIds ?? []).includes('existing'),
    'grouping dropped a group the element was already in');

  await counting('ungrouping twenty boxes', () => ops.ungroupElements(groupId));
  scene = await byId();
  assert(ids.every((id) => !(scene.get(id).groupIds ?? []).includes(groupId)),
    'ungrouping should have emptied the group');
  assert((scene.get('box-0').groupIds ?? []).includes('existing'),
    'ungrouping dropped the other group its member was in');

  // ─── apply, through the CLI a person actually types ───────────

  const patch = {
    create: [
      { id: 'made-a', type: 'rectangle', x: 2000, y: 2000, width: 100, height: 50 },
      { type: 'ellipse', x: 2200, y: 2000, width: 100, height: 50 }
    ],
    update: [
      { id: 'box-1', set: { backgroundColor: '#ffc9c9' } },
      { id: 'box-2', set: { x: 4000 } }
    ],
    delete: ['box-19']
  };
  const applied = await counting('a patch of two creates, two updates and a delete', async () => {
    const child = spawn(process.execPath, [src('bin.ts'), 'apply', '--board', 'scratch', '-'], {
      cwd: repoRoot,
      env: { ...process.env, EXPRESS_SERVER_URL: proxyBase, LOG_LEVEL: 'error' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    child.stdin.write(JSON.stringify(patch));
    child.stdin.end();
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    const code = await new Promise((resolve) => child.on('exit', resolve));
    assert(code === 0, `apply exited ${code}: ${err}`);
    return JSON.parse(out);
  });
  assert(applied.created === 2 && applied.updated === 2 && applied.deleted === 1,
    `apply reported ${JSON.stringify({ created: applied.created, updated: applied.updated, deleted: applied.deleted })}`);
  assert(Array.isArray(applied.elements) && applied.elements.length === 2 &&
    applied.elements.every((el) => typeof el.id === 'string' && el.id.length > 0),
    'apply should still hand back the elements it created, ids and all — the server mints them');
  scene = await byId();
  assert(scene.get('box-1').backgroundColor === '#ffc9c9' && near(scene.get('box-2').x, 4000) && !scene.has('box-19'),
    'the patch did not land: the counts were right and the board is wrong');

  // A patch naming an element that is not there is refused with nothing
  // written, rather than halfway through with the earlier half applied.
  {
    const child = spawn(process.execPath, [src('bin.ts'), 'apply', '--board', 'scratch', '-'], {
      cwd: repoRoot,
      env: { ...process.env, EXPRESS_SERVER_URL: proxyBase, LOG_LEVEL: 'error' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    child.stdin.write(JSON.stringify({
      update: [{ id: 'box-3', set: { x: 9999 } }, { id: 'never-existed', set: { x: 1 } }]
    }));
    child.stdin.end();
    const code = await new Promise((resolve) => child.on('exit', resolve));
    assert(code !== 0, 'a patch naming an element that is not on the board should be refused');
    scene = await byId();
    assert(!near(scene.get('box-3').x, 9999),
      'the refused patch applied its first update anyway, which is the half-applied write this exists to stop');
  }

  // ─── Who wrote it ─────────────────────────────────────────────
  //
  // The two things `origin` decides, and nothing else.

  // Let everything above settle and be reported, so what follows is measured
  // from a quiet board rather than coalesced with it.
  await sleep(SETTLE_MS * 4);
  const beforeHuman = (await api('GET', `/api/changes?board=scratch&since=0`))?.cursor ?? 0;

  // What the browser sends is unchanged: no origin, so `frontend_sync` and a
  // human at the feed.
  await api('POST', `/api/elements/changes${board}`, {
    upserts: [{ id: 'drawn-by-hand', type: 'rectangle', x: 6000, y: 6000, width: 200, height: 100 }],
    deletes: [],
    clientId: 'pane'
  });
  scene = await byId();
  assert(scene.get('drawn-by-hand').source === 'frontend_sync',
    'a report with no origin should be stamped frontend_sync, exactly as before');
  await sleep(SETTLE_MS * 4);
  let feed = await api('GET', `/api/changes?board=scratch&since=${beforeHuman}`);
  let events = feed?.events ?? [];
  assert(events.length > 0 && events.every((event) => event.origin === 'human'),
    `a report with no origin is the human's hands: ${JSON.stringify(events.map((e) => e.origin))}`);

  const cursor = feed.cursor;
  await ops.alignElements(['drawn-by-hand', 'box-1'], 'top');
  scene = await byId();
  assert(scene.get('drawn-by-hand').source === 'frontend_sync',
    'an agent moving a human\'s box should not take the authorship of it');
  assert(scene.get('box-1').source === undefined,
    `an agent's write must not be stamped as the browser's (source: ${scene.get('box-1').source})`);
  await sleep(SETTLE_MS * 4);
  feed = await api('GET', `/api/changes?board=scratch&since=${cursor}`);
  events = feed?.events ?? [];
  assert(events.length > 0 && events.every((event) => event.origin === 'agent'),
    `an agent's batched write is the agent's, or it gets narrated back at it (ADR 0005): ` +
    JSON.stringify(events.map((e) => e.origin)));

  // ─── What a batched move still owes the board ─────────────────
  //
  // A single-element PUT drags a bound label along and re-routes every arrow
  // bound to what moved (TASK-034, TASK-038). A batched write is the same
  // write, so it owes the same.

  await api('POST', `/api/elements/batch${board}`, {
    elements: [
      { id: 'svc', type: 'rectangle', x: 200, y: 8000, width: 200, height: 100 },
      // Taller, so aligning the two by their bottom edges has to move the
      // labelled one.
      { id: 'db', type: 'rectangle', x: 900, y: 8000, width: 200, height: 260 },
      { id: 'wire', type: 'arrow', x: 400, y: 8050, width: 10, height: 10, start: { id: 'svc' }, end: { id: 'db' } },
      { id: 'svc-label', type: 'text', containerId: 'svc', text: 'AuthService', x: 250, y: 8038, width: 100, height: 25 }
    ]
  });
  await api('PUT', `/api/elements/svc${board}`, {
    boundElements: [{ id: 'svc-label', type: 'text' }]
  });
  const before = await byId();
  const wireBefore = JSON.stringify(before.get('wire').points);
  const placed = (elements) => {
    const label = elements.get('svc-label');
    const wanted = boundTextPlacement(elements.get('svc'), label);
    return near(label.x, wanted.x, 0.5) && near(label.y, wanted.y, 0.5);
  };

  await counting('aligning a labelled, wired box', () => ops.alignElements(['svc', 'db'], 'bottom'));
  scene = await byId();
  assert(near(scene.get('svc').y + scene.get('svc').height, scene.get('db').y + scene.get('db').height),
    'the two boxes should share a bottom edge');
  assert(!near(scene.get('svc').y, before.get('svc').y),
    'the check is not exercising anything: the labelled box did not move');
  assert(placed(scene),
    `a batched move stranded a bound label at ${Math.round(scene.get('svc-label').x)},${Math.round(scene.get('svc-label').y)}`);
  assert(JSON.stringify(scene.get('wire').points) !== wireBefore,
    'a batched move left an arrow bound to it pointing at where the box used to be');

  // And the settling is part of the same write, not a second one.
  writes = [];
  await ops.distributeElements(['svc', 'db', 'box-1'], 'horizontal');
  assert(writes.length === 1,
    `re-routing and re-placing behind a batched move must not cost extra writes: ${writes.join(', ')}`);

  // ─── Promoting a node that is not one element ─────────────────
  //
  // Seven lines and nothing else, which is what the shipped PostgreSQL stencil
  // is. Promotion outranks the element type precisely so a node can be drawn
  // from one (TASK-053), which makes this the ordinary path and not an edge
  // case — and it used to cost a PUT per line, on both surfaces.

  const stencil = Array.from({ length: 7 }, (_, i) => ({
    id: `pg-${i}`,
    type: 'line',
    x: 300,
    y: 12000 + i * 12,
    width: 160,
    height: 0,
    points: [[0, 0], [160, 0]]
  }));
  const pgIds = stencil.map((line) => line.id);
  await api('POST', `/api/elements/batch${board}`, { elements: stencil });

  const nodeIdOf = (element) => element?.customData?.archboard?.node;
  const promoted = async () => {
    const now = await byId();
    return pgIds.map((id) => nodeIdOf(now.get(id)));
  };

  const cliPromote = await counting('promoting a seven-element stencil on the CLI', () =>
    cli(['promote', '--board', 'scratch', '--ids', pgIds.join(','), '--kind', 'datastore', '--name', 'PostgreSQL']));
  assert(cliPromote.code === 0, `promote exited ${cliPromote.code}: ${cliPromote.err}`);
  let nodes = await promoted();
  assert(nodes.every((node) => node && node === nodes[0]),
    `all seven elements should carry one node id, not ${JSON.stringify(nodes)}`);

  await counting('demoting a seven-element node on the CLI', () =>
    cli(['demote', '--board', 'scratch', '--ids', pgIds.join(',')]));
  assert((await promoted()).every((node) => node === undefined),
    'demoting should have stripped the metadata from every element of the node');

  // The same act over MCP, which is a second implementation of it and was the
  // second fan-out.
  const { callExcalidrawTool } = await import(src('core/mcp-dispatch.ts'));
  await counting('promoting a seven-element stencil over MCP', () =>
    callExcalidrawTool('promote_selection', {
      board: 'scratch', elementIds: pgIds, kind: 'datastore', name: 'PostgreSQL'
    }));
  setRequestedBoard('scratch');
  nodes = await promoted();
  assert(nodes.every((node) => node && node === nodes[0]),
    `promoting over MCP should carry one node id onto all seven, not ${JSON.stringify(nodes)}`);

  await counting('demoting a seven-element node over MCP', () =>
    callExcalidrawTool('demote_selection', { board: 'scratch', elementIds: pgIds }));
  setRequestedBoard('scratch');
  assert((await promoted()).every((node) => node === undefined),
    'demoting over MCP should have stripped the metadata from every element');

  // A promotion naming something the board does not hold is refused before it
  // writes, not part way through with the elements before it already stamped.
  await spending('a promotion naming an element that is not there', 0, async () => {
    const refused = await cli(['promote', '--board', 'scratch', '--ids', `${pgIds.join(',')},never-existed`,
      '--kind', 'datastore', '--name', 'PostgreSQL']);
    assert(refused.code !== 0, 'a promotion naming an element that is not on the board should be refused');
  });
  assert((await promoted()).every((node) => node === undefined),
    'the refused promotion stamped part of the node anyway');

  // ─── delete, with more than one id ────────────────────────────

  await api('POST', `/api/elements/batch${board}`, {
    elements: ['gone-a', 'gone-b', 'gone-c', 'stays'].map((id, i) => ({
      id, type: 'rectangle', x: 300 + i * 200, y: 13000, width: 100, height: 60
    }))
  });

  await counting('deleting three elements', async () => {
    const deleted = await cli(['delete', '--board', 'scratch', 'gone-a', 'gone-b', 'gone-c']);
    assert(deleted.code === 0, `delete exited ${deleted.code}: ${deleted.err}`);
  });
  scene = await byId();
  assert(!scene.has('gone-a') && !scene.has('gone-b') && !scene.has('gone-c'),
    'deleting three ids in one write should have removed all three');

  await spending('a delete naming an element that is not there', 0, async () => {
    const refused = await cli(['delete', '--board', 'scratch', 'stays', 'never-existed']);
    assert(refused.code !== 0, 'deleting an id the board does not hold should be refused');
  });
  assert((await byId()).has('stays'),
    'the refused delete removed the first id anyway, which is the half-applied write this exists to stop');
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) => proxy.close(resolve));
  await sleep(200);
  fs.rmSync(vault, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} one-write checks failed`);
  process.exit(1);
}
console.log(`one-write: ${checks} checks passed`);

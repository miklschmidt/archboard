#!/usr/bin/env bun
//
// A reload happens when it is asked for, and it costs nothing on screen
// (TASK-057, TASK-059, ADR 0014).
//
// Two claims, and the first one is the load-bearing one. `bun --hot`
// re-evaluates the ENTIRE module graph, not the file that changed, and it does
// it on a file save. Pointed straight at `src/server.ts` that meant every
// keystroke reaching disk re-ran every top-level statement in the canvas while
// a human had unsaved boards on it. `src/dev-canvas.ts` narrows the trigger to
// one token file nobody edits, so:
//
//   · saving a source file changes nothing at all
//   · `bun run reload` re-evaluates the graph, and only then
//
// The second claim is what survives one: the port stays bound, the sockets
// stay open and stay subscribed, the boards keep their unsaved elements, the
// panes keep their registrations, and the change feed keeps its id and cursor
// so a hook's saved cursor still means what it meant.
//
// And when a reload does break something, it says so. The last section
// reintroduces the TASK-057 board-store bug under a live canvas and checks
// that the canary reports it, to the terminal and to the connected tab, rather
// than letting an emptied board pass quietly.
//
// Files edited here are restored from copies taken at the top, never with
// `git checkout`: this runs in a working tree that usually has other
// uncommitted work in it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = p => path.join(repoRoot, 'src', p);

let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = Number(process.env.PORT || 36000 + Math.floor(Math.random() * 900));
const base = `http://127.0.0.1:${PORT}`;
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-hot-'));
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-hot-state-'));

// The settle window the feed uses, shortened so this check is not mostly sleep.
const SETTLE_MS = 300;

// ── Editing source under a live canvas, reversibly ────────────────────────
//
// Every file this touches is read first and written back from that copy. A
// `git checkout` would be shorter and would throw away whatever else is
// uncommitted in the tree, which on this repo is usually the change being
// tested.

const originals = new Map();
function edit(file, transform) {
  if (!originals.has(file)) originals.set(file, fs.readFileSync(file, 'utf8'));
  const next = transform(originals.get(file));
  if (next === originals.get(file)) throw new Error(`Edit to ${file} changed nothing.`);
  fs.writeFileSync(file, next);
}
function restoreAll() {
  for (const [file, text] of originals) fs.writeFileSync(file, text);
  originals.clear();
}

const server = spawn(process.execPath, ['--hot', src('dev-canvas.ts')], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    ARCHBOARD_VAULT: vault,
    // Keep the reload token and pidfile out of the real state directory, so a
    // canvas somebody is using cannot be reached from here.
    XDG_STATE_HOME: state,
    ARCHBOARD_SETTLE_MS: String(SETTLE_MS),
    LOG_LEVEL: 'info'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
server.stdout.on('data', chunk => { output += chunk.toString(); });
server.stderr.on('data', chunk => { output += chunk.toString(); });

const api = async (method, url, body) => {
  const response = await fetch(`${base}${url}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const health = async () => {
  try {
    const response = await fetch(`${base}/health`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
};

async function waitFor(predicate, what, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}.\n${output}`);
}

/** Ask for a reload and wait for the canvas to say it came back up in place. */
async function askForReload() {
  const seen = output.length;
  const asked = await api('POST', '/api/reload');
  if (asked.status !== 200) throw new Error(`Reload refused: ${JSON.stringify(asked.body)}`);
  await waitFor(
    async () => output.slice(seen).includes('re-evaluated in place'),
    'the canvas to re-evaluate'
  );
  // The canary runs after that line, so give it its turn before asking
  // anything about what survived.
  await sleep(500);
  return output.slice(seen);
}

const box = (label, x) => ({
  type: 'rectangle', x, y: 40, width: 160, height: 80,
  label: { text: label },
  customData: { archboard: { node: label.toLowerCase(), kind: 'service', name: label } }
});

// A route the running canvas does not have. Adding it to server.ts is how this
// check tells "the source was re-evaluated" from "the process is still alive":
// `app` is rebuilt on every reload, so the route can only exist if the new
// source ran.
const PROBE_ROUTE = `\napp.get('/__reload_probe', (_req: Request, res: Response) => { res.json({ probe: 'live' }); });\n`;

let pane = null;

try {
  const first = await waitFor(health, 'the canvas to come up');
  const pid = first.pid;
  check('a canvas started with dev-canvas says it can be reloaded',
    first.reloadable === true, String(first.reloadable));

  // ── A pane, a board and some work nobody has saved ─────────

  const socket = new WebSocket(`ws://127.0.0.1:${PORT}/?clientId=p-hot-1`);
  const seen = [];
  let closed = null;
  socket.on('message', data => seen.push(JSON.parse(data.toString())));
  socket.on('close', code => { closed = code; });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  await sleep(120);
  const boardKey = [...seen].reverse().find(m => m.type === 'initial_elements')?.board;
  check('a pane connects and is given a board', boardKey === 'scratch', String(boardKey));

  await api('POST', '/api/panes', {
    clientId: 'p-hot-1', paneId: 'p-hot-1', primary: true, focused: true, elementCount: 0,
    board: boardKey,
    rect: { x: 0, y: 0, width: 1280, height: 800 },
    viewport: { x: 0, y: 0, width: 1280, height: 800, zoom: 1 }
  });
  pane = socket;

  await api('POST', `/api/elements?board=${boardKey}`, box('Auth', 0));
  await api('POST', `/api/elements?board=${boardKey}`, box('Orders', 400));

  const panesBefore = (await api('GET', '/api/panes')).body;
  const elementsBefore = (await api('GET', `/api/elements?board=${boardKey}`)).body;
  // Two labelled boxes, so four elements: a label is a text element on the
  // board from the moment the box is written (ADR 0015, TASK-072).
  check('two boxes are on the board and nothing has saved them',
    elementsBefore.count === 4, String(elementsBefore.count));
  check('the pane is registered holding that board',
    panesBefore.panes?.[0]?.board === boardKey, JSON.stringify(panesBefore.panes?.[0]?.board));

  await sleep(SETTLE_MS + 400);
  const feedBefore = (await api('GET', `/api/changes?board=${boardKey}`)).body;
  check('the change feed has recorded the drawing',
    feedBefore.cursor >= 1, `cursor ${feedBefore.cursor}`);

  const sockets = (await health()).websocket_clients;
  check('the canvas counts the pane\'s socket', sockets === 1, String(sockets));

  // ── Saving a file does nothing at all ──────────────────────
  //
  // This is the difference TASK-059 bought. Under `bun --hot src/server.ts`
  // each of these saves re-evaluated all 32 modules under an open pane. Two
  // files are edited on purpose, and they are the two that used to be the
  // hazards: the entry point, whose top-level statements bind the port and
  // register the socket handlers, and the board store, whose top-level
  // statement creates the scratch board.

  const quietFrom = output.length;
  edit(src('server.ts'), text => `${text}\n// reload check: a save that must change nothing.\n`);
  await sleep(900);
  edit(src('core/board-store.ts'), text => `${text}\n// reload check: a save that must change nothing.\n`);
  await sleep(1400);

  check('saving source does not reload the canvas',
    !output.slice(quietFrom).includes('re-evaluated in place'),
    JSON.stringify(output.slice(quietFrom).trim().slice(0, 200)));
  const afterSaves = (await api('GET', `/api/elements?board=${boardKey}`)).body;
  check('  so the unsaved elements are untouched', afterSaves.count === 4, String(afterSaves.count));
  check('  and the probe route is still absent, because no new source has run',
    (await api('GET', '/__reload_probe')).status === 404);

  // ── A reload that is asked for ─────────────────────────────

  edit(src('server.ts'), text => text + PROBE_ROUTE);
  await sleep(600);
  const reloadLog = await askForReload();

  const after = await waitFor(health, 'the canvas to answer after the reload');
  check('the canvas is still the same process', after.pid === pid, `${pid} -> ${after.pid}`);

  const probe = await api('GET', '/__reload_probe');
  check('the reload ran the new source', probe.status === 200 && probe.body?.probe === 'live',
    `status ${probe.status}`);

  check('the canary says the reload cost nothing',
    reloadLog.includes('cost nothing'), JSON.stringify(reloadLog.trim().slice(-200)));
  check('  and did not report anything broken', !reloadLog.includes('THE RELOAD BROKE'));

  check('the pane is still connected', closed === null && after.websocket_clients === sockets,
    `close code ${closed}, ${after.websocket_clients} of ${sockets} sockets`);

  const elementsAfter = (await api('GET', `/api/elements?board=${boardKey}`)).body;
  check('the unsaved elements are still on the board',
    elementsAfter.count === 4, String(elementsAfter.count));
  check('  and they are the same elements, not redrawn ones',
    elementsAfter.elements.map(e => e.id).sort().join() ===
    elementsBefore.elements.map(e => e.id).sort().join());

  const panesAfter = (await api('GET', '/api/panes')).body;
  check('the pane registration survived, holding the same board',
    panesAfter.panes?.length === 1 && panesAfter.panes[0].board === boardKey,
    JSON.stringify(panesAfter.panes?.map(p => [p.paneId, p.board])));

  const feedAfter = (await api('GET', `/api/changes?board=${boardKey}&since=${feedBefore.cursor}`)).body;
  check('the feed is the same feed, so a hook\'s cursor still means something',
    feedAfter.feedId === feedBefore.feedId, `${feedBefore.feedId} -> ${feedAfter.feedId}`);
  check('  at the same cursor', feedAfter.cursor === feedBefore.cursor,
    `${feedBefore.cursor} -> ${feedAfter.cursor}`);
  check('  and the reload itself was not an event',
    (feedAfter.events ?? []).length === 0, JSON.stringify(feedAfter.events ?? []));

  // A socket can be open and deaf: the connection handler is re-registered on
  // reload, and the broadcast list is what the old handler put the socket in.
  // Delivered exactly once is the other half. A handler added rather than
  // replaced answers twice, and no snapshot of state can see that.
  const beforeBroadcast = seen.length;
  await api('POST', `/api/elements?board=${boardKey}`, box('Ledger', 800));
  await sleep(400);
  const created = seen.slice(beforeBroadcast).filter(m => m.type === 'element_created');
  check('a pane connected before the reload still hears broadcasts', created.length >= 1,
    JSON.stringify(seen.slice(beforeBroadcast).map(m => m.type)));
  // Counted by element rather than by message: one labelled box is a box and
  // its label, so one write is two creations and each of them must arrive once.
  const createdOnce = new Set(created.map(m => m.element?.id)).size === created.length;
  check('  and hears each one exactly once, not once per reload', createdOnce,
    `${created.length} copies`);

  await sleep(SETTLE_MS + 400);
  const feedLater = (await api('GET', `/api/changes?board=${boardKey}&since=${feedBefore.cursor}`)).body;
  check('  and a real change after the reload is reported once',
    (feedLater.events ?? []).length === 1, `${(feedLater.events ?? []).length} events`);

  // ── A reload broken on purpose ─────────────────────────────
  //
  // The static check refuses this shape in source
  // (`scripts/check-module-scope.mjs`), and this is the other net: what
  // happens when something it cannot see gets through. The board store's
  // presence guard is removed, so re-evaluating it replaces the open board
  // with an empty one. That is the exact TASK-057 bug, under a live pane.
  //
  // Last, because it really does damage the canvas.

  const brokenFrom = seen.length;
  edit(src('core/board-store.ts'), text => {
    const guarded = 'if (!boards.has(SCRATCH_KEY)) {\n' +
      '  boards.set(SCRATCH_KEY, newBoardState(makeIdentity({ board: SCRATCH_BOARD }), false));\n' +
      '}';
    const unguarded = 'boards.set(SCRATCH_KEY, newBoardState(makeIdentity({ board: SCRATCH_BOARD }), false));';
    if (!text.includes(guarded)) throw new Error('board-store.ts no longer has the guard this check removes.');
    return text.replace(guarded, unguarded);
  });
  await sleep(600);
  const brokenLog = await askForReload();

  check('a reload that empties an open board is reported, not accepted',
    brokenLog.includes('THE RELOAD BROKE SOMETHING'),
    JSON.stringify(brokenLog.trim().slice(-300)));
  check('  naming the board and what it lost',
    /board "scratch" went from 6 elements to 0/.test(brokenLog),
    JSON.stringify(brokenLog.match(/board "[^"]*"[^\n]*/)?.[0] ?? ''));
  check('  and the connected tab is told too, not just the terminal',
    seen.slice(brokenFrom).some(m => m.type === 'reload_broken'),
    JSON.stringify(seen.slice(brokenFrom).map(m => m.type)));

  restoreAll();

  // ── And the canvas a human starts cannot be reloaded at all ─
  //
  // The capability above is worth having only because it is asked for. A
  // reload is cheap when a developer typed the command that causes it and
  // expensive when anything else does, so `archboard start` spawns a plain
  // process with no token and no watcher, and says so when asked to reload.

  const plainPort = PORT + 1;
  const plainUrl = `http://127.0.0.1:${plainPort}`;
  const cliEnv = {
    ...process.env,
    EXPRESS_SERVER_URL: plainUrl,
    ARCHBOARD_VAULT: vault,
    XDG_STATE_HOME: state,
    LOG_LEVEL: 'error'
  };
  const started = spawnSync(process.execPath, [src('bin.ts'), 'start'], { env: cliEnv, encoding: 'utf8' });
  let plainPid = null;
  try {
    plainPid = JSON.parse(started.stdout).pid;
  } catch {
    check('`archboard start` starts a canvas', false, started.stdout || started.stderr);
  }
  if (plainPid) {
    const argv = spawnSync('ps', ['-o', 'args=', '-p', String(plainPid)], { encoding: 'utf8' }).stdout.trim();
    check('`archboard start` runs the server from src', /src\/server\.ts/.test(argv), argv);
    check('  and asks for no reloading of any kind', !/--hot|--watch/.test(argv), argv);

    const plainHealth = await fetch(`${plainUrl}/health`).then(r => r.json()).catch(() => null);
    check('  and reports that it cannot be reloaded', plainHealth?.reloadable === false,
      String(plainHealth?.reloadable));
    const refused = await fetch(`${plainUrl}/api/reload`, { method: 'POST' });
    const refusedBody = await refused.json().catch(() => null);
    check('  and refuses a reload rather than pretending', refused.status === 409,
      `status ${refused.status}`);
    check('    saying how to get one', /dev:canvas/.test(refusedBody?.error ?? ''),
      JSON.stringify(refusedBody?.error ?? ''));

    spawnSync(process.execPath, [src('bin.ts'), 'stop'], { env: cliEnv, encoding: 'utf8' });
  }
} catch (error) {
  failures += 1;
  console.error(`FAIL: ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  restoreAll();
  if (pane) pane.close();
  server.kill('SIGTERM');
  await sleep(300);
  if (server.exitCode === null) server.kill('SIGKILL');
  fs.rmSync(vault, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} hot reload check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('hot reload: all checks passed.');

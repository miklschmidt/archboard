#!/usr/bin/env bun
//
// A hot reload must cost nothing that is on screen (TASK-057, ADR 0014).
//
// `bun --hot` re-evaluates a changed module inside the running process. That is
// what makes reloading the canvas safe at all — `bun --watch` restarts, and a
// restart takes every unsaved board with it. But "inside the running process"
// is only half the story: module scope is still rebuilt, so anything the canvas
// keeps in a module-level Map would be replaced by an empty one while the tabs
// stayed connected to a server that had forgotten them. That failure is silent
// from the outside, which is why it is checked here rather than asserted in a
// doc.
//
// So this drives a real canvas under `--hot`, puts real work on it, edits real
// source files, and then asks the same questions afterwards:
//
//   · the boards, and the unsaved elements on them
//   · the pane registrations, and which board each pane holds
//   · the WebSocket a pane is holding, which must not have closed
//   · the change feed's identity and cursor, which a hook keeps between turns
//   · that a reload emits no event of its own, and that real events still flow
//
// Two files are edited, not one. Editing `src/server.ts` re-runs the top of the
// entry point: the port must not be re-bound, the socket handlers must be
// replaced rather than stacked. Editing `src/core/board-store.ts` re-runs the
// line that puts the scratch board in the store, which would blank it.
//
// Both edits are appended comments, restored in a finally block. If this check
// is killed outright, `git diff` shows the marker.

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

// The settle window the feed uses, shortened so this check is not mostly sleep.
const SETTLE_MS = 300;

const MARKER = '// hot-reload check: appended, then removed. If you are reading this in a diff, the check died.';

const server = spawn(process.execPath, ['--hot', src('server.ts')], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    ARCHBOARD_VAULT: vault,
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

/**
 * Edit a source file and wait for the canvas to say it came back up in place.
 *
 * The log line is the signal on purpose: it is what a human watching the
 * terminal sees, so a check that waits for anything else would be checking
 * something nobody else can see.
 */
async function reload(file) {
  const before = fs.readFileSync(file, 'utf8');
  const seen = output.length;
  fs.writeFileSync(file, `${before}\n${MARKER}\n`);
  try {
    await waitFor(
      async () => output.slice(seen).includes('reloaded in place'),
      `${path.relative(repoRoot, file)} to reload the canvas`
    );
  } finally {
    fs.writeFileSync(file, before);
    // The restore is another edit, so wait that reload out too rather than
    // letting it land in the middle of the next section's assertions.
    await sleep(1200);
  }
}

const box = (label, x) => ({
  type: 'rectangle', x, y: 40, width: 160, height: 80,
  label: { text: label },
  customData: { archboard: { node: label.toLowerCase(), kind: 'service', name: label } }
});

let pane = null;

try {
  const first = await waitFor(health, 'the canvas to come up');
  const pid = first.pid;

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

  const registration = {
    clientId: 'p-hot-1', paneId: 'p-hot-1', primary: true, focused: true, elementCount: 0,
    board: boardKey,
    rect: { x: 0, y: 0, width: 1280, height: 800 },
    viewport: { x: 0, y: 0, width: 1280, height: 800, zoom: 1 }
  };
  await api('POST', '/api/panes', registration);
  pane = socket;

  await api('POST', `/api/elements?board=${boardKey}`, box('Auth', 0));
  await api('POST', `/api/elements?board=${boardKey}`, box('Orders', 400));

  const panesBefore = (await api('GET', '/api/panes')).body;
  const elementsBefore = (await api('GET', `/api/elements?board=${boardKey}`)).body;
  check('two elements are on the board and nothing has saved them',
    elementsBefore.count === 2, String(elementsBefore.count));
  check('the pane is registered holding that board',
    panesBefore.panes?.[0]?.board === boardKey, JSON.stringify(panesBefore.panes?.[0]?.board));

  // Let the first drawing settle into an event, so the cursor afterwards is a
  // number a hook could have written down.
  await sleep(SETTLE_MS + 400);
  const feedBefore = (await api('GET', `/api/changes?board=${boardKey}`)).body;
  check('the change feed has recorded the drawing',
    feedBefore.cursor >= 1, `cursor ${feedBefore.cursor}`);

  const sockets = (await health()).websocket_clients;
  check('the canvas counts the pane\'s socket', sockets === 1, String(sockets));

  // ── Reload one: the entry point itself ─────────────────────

  await reload(src('server.ts'));

  const after = await waitFor(health, 'the canvas to answer after the reload');
  check('the canvas is still the same process', after.pid === pid, `${pid} -> ${after.pid}`);
  check('the pane is still connected', closed === null && after.websocket_clients === sockets,
    `close code ${closed}, ${after.websocket_clients} of ${sockets} sockets`);

  const elementsAfter = (await api('GET', `/api/elements?board=${boardKey}`)).body;
  check('the unsaved elements are still on the board',
    elementsAfter.count === 2, String(elementsAfter.count));
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

  // The socket is open, but a socket can be open and deaf: the connection
  // handler is re-registered on reload, and the broadcast list is what the old
  // handler put the socket in.
  const beforeBroadcast = seen.length;
  await api('POST', `/api/elements?board=${boardKey}`, box('Ledger', 800));
  await sleep(300);
  check('a pane that was connected before the reload still hears broadcasts',
    seen.slice(beforeBroadcast).some(m => m.type === 'element_created'),
    JSON.stringify(seen.slice(beforeBroadcast).map(m => m.type)));

  await sleep(SETTLE_MS + 400);
  const feedLater = (await api('GET', `/api/changes?board=${boardKey}&since=${feedBefore.cursor}`)).body;
  check('  and a real change after the reload is still reported once',
    (feedLater.events ?? []).length === 1, `${(feedLater.events ?? []).length} events`);

  // ── Reload two: a module with state at the top of it ───────
  //
  // board-store.ts creates the scratch board when it is evaluated. Re-evaluate
  // it carelessly and the board is replaced by an empty one, with every pane
  // still pointed at it.

  await reload(src('core/board-store.ts'));

  const storeAfter = (await api('GET', `/api/elements?board=${boardKey}`)).body;
  check('re-evaluating the board store does not blank the board it creates',
    storeAfter.count === 3, String(storeAfter.count));
  const panesFinal = (await api('GET', '/api/panes')).body;
  check('  and the pane is still there holding it',
    panesFinal.panes?.length === 1 && panesFinal.panes[0].board === boardKey);
  check('  with the socket never having closed', closed === null, String(closed));

  // ── And the canvas a human starts does not watch anything ──
  //
  // The capability above is worth having only because it is asked for. A
  // reload is cheap when a developer typed the command that causes it and
  // expensive when a stray file save causes it under someone's hands, so
  // `canvas start` spawns a plain process and this is what says so: the
  // command line of the server the CLI actually started.

  const plainPort = PORT + 1;
  const plainUrl = `http://127.0.0.1:${plainPort}`;
  const cliEnv = {
    ...process.env,
    EXPRESS_SERVER_URL: plainUrl,
    ARCHBOARD_VAULT: vault,
    LOG_LEVEL: 'error'
  };
  const started = spawnSync(process.execPath, [src('bin.ts'), 'start'], { env: cliEnv, encoding: 'utf8' });
  let plainPid = null;
  try {
    plainPid = JSON.parse(started.stdout).pid;
  } catch {
    check('`canvas start` starts a canvas', false, started.stdout || started.stderr);
  }
  if (plainPid) {
    const argv = spawnSync('ps', ['-o', 'args=', '-p', String(plainPid)], { encoding: 'utf8' }).stdout.trim();
    check('`canvas start` runs the server from src', /src\/server\.ts/.test(argv), argv);
    check('  and asks for no reloading of any kind', !/--hot|--watch/.test(argv), argv);
    spawnSync(process.execPath, [src('bin.ts'), 'stop'], { env: cliEnv, encoding: 'utf8' });
  }
} catch (error) {
  failures += 1;
  console.error(`FAIL: ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  if (pane) pane.close();
  server.kill('SIGTERM');
  await sleep(300);
  if (server.exitCode === null) server.kill('SIGKILL');
  fs.rmSync(vault, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} hot reload check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('hot reload: all checks passed.');

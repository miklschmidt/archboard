#!/usr/bin/env bun
//
// A long session of interleaved agent and human writes, with the pane's
// document and the server's held against each other after every cycle
// (TASK-076).
//
// WHY THIS EXISTS. Stage 7 made a write return the resulting document and the
// pane render it (TASK-074). Without this check, "the server is the truth" is
// a claim: every other check in scripts/ writes once and reads once, and every
// bug this stage exists to prevent needed a session to build up in. A label
// multiplied every time a board went round the loop until one edge carried 42
// copies of its own name (TASK-024). A rename came back (TASK-028). An emptied
// label refilled itself (TASK-029). None of them is visible in one round trip.
//
// WHY 42 CYCLES. Two reasons, and the second is the one that settled it.
//
// TASK-024's label gained a copy every time the board went round the loop and
// had 42 of them before it was obvious enough to a person to report. So 42 is
// "as many trips as it took that bug to become visible without a check" — a
// horizon a three-cycle check sits well inside, and this one runs to the end
// of.
//
// And then the count earned itself. Writing this check found two real
// divergences, and the second — a deleted container leaving its label behind,
// pointing at a shape that was gone — first appears on **cycle 7**, because
// that is the first cycle in which the human deletes a box the agent made.
// Three cycles would not have reached it. Neither would five. The rotations
// below are 5 agent moves against 4 human ones, so every pairing has happened
// by cycle 20 and 42 runs the whole table twice.
//
// The assertion is per cycle rather than at the end for the same reason: a
// divergence that grows by one a cycle is caught on the first cycle it
// appears, and the failure names that cycle.
//
// WHY A REAL BROWSER. The pane's document is Excalidraw's document. A socket
// standing in for a pane — which is what every other check here uses, for good
// reasons — holds whatever it was sent and cannot disagree with us, so it
// cannot catch a divergence caused by rendering: a field Excalidraw rewrites,
// an index it repairs, a binding it drops. This check needs the disagreement.
//
// HOW THE HUMAN IS DRIVEN, and what that costs. Excalidraw's own editing
// gestures cannot be aimed: the canvas is one DOM node, so there is no
// selector for "the box at 400,200", and synthetic pointer events do not reach
// Excalidraw's handlers (scripts/check-fixed-point.mjs measured that). So the
// human's hands are one real trusted click, which is what arms the pane to
// report at all, and then edits made by calling the live Excalidraw
// instance's own `updateScene` through the fiber. That is the same door the
// pane's own code goes through and it fires the same `onChange`, so everything
// downstream — the debounce, the delta against the baseline, the label
// statements, the echo — is exercised exactly as it is in use. What it does
// not exercise is Excalidraw's pointer handling, and this check does not claim
// to.
//
// WHAT IS IGNORED, and why. Nine fields, and they divide in two:
//
//   version, versionNonce, updated
//       Excalidraw's own per-mutation bookkeeping. It rewrites them on every
//       change and the server does not track them.
//   createdAt, updatedAt, syncedAt, source, syncTimestamp
//       the server's own bookkeeping about an element, rather than fields of
//       the element. `cleanElementForExcalidraw` strips all five on the way
//       into the pane, so the pane has never held them and "the pane dropped
//       it" would be a lie. `source` and `syncTimestamp` are not timestamps
//       and are named here rather than folded quietly into "the server's own":
//       an ignore list that grows without anyone noticing is how a check like
//       this stops meaning anything.
//
// Nothing else. `index`, `seed`, `boundElements`, `containerId`, `rawText`,
// `points`, every geometry field: all compared, because under ADR 0015 they
// are all in the note, and a field the pane and the server disagree about is a
// board with two answers.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = p => path.join(repoRoot, 'src', p);
const skipBuild = process.argv.includes('--skip-build');
const CYCLES = Number(process.env.CYCLES ?? 42);

let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The one place this check has to know a number the pane is using: it plants a
// broadcast while a drag is still sitting in the pane's report debounce. Read
// from src/core/timing.ts rather than copied, because a copy here would keep
// passing after somebody shortened the debounce and would stop testing the
// thing it names.
const { LOCK_FREE_LINGER_MS, LOCK_RENEW_MS, REPORT_DEBOUNCE_MS } = await import(src('core/timing.ts'));
const MID_DEBOUNCE_MS = Math.round(REPORT_DEBOUNCE_MS * 0.3);

const IGNORED = new Set([
  'version', 'versionNonce', 'updated',
  'createdAt', 'updatedAt', 'syncedAt', 'source', 'syncTimestamp'
]);

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

const which = spawnSync('agent-browser', ['--version'], { stdio: 'ignore' });
if (which.error) {
  console.error('live-session: agent-browser is not on PATH, so there is no pane to disagree with us.');
  console.error('  A socket cannot stand in here: the point is what Excalidraw does to a document.');
  process.exit(2);
}

// A unix socket path is capped at 103 bytes and the default socket dir follows
// HOME, so a checkout under a long home directory fails before the browser
// opens. Same fix as check-fixed-point.mjs.
const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-'));
const browserEnv = { ...process.env, AGENT_BROWSER_SOCKET_DIR: socketDir };

const sessionId = (() => {
  const asked = spawnSync('agent-browser',
    ['session', 'id', '--scope', 'worktree', '--prefix', 'archboard-live'],
    { encoding: 'utf-8', env: browserEnv });
  return asked.stdout?.trim() || `archboard-live-${Math.random().toString(36).slice(2, 10)}`;
})();

const browser = (args, stdin) => new Promise((resolve, reject) => {
  const child = spawn('agent-browser', ['--session', sessionId, ...args],
    { stdio: ['pipe', 'pipe', 'pipe'], env: browserEnv });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', c => { stdout += c.toString(); });
  child.stderr.on('data', c => { stderr += c.toString(); });
  child.stdin.end(stdin ?? '');
  child.on('exit', code => code === 0
    ? resolve(stdout)
    : reject(new Error(`agent-browser ${args[0]} failed: ${(stderr || stdout).trim()}`)));
});

const evalInPage = async js => {
  const out = await browser(['eval', '--stdin'], js);
  try {
    return JSON.parse(out);
  } catch {
    throw new Error(`the page did not answer with JSON: ${out.trim().slice(0, 300)}`);
  }
};

// The live Excalidraw instance, found by walking the fiber up from the canvas
// node. An internal, and deliberately so: the frontend exposes no handle, and
// the alternative — inferring the pane's document from what it posts — cannot
// see a field the pane holds and never reports.
const APP = `(() => {
  const node = document.querySelector('.excalidraw');
  const key = node && Object.keys(node).find(k => k.startsWith('__reactFiber$'));
  let fiber = key ? node[key] : null;
  for (let i = 0; fiber && i < 60; i++) {
    const app = fiber.stateNode;
    if (app && typeof app === 'object' && app.scene
        && typeof app.scene.getElementsIncludingDeleted === 'function') return app;
    fiber = fiber.return;
  }
  return null;
})()`;

const readScene = () => evalInPage(`(() => {
  const app = ${APP};
  if (!app) return { error: 'no Excalidraw app instance' };
  return { elements: app.scene.getElementsIncludingDeleted().map(e => ({ ...e })) };
})()`);

// Counting what the pane posts, from inside the pane.
//
// Two questions need this and nothing else can answer either. Did applying an
// echo bounce — that is, did writing the server's own answer into the scene
// read back as a human edit and start another report (TASK-074)? And did one
// human gesture cost one write? The server sees requests without knowing
// which were provoked by which.
const INSTALL_COUNTER = `(() => {
  if (window.__abReports) return { already: true };
  window.__abReports = { sent: 0, done: 0 };
  const original = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || (input && input.method) || 'GET';
    const counted = method === 'POST' && url.includes('/api/elements/changes');
    if (counted) window.__abReports.sent += 1;
    const answer = original.apply(this, arguments);
    return counted ? answer.then(r => { window.__abReports.done += 1; return r; }) : answer;
  };
  return { installed: true };
})()`;

const reportCount = () => evalInPage('(() => ({ ...window.__abReports }))()');

// ---------------------------------------------------------------------------
// The human's hands
// ---------------------------------------------------------------------------
//
// One edit, applied to the live scene through Excalidraw's own updateScene, so
// the pane's onChange fires and everything downstream runs unchanged.
//
// A retyped label measures itself in the page, with the same font the element
// carries, because Excalidraw does not re-measure a text element it is handed
// (a finding of stage 5) — so a width invented here would be a width the note
// keeps, and this check would be asserting its own arithmetic rather than the
// round trip.
const humanEdit = edit => evalInPage(`(() => {
  const app = ${APP};
  if (!app) return { error: 'no Excalidraw app instance' };
  const edit = ${JSON.stringify(edit)};
  const all = app.scene.getElementsIncludingDeleted().map(e => ({ ...e }));
  const at = all.findIndex(e => e.id === edit.id);
  if (at === -1) return { error: 'the pane is not holding ' + edit.id };

  let next = all;
  if (edit.kind === 'delete') {
    next = all.filter(e => e.id !== edit.id);
  } else if (edit.kind === 'move') {
    next = all.map(e => e.id === edit.id ? { ...e, x: e.x + edit.dx, y: e.y + edit.dy } : e);
  } else if (edit.kind === 'resize') {
    next = all.map(e => e.id === edit.id
      ? { ...e, width: Math.max(20, e.width + edit.dw), height: Math.max(20, e.height + edit.dh) }
      : e);
  } else if (edit.kind === 'retype') {
    const text = all[at];
    if (text.type !== 'text') return { error: edit.id + ' is not a text element' };
    const ctx = document.createElement('canvas').getContext('2d');
    const family = { 1: 'Virgil', 2: 'Helvetica', 3: 'Cascadia', 5: 'Excalifont',
      6: 'Nunito', 7: 'Lilita One', 8: 'Comic Shanns' }[text.fontFamily] || 'Excalifont';
    ctx.font = text.fontSize + 'px ' + family;
    const width = ctx.measureText(edit.text).width;
    next = all.map(e => e.id === edit.id
      ? { ...e, text: edit.text, originalText: edit.text, rawText: edit.text, width }
      : e);
  } else {
    return { error: 'unknown edit ' + edit.kind };
  }

  app.updateScene({ elements: next, captureUpdate: 'IMMEDIATELY' });
  return { ok: true, count: next.length };
})()`);

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

// NO NUMBER LEAVES THE PAGE.
//
// `agent-browser eval` hands a value back as JSON and a double does not always
// survive: a text width the page holds as 107.81990051269531 arrives here as
// 107.81990051269533, two units in the last place away. That is a difference
// this check would report, and it would be reporting its own transport. So the
// pane's document is turned into strings *in the page*, by this very function
// — injected, rather than written twice, because two spellings of one
// comparison is what ADR 0015 is about — and only strings cross.
//
// Key order is not content, either. The two sides build `startBinding` in a
// different order, `{elementId, focus, gap, fixedPoint}` against
// `{elementId, fixedPoint, focus, gap}`, and the note is written through
// `canonicalizeKeys` whichever way round it arrives. Sorted recursively.
// Nothing else is normalised: values are compared exactly, floats included.
function elementFields(element, ignored) {
  const canonicalise = value => {
    if (Array.isArray(value)) return value.map(canonicalise);
    if (value && typeof value === 'object') {
      const sorted = {};
      for (const key of Object.keys(value).sort()) sorted[key] = canonicalise(value[key]);
      return sorted;
    }
    return value;
  };
  const fields = {};
  for (const key of Object.keys(element).sort()) {
    if (ignored.indexOf(key) !== -1) continue;
    fields[key] = JSON.stringify(canonicalise(element[key]));
  }
  return { id: element.id, type: element.type, text: element.text, fields };
}

/** A document as this check compares it: one entry per element, all strings. */
const snapshotOf = elements => [...elements]
  .filter(element => !element.isDeleted)
  .sort((a, b) => (a.id < b.id ? -1 : 1))
  .map(element => elementFields(element, [...IGNORED]));

// What is compared is the ids and the fields, and nothing else in the entry:
// `type` and `text` ride along only so a failure can name an element by what
// it reads rather than by an id nobody recognises. `divergences` below is the
// comparison; there is deliberately no second, stricter one beside it.

/** The same, of what the pane is holding, computed in the pane. */
const paneSnapshot = () => evalInPage(`(() => {
  const app = ${APP};
  if (!app) return { error: 'no Excalidraw app instance' };
  const elementFields = ${elementFields.toString()};
  const ignored = ${JSON.stringify([...IGNORED])};
  return {
    elements: app.scene.getElementsIncludingDeleted()
      .filter(element => !element.isDeleted)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map(element => elementFields(element, ignored))
  };
})()`);

/**
 * Where two documents differ, said in enough detail to act on: the element,
 * the field, and both values. "documents differ" on a 55-element board costs
 * an hour before anybody knows what happened.
 */
// The one place two measurers meet, and the only difference this check lets
// through (TASK-078).
//
// A text element's width is measured, and there are two measurers: Chrome's
// `measureText`, which is what a pane reports after a human types, and
// `src/core/measure-text.ts`, which is what the server writes into the note.
// They agree to within 0.0012 px across 130,000 measurements
// (`docs/design/measuring-text-outside-a-browser.md`), and not to the bit. That
// used to be invisible, because the server kept whatever width the pane sent
// and only the note carried a re-measured one. The note is the board now
// (ADR 0015), so every write restates it and the last few decimal places of a
// human's typing come back different.
//
// So: a text element's width may differ by less than the measurers do, and
// nothing else may differ at all. Anything larger is a real disagreement and is
// still reported exactly.
const MEASURER_EPSILON = 0.0012;
const measurementNoise = (element, key, a, b) => {
  if (element.type !== 'text' || key !== 'width') return false;
  const ours = Number(a);
  const theirs = Number(b);
  return Number.isFinite(ours) && Number.isFinite(theirs) &&
    Math.abs(ours - theirs) < MEASURER_EPSILON;
};

const divergences = (server, pane) => {
  const ours = new Map(server.map(element => [element.id, element]));
  const theirs = new Map(pane.map(element => [element.id, element]));
  const found = [];
  // A text element's id says nothing to a reader; what it reads does.
  const name = element => element.type === 'text'
    ? `${element.id} (text ${JSON.stringify(element.text)})`
    : `${element.id} (${element.type})`;
  for (const [id, element] of ours) {
    const other = theirs.get(id);
    if (!other) {
      found.push(`${name(element)}: the server holds it, the pane does not`);
      continue;
    }
    const keys = [...new Set([...Object.keys(element.fields), ...Object.keys(other.fields)])].sort();
    for (const key of keys) {
      const a = element.fields[key] ?? '<absent>';
      const b = other.fields[key] ?? '<absent>';
      if (a === b) continue;
      if (measurementNoise(element, key, a, b)) continue;
      found.push(`${name(element)} .${key}: server ${a} / pane ${b}`);
    }
  }
  for (const [id, element] of theirs) {
    if (!ours.has(id)) found.push(`${name(element)}: the pane holds it, the server does not`);
  }
  return found;
};

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------

// The bundle this renders is half of what is being measured, so it has to be
// current — but `check-fixed-point.mjs` builds too, and running the suite is
// not the moment to build the same frontend twice. So: build when the sources
// are newer than the bundle, and say which it chose.
const newestUnder = dir => {
  let newest = 0;
  const walk = at => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  };
  walk(dir);
  return newest;
};

const bundle = path.join(repoRoot, 'dist/frontend/index.html');
const builtAt = fs.existsSync(bundle) ? fs.statSync(bundle).mtimeMs : 0;
const sourcedAt = Math.max(newestUnder(path.join(repoRoot, 'frontend')),
  newestUnder(path.join(repoRoot, 'src')));

if (!skipBuild && sourcedAt > builtAt) {
  console.log('# building the frontend (a source is newer than dist/frontend)');
  const built = spawnSync(process.execPath, ['run', 'build'], { cwd: repoRoot, encoding: 'utf-8' });
  if (built.status !== 0) {
    console.error('live-session: the frontend would not build.');
    console.error((built.stderr || built.stdout || '').split('\n').slice(-20).join('\n'));
    process.exit(2);
  }
} else if (!skipBuild) {
  console.log('# dist/frontend is newer than every source, so it is what this renders');
}
if (!fs.existsSync(path.join(repoRoot, 'dist/frontend/index.html'))) {
  console.error('live-session: no dist/frontend to serve. Run `bun run build`.');
  process.exit(2);
}

const freePort = () => new Promise(resolve => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const PORT = Number(process.env.PORT) || await freePort();
const base = `http://127.0.0.1:${PORT}`;
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-live-'));

const server = spawn(process.execPath, [src('server.ts')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'pipe']
});
let serverStderr = '';
server.stderr.on('data', chunk => { serverStderr += chunk.toString(); });

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

const BOARD = 'session';
const held = async () => (await api('GET', `/api/elements?board=${BOARD}`)).body?.elements ?? [];

/**
 * Wait until the two documents say the same thing, and report what they still
 * disagree about if they never do.
 *
 * Convergence, not instantaneous equality: a write is in flight for a moment
 * and the pane is briefly behind. What this asserts is that every cycle ends
 * agreed — which is the property a session needs, and the one a divergence
 * that grows by one a cycle cannot survive.
 */
const agree = async ({ tries = 60, gap = 100 } = {}) => {
  let last = null;
  for (let i = 0; i < tries; i++) {
    const server = snapshotOf(await held());
    const read = await paneSnapshot();
    if (read.error) throw new Error(`could not read the pane: ${read.error}`);
    // Agreement is what `divergences` finds nothing to say about, not string
    // equality: the two sides measure a text's width with two measurers and
    // the last decimal places are allowed to differ (see MEASURER_EPSILON).
    last = divergences(server, read.elements);
    if (last.length === 0) return { agreed: true };
    await sleep(gap);
  }
  return { agreed: false, divergences: last ?? [] };
};

// The agent's half of a cycle. Rotating on purpose: a check that only ever
// creates never finds out what a move does to a bound arrow.
const AGENT_MOVES = ['create-labelled', 'create-arrow', 'move', 'recolour', 'relabel'];
// The human's half.
const HUMAN_MOVES = ['move', 'resize', 'retype', 'delete'];

const PALETTE = ['#ffec99', '#b2f2bb', '#a5d8ff', '#ffc9c9', '#d0bfff', '#ffd8a8'];

let firstDivergence = null;

try {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${base}/health`); if (r.ok) break; } catch { /* not up yet */ }
    await sleep(100);
  }

  // --- a board with a note, because that is the shape a session has ---------

  await api('POST', '/api/boards/new', { board: BOARD, level: 'service' });
  const seeded = await api('POST', `/api/elements/changes?board=${BOARD}`, {
    origin: 'agent',
    upserts: [
      { id: 'auth', type: 'rectangle', x: 100, y: 100, width: 220, height: 90, label: { text: 'AuthService' } },
      { id: 'queue', type: 'rectangle', x: 500, y: 100, width: 200, height: 90, label: { text: 'Queue' } },
      { id: 'store', type: 'ellipse', x: 300, y: 320, width: 200, height: 100, label: { text: 'Postgres' } },
      { id: 'e1', type: 'arrow', x: 320, y: 145, points: [[0, 0], [180, 0]], start: { id: 'auth' }, end: { id: 'queue' } },
      { id: 'note', type: 'text', x: 100, y: 480, text: 'drawn by the agent' }
    ]
  });
  check('a board is seeded with labelled shapes, a bound arrow and a standalone text',
    seeded.status === 200 && (await held()).length === 8,
    `status ${seeded.status}, ${(await held()).length} elements on the board`);

  const saved = await api('POST', '/api/boards/save', { board: BOARD });
  check('  and saved, so the session starts from the note the exporter writes',
    saved.status === 200 && fs.existsSync(saved.body?.file ?? ''), saved.body?.error ?? '');

  // --- the pane ------------------------------------------------------------

  await browser(['open', base]);
  let panes = null;
  for (let i = 0; i < 100; i++) {
    panes = (await api('GET', '/api/panes')).body;
    if (panes?.paneCount >= 1) break;
    await sleep(100);
  }
  check('a real browser opens the canvas and registers a pane',
    panes?.paneCount === 1, `session ${sessionId}, paneCount ${panes?.paneCount ?? 'none'}`);

  // Headless is a requirement of the machine this runs on, not a preference. A
  // window that maps takes focus under Hyprland, and this check is in
  // `bun run test` and holds the desktop for the better part of a minute, so a
  // headed browser would yank it away from whoever is working. Asked of the
  // page rather than trusted from the flag, the same way check-fixed-point.mjs
  // asks.
  const ua = await evalInPage('navigator.userAgent');
  check('  without mapping a window, because a window would steal focus',
    /headless/i.test(ua), ua);

  const opened = await api('POST', '/api/boards/open', { board: BOARD, reload: true });
  check('  and the board is read into it from the vault',
    opened.status === 200 && opened.body?.elementCount === 8,
    `${opened.body?.source} / ${opened.body?.elementCount} elements`);

  await evalInPage(INSTALL_COUNTER);

  // A pane nobody has touched never reports, deliberately (useCanvasSession),
  // so the human's half of this check does not exist until somebody's hand
  // lands on the glass. This is that hand, and it is the one piece of real
  // trusted input here: a click on empty canvas, which selects nothing and
  // draws nothing.
  await browser(['click', '.excalidraw']);

  const start = await agree();
  check('the pane and the server agree before anybody writes',
    start.agreed, (start.divergences ?? []).slice(0, 4).join(' | '));

  // --- the session ---------------------------------------------------------

  const shapes = () => ['auth', 'queue', 'store'];
  let created = 0;
  let bothSides = 0;
  let bounced = 0;
  let agreedCycles = 0;
  const madeIds = [];

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    const before = await reportCount();
    const board = await held();
    const byId = new Map(board.map(e => [e.id, e]));

    // Which element this cycle picks on. Rotating through the seeded shapes
    // means the same element is written by both sides within a cycle, which is
    // the case a merge by id has to survive.
    const subject = shapes()[cycle % 3];

    // ---- the agent writes ----
    const agentMove = AGENT_MOVES[cycle % AGENT_MOVES.length];
    let upserts = [];
    if (agentMove === 'create-labelled') {
      const id = `svc${cycle}`;
      madeIds.push(id);
      created += 1;
      upserts = [{
        id, type: 'rectangle', x: 800 + (cycle % 5) * 40, y: 100 + cycle * 12,
        width: 180, height: 80, label: { text: `Service ${cycle}` }
      }];
    } else if (agentMove === 'create-arrow') {
      const id = `arr${cycle}`;
      madeIds.push(id);
      created += 1;
      upserts = [{
        id, type: 'arrow', x: 320, y: 360, points: [[0, 0], [120, 40]],
        start: { id: 'store' }, end: { id: 'queue' }
      }];
    } else if (agentMove === 'move') {
      const element = byId.get(subject);
      upserts = [{ id: subject, x: element.x + (cycle % 2 ? 7 : -7), y: element.y + 3 }];
    } else if (agentMove === 'recolour') {
      upserts = [{ id: subject, backgroundColor: PALETTE[cycle % PALETTE.length] }];
    } else if (agentMove === 'relabel') {
      // The seed, which is the input format and the thing TASK-024 multiplied.
      upserts = [{ id: subject, label: { text: `${subject} v${cycle}` } }];
    }
    const wrote = await api('POST', `/api/elements/changes?board=${BOARD}`, { origin: 'agent', upserts });
    if (wrote.status !== 200) {
      check(`cycle ${cycle}: the agent's ${agentMove} was accepted`, false,
        wrote.body?.error ?? `status ${wrote.status}`);
      break;
    }

    // ---- the human writes, without waiting for the agent's echo to land ----
    //
    // Closely interleaved on purpose: the agent's broadcast is still in flight
    // to the pane when the pane starts computing its own delta, which is the
    // arrangement in which an echo can overwrite local work.
    const humanMove = HUMAN_MOVES[cycle % HUMAN_MOVES.length];
    let target = subject;
    let edit = null;
    if (humanMove === 'move') {
      edit = { kind: 'move', id: target, dx: 11, dy: -5 };
      bothSides += 1;
    } else if (humanMove === 'resize') {
      edit = { kind: 'resize', id: target, dw: cycle % 2 ? 6 : -6, dh: 0 };
      bothSides += 1;
    } else if (humanMove === 'retype') {
      // The bound text of the subject, which is where a human's typing lands.
      const label = board.find(e => e.type === 'text' && e.containerId === target);
      target = label?.id ?? 'note';
      edit = { kind: 'retype', id: target, text: `typed at ${cycle}` };
    } else if (humanMove === 'delete') {
      // Something the agent made and nothing is bound to, so a delete is a
      // delete rather than a cascade.
      const spare = madeIds.filter(id => id.startsWith('svc') && byId.has(id));
      target = spare[0];
      if (target) {
        madeIds.splice(madeIds.indexOf(target), 1);
        edit = { kind: 'delete', id: target };
      }
    }

    if (edit) {
      const applied = await humanEdit(edit);
      if (applied.error) {
        check(`cycle ${cycle}: the human's ${humanMove} reached the pane`, false, applied.error);
        break;
      }
    }

    // ---- and both documents had better be the same afterwards ----
    const settled = await agree();
    if (settled.agreed) agreedCycles += 1;
    else if (!firstDivergence) {
      firstDivergence = { cycle, agentMove, humanMove, divergences: settled.divergences };
    }

    // One gesture, one report — and applying the echo must not have started
    // another. The agent's write produces no report at all: it reaches the
    // pane as a broadcast, and a broadcast the pane applies is not news the
    // pane has to tell anybody.
    const after = await reportCount();
    const reports = after.done - before.done;
    if (reports > (edit ? 1 : 0)) bounced += 1;
  }

  check(`${CYCLES} cycles of interleaved agent and human writes, and the two documents ` +
        'agreed after every one',
  agreedCycles === CYCLES,
  firstDivergence
    ? `first diverged on cycle ${firstDivergence.cycle} (agent ${firstDivergence.agentMove}, ` +
        `human ${firstDivergence.humanMove}): ${firstDivergence.divergences.slice(0, 6).join(' | ')}`
    : `${agreedCycles} of ${CYCLES} agreed`);

  if (firstDivergence && firstDivergence.divergences.length > 6) {
    console.log(`#   ${firstDivergence.divergences.length} differences in all:`);
    for (const line of firstDivergence.divergences) console.log(`#     ${line}`);
  }

  check('  and the session really did write both sides of the loop',
    created > 0 && bothSides > 0,
    `${created} elements the agent created and the pane never named, ` +
    `${bothSides} cycles where both sides wrote the same element`);

  check('  and applying an echo never started another change report',
    bounced === 0, `${bounced} cycles reported more than the human's own gesture`);

  // --- what a broadcast may not do ----------------------------------------
  //
  // The other half of TASK-074's split. A pane holding work the server has not
  // heard about yet must not lose it when somebody else's write arrives, which
  // is why another writer's broadcast is merged by id and only this pane's own
  // response is applied whole.

  const boardNow = await held();
  const victim = boardNow.find(e => e.id === 'auth');
  await humanEdit({ kind: 'move', id: 'auth', dx: 40, dy: 40 });

  // The pane's hold, taken out from under it, which is the one arrangement in
  // which this can still happen (ADR 0016). A drag takes the board on its first
  // change and gives it back once the report has landed, so an agent writing in
  // between now waits rather than interleaving — that is what the mutex is for,
  // and it means the race below is no longer reachable by writing faster.
  //
  // It is still reachable, which is why the merge stays: a hold is a lease, and
  // a pane whose lease lapsed — the hold request never arrived, the process it
  // was taken in went away, a network blip — is exactly a pane holding
  // undelivered work with the board free. Releasing it here is that state,
  // arranged rather than waited for. Change reports are deliberately not gated
  // on any of it, so the drag is still coming.
  const owner = (await api('GET', '/api/panes')).body?.panes?.[0]?.clientId;
  check('  the pane can be named, so its hold can be taken out from under it',
    typeof owner === 'string' && owner.length > 0, String(owner));
  const given = await api('POST', `/api/boards/hold/release?board=${BOARD}`, { clientId: owner });
  // `released: true` is only possible if the pane's hold was standing at this
  // moment, and nothing but the human's edit above could have taken it — the
  // release names the pane, and a release names nobody else's hold. So this is
  // the leading edge proved end to end in a real browser: the gesture took the
  // board, and it took it before the report the debounce is still sitting on.
  check('  and it was holding the board, taken at the first change of the gesture',
    given.body?.released === true, JSON.stringify(given.body));

  // Inside the pane's report debounce, so the drag is still undelivered.
  await api('POST', `/api/elements/changes?board=${BOARD}`, {
    origin: 'agent',
    upserts: [{ id: 'queue', backgroundColor: '#ff8787' }]
  });
  await sleep(MID_DEBOUNCE_MS);
  const midFlight = await readScene();
  const draggedNow = midFlight.elements.find(e => e.id === 'auth');
  check('a broadcast arriving mid-drag leaves the undelivered drag on the glass',
    // Within a thousandth of a pixel rather than exactly, because this one
    // number does cross as a number and the transport rounds the last bits.
    // Nothing about "did the drag survive" turns on an ulp.
    draggedNow && Math.abs(draggedNow.x - (victim.x + 40)) < 0.001,
    `the pane held x ${draggedNow?.x}, the drag put it at ${victim.x + 40}`);

  // And the same moment is the proof that every "they agreed" above is worth
  // something. Right now the pane is holding a drag the server has not been
  // told about, so the two documents differ by exactly one field on one
  // element and the comparison had better say so — by name. A read-back that
  // had quietly stopped working would report agreement here too.
  const planted = divergences(snapshotOf(await held()), (await paneSnapshot()).elements);
  check('  and the comparison names that difference, so the agreements above are real',
    planted.some(line => line.startsWith('auth (rectangle) .x:')),
    planted.length === 0
      ? 'the pane and the server were reported as agreeing while the drag was undelivered'
      : planted.slice(0, 3).join(' | '));

  const afterBoth = await agree();
  check('  and the drag reaches the server once the report goes out',
    afterBoth.agreed, (afterBoth.divergences ?? []).slice(0, 4).join(' | '));
  const finalBoard = await held();
  const landed = finalBoard.find(e => e.id === 'auth');
  const recoloured = finalBoard.find(e => e.id === 'queue');
  check('  with both writers\' work on the board',
    landed && Math.abs(landed.x - (victim.x + 40)) < 0.001 && recoloured?.backgroundColor === '#ff8787',
    `auth.x ${landed?.x} (wanted ${victim.x + 40}), queue.backgroundColor ${recoloured?.backgroundColor}`);

  // --- somebody else writes the note, mid-session (TASK-079, ADR 0006) -----
  //
  // The one thing this session has not had in it: another application. Under
  // ADR 0015 every gesture is a write, so a note rewritten by Obsidian is
  // discovered 400 ms after a finger lifts rather than at a save somebody ran.
  // What must NOT happen then is a modal in front of a person mid-thought
  // whose best offer is "discard what you just drew".
  //
  // This is the only check that can see that, because "a dialog did not open"
  // is a fact about a rendered page. Everything else about a hold is asserted
  // headlessly in check-boards.

  const noteFile = (await api('GET', `/api/boards/info?board=${BOARD}`)).body?.file;
  // Their edit: an element this canvas has never seen, so their version is
  // recognisable, and a different byte count, so the hash moves.
  fs.writeFileSync(noteFile, fs.readFileSync(noteFile, 'utf-8').replace(
    '"id": "auth"', '"id": "theirs", "width": 40}, {"id": "auth"'
  ));

  await humanEdit({ kind: 'move', id: 'queue', dx: 9, dy: 9 });
  // The report debounce, the refusal, and the pane saying what is on its
  // screen, which is one round trip after it.
  await sleep(2000);

  const stopped = (await api('GET', `/api/elements?board=${BOARD}`)).body?.held;
  check('a note rewritten underneath stops the board saving, mid-session',
    stopped?.board === BOARD && stopped?.fromScreen === true,
    JSON.stringify({ board: stopped?.board, fromScreen: stopped?.fromScreen }));

  const chrome = await evalInPage(`(() => ({
    dialog: document.querySelector('.modal-title')?.textContent ?? null,
    mark: document.querySelector('.chip-held')?.textContent ?? null
  }))()`);
  check('  and nothing opened in front of the human, who was drawing',
    chrome.dialog === null, chrome.dialog);
  check('  while the bar says the board is not being saved, and how much is held',
    /not saving/.test(chrome.mark ?? ''), chrome.mark);

  // The human's gesture is not lost, and neither is the rest of the board:
  // the pane said what was on its screen, so the held copy is that screen
  // rather than their note with one drag on top of it.
  const heldAgreed = await agree();
  check('  and the pane and the server still hold the same document',
    heldAgreed.agreed, (heldAgreed.divergences ?? []).slice(0, 4).join(' | '));
  check('  which is this pane\'s board, not the one the other editor wrote',
    !(await held()).some(e => e.id === 'theirs'));

  // Asked for, not pushed. This is the click the whole task is about.
  const markClick = await evalInPage(`(() => {
    const mark = document.querySelector('.chip-held');
    if (!mark) return { error: 'no mark to click' };
    mark.click();
    return { clicked: true };
  })()`);
  if (markClick.error) check('  the mark can be clicked', false, markClick.error);
  await sleep(300);
  const offered = await evalInPage(`(() => ({
    title: document.querySelector('.modal-title')?.textContent ?? null,
    choices: [...document.querySelectorAll('.choices .btn')].map(b => b.textContent)
  }))()`);
  check('  and clicking the mark is what offers the three outcomes',
    /not being saved/.test(offered.title ?? '') && offered.choices.length === 3,
    `${offered.title} ${JSON.stringify(offered.choices)}`);
  check('  each one of them, in the order that puts the free one nearest',
    offered.choices.join(' | ') === 'Save as… | Reload the note | Overwrite the note',
    JSON.stringify(offered.choices));

  // And one of them, carried out: overwrite writes what is on this screen.
  await evalInPage(`(() => {
    const button = [...document.querySelectorAll('.choices .btn')]
      .find(b => b.textContent === 'Overwrite the note');
    if (button) button.click();
    return { clicked: Boolean(button) };
  })()`);
  await sleep(1200);
  const noteAfter = fs.readFileSync(noteFile, 'utf-8');
  check('  and overwriting writes the held board over their note',
    !noteAfter.includes('"theirs"') && noteAfter.includes('"queue"'),
    noteAfter.includes('"theirs"')
      ? 'their element is still in the note'
      : (noteAfter.includes('"queue"') ? '' : 'queue is missing from the note'));
  const backToNormal = await evalInPage(
    `(() => ({ mark: document.querySelector('.chip-held')?.textContent ?? null }))()`
  );
  check('  and the mark comes down, because the board is saving again',
    backToNormal.mark === null, backToNormal.mark);

  // --- the pane refuses the touch, not the write --------------------------
  //
  // ADR 0016's other half, and this is the only check with a renderer to ask.
  // A canvas applies a drag the instant a finger moves, so a board somebody
  // else is writing has to stop accepting a touch *before* it happens; view
  // mode is Excalidraw's own word for that, and reading it off the live app is
  // the only way to know the pane really is refusing rather than intending to.

  const viewMode = () => evalInPage(`(() => {
    const app = ${APP};
    return app ? { view: app.state.viewModeEnabled === true } : { error: 'no Excalidraw app instance' };
  })()`);

  const free = await viewMode();
  check('a pane on a board nobody is writing accepts a touch', free.view === false, JSON.stringify(free));

  // Somebody else takes it, and keeps taking it. The lease is deliberately
  // shorter than a long gesture, so renewing is what a real hold looks like;
  // without this the board would simply come free underneath the assertion.
  await api('POST', `/api/boards/hold?board=${BOARD}`, { clientId: 'another-writer' });
  const renewing = setInterval(() => {
    void api('POST', `/api/boards/hold?board=${BOARD}`, { clientId: 'another-writer' });
  }, LOCK_RENEW_MS);
  await sleep(500);
  const taken = await viewMode();
  check('  and stops accepting one as soon as somebody else takes the board',
    taken.view === true, JSON.stringify(taken));

  clearInterval(renewing);
  await api('POST', `/api/boards/hold/release?board=${BOARD}`, { clientId: 'another-writer' });
  await sleep(LOCK_FREE_LINGER_MS + 600);
  const back = await viewMode();
  check('  and takes it back when they are done', back.view === false, JSON.stringify(back));

  // --- a claim says whose board it is, and hands it back ------------------
  //
  // For a twenty-millisecond write, a disabled surface is enough and a banner
  // would be a flicker under somebody's hand. For a claim that may run for
  // minutes it is not: a 75-inch display that stops responding with nothing on
  // it to say why has simply broken, as far as the person standing at it can
  // tell (ADR 0016). So the pane says who has the board and what they said they
  // were doing, and offers the one thing a person may always do.

  const claimWhy = 'redrawing the payment path';
  const banner = () => evalInPage(`(() => {
    const app = ${APP};
    return {
      what: document.querySelector('.pane-claim-what')?.textContent ?? null,
      take: document.querySelector('.pane-claim-take')?.textContent ?? null,
      view: app ? app.state.viewModeEnabled === true : null
    };
  })()`);

  // Polled rather than slept for, the same way the fail-closed check below is.
  // What is being asked is whether the pane ever puts the banner up, and a
  // fixed wait asks instead whether a runner got there in that many
  // milliseconds — which is how this file has already had one check report a
  // failure that had not happened.
  const bannerWhen = async (ready, within = 8000) => {
    const by = Date.now() + within;
    let seen = await banner();
    while (!ready(seen) && Date.now() < by) {
      await sleep(100);
      seen = await banner();
    }
    return seen;
  };

  await api('POST', `/api/boards/claim?board=${BOARD}`, { reason: claimWhy });
  const claimed = await bannerWhen(seen => seen.what !== null);
  check('a pane whose board an agent claimed says who has it and why',
    typeof claimed.what === 'string' && claimed.what.includes(claimWhy), JSON.stringify(claimed));
  check('  and stops accepting a touch, as for any other holder',
    claimed.view === true, JSON.stringify(claimed));
  check('  and offers the person the one thing they may always do',
    claimed.take === 'Take it back', JSON.stringify(claimed));

  // One deliberate tap, not any touch. View mode still pans and zooms, so
  // somebody reading what the agent is drawing must not end it by reading it —
  // and nothing an agent wrote is put back by taking the board, so a stray palm
  // would leave a half-drawn board with nobody having decided anything.
  // Guarded, because a missing button is one of the things this section exists
  // to catch, and clicking null would end the file instead of counting it.
  const tap = await evalInPage(`(() => {
    const button = document.querySelector('.pane-claim-take');
    if (button) button.click();
    return { tapped: button !== null };
  })()`);
  check('  and the tap lands on something', tap.tapped === true, JSON.stringify(tap));
  // The board is free the moment the tap lands; the panes are told a linger
  // later, so this waits for the news rather than for the linger.
  const returned = await bannerWhen(seen => seen.what === null && seen.view === false);
  check('and one tap takes the board back',
    returned.what === null && returned.view === false, JSON.stringify(returned));

  const lost = await api('POST', `/api/elements?board=${BOARD}`, {
    type: 'rectangle', x: 900, y: 900, width: 20, height: 20
  });
  check('  and the agent is told at its next write, rather than finding the board changed',
    lost.status === 409 && lost.body?.code === 'CLAIM_REVOKED',
    `${lost.status} ${JSON.stringify(lost.body)?.slice(0, 160)}`);

  // The half that has to fail closed, and the reason it is last. Lock state is
  // broadcast over the socket, and change reports deliberately are not gated on
  // the socket — so a pane that has lost contact hears nothing about the lock
  // while remaining perfectly able to post a write nobody will accept. ADR 0016
  // says a pane that cannot be told must assume the board is held. Killing the
  // canvas is how a dropped socket is arranged here.
  // Wait for the canvas to actually be gone rather than for a fixed interval.
  // A sleep here measures how fast a runner tears a process down, not whether
  // the pane fails closed: CI killed the server, slept 1.5 s, found the socket
  // still open and the pane still — correctly — connected, and reported a
  // fail-open that had not happened. `onclose` sets `connected` false the
  // moment it fires, so the only thing worth waiting on is the close itself.
  const died = new Promise(resolve => server.once('exit', resolve));
  server.kill('SIGTERM');
  await Promise.race([died, sleep(5000).then(() => server.kill('SIGKILL'))]);
  await died;

  // Then give the pane a bounded moment to notice. Polling rather than sleeping
  // for the same reason, and the bound matters: a pane that takes a long time to
  // fail closed is a pane a person can keep drawing into after archboard has
  // stopped being able to accept it.
  let orphaned = await viewMode();
  const noticedBy = Date.now() + 5000;
  while (orphaned.view !== true && Date.now() < noticedBy) {
    await sleep(100);
    orphaned = await viewMode();
  }
  check('a pane that has lost the socket assumes the board is held, not free',
    orphaned.view === true, JSON.stringify(orphaned));
} catch (error) {
  failures += 1;
  console.log(`FAIL - ${error.message}`);
} finally {
  await browser(['close']).catch(() => { });
  server.kill('SIGTERM');
  await sleep(200);
  fs.rmSync(vault, { recursive: true, force: true });
  fs.rmSync(socketDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nlive-session: ${failures} check(s) failed.`);
  if (serverStderr.trim()) console.error(serverStderr.trim().split('\n').slice(-10).join('\n'));
  process.exit(1);
}
console.log(`\nlive-session: all checks passed. ${CYCLES} cycles of mixed agent and human writes, ` +
  'and the pane and the server held the same document after every one.');

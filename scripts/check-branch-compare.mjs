#!/usr/bin/env bun
//
// A proposal is a branch of the board it proposes against (TASK-043).
//
// This is the objective half of the skill's headline path. Asked for a variant,
// a model can either branch the board it was given or draw the whole thing
// again from scratch, and only one of those produces a diff anybody can read.
// The failure is not hypothetical: it happened in real use, and `compare`
// degenerated to everything-removed-everything-added.
//
// The two outcomes, on one source board with one change to it:
//
//   branched                   redrawn from scratch
//   sharedNodes     3          sharedNodes     1
//   nodesAdded      1          nodesAdded      3
//   nodesRemoved    0          nodesRemoved    2
//   edgesUnchanged  2          edgesUnchanged  0
//
// The redraw here is a careful one: it draws the same architecture and only
// words two labels differently. That is enough, because `compare` joins on the
// node id promotion derives from the label. A redraw that also renames the
// things it draws shares nothing at all and comes back `comparable: false`.
//
// What this cannot check is whether an agent reading the skill *chooses* to
// branch. That needs a model, so it stays eval 5 in
// skills/archboard/evals/evals.json. This file checks the consequence;
// the eval checks the choice. The last section here holds the two halves
// together by making the eval file declare which of its entries is which.
//
// The last two sections check the same path with a node that is not a box: a
// stencil from the shipped library, and a connector somebody promoted. Both
// belong here rather than in check-library.mjs, because what broke was not the
// palette but what the readers made of what it placed (TASK-053).
//
// No browser: elements, promotion, save, branch and compare are all server
// state, so the whole path runs headlessly against a real canvas server on a
// random port with a throwaway vault.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withDoing } from './lib/doing.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = p => path.join(repoRoot, 'src', p);
const SELF = 'scripts/check-branch-compare.mjs';

let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The canvas this file talks to. Decided before the imports because config.ts
// captures EXPRESS_SERVER_URL at module load, and `insertStencil` reaches the
// canvas through it, on the same path `library insert` and
// `insert_library_item` take.
const PORT = Number(process.env.PORT || 35000 + Math.floor(Math.random() * 2000));
const base = `http://127.0.0.1:${PORT}`;
process.env.EXPRESS_SERVER_URL = base;

const { planPromotion } = await import(src('core/promote.ts'));
const { describeScene } = await import(src('core/describe.ts'));
const { insertStencil } = await import(src('core/library-catalogue.ts'));
const { setRequestedBoard, setWriteDoing } = await import(src('core/canvas-client.ts'));
// Driving the client directly means setting what the CLI's --doing and MCP's
// `doing` argument set, or the canvas refuses the write (TASK-095).
setWriteDoing('checking a branch against the board it came from');

// ---------------------------------------------------------------------------
// What a branched proposal looks like, in compare's own vocabulary
// ---------------------------------------------------------------------------
//
// The three nodes that were already there are still those three nodes, the two
// arrows between them are still those two arrows, and the only news is the one
// node and the one edge somebody added. Returns the reasons the diff is not
// that, so a failure says which number moved rather than just "false".

function notABranch(diff) {
  const summary = diff?.summary ?? {};
  const wrong = [];
  const want = (field, value) => {
    if (summary[field] !== value) wrong.push(`${field} ${summary[field]}, wanted ${value}`);
  };
  want('comparable', true);
  want('sharedNodes', 3);
  want('nodesAdded', 1);
  want('nodesRemoved', 0);
  want('edgesAdded', 1);
  want('edgesRemoved', 0);
  want('edgesUnchanged', 2);
  return wrong;
}

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------

const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-branch-'));

const server = spawn(process.execPath, [src('server.ts')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'pipe']
});
let serverStderr = '';
server.stderr.on('data', chunk => { serverStderr += chunk.toString(); });

const api = async (method, url, body) => {
  // Every write says what it is doing, once for the whole check (TASK-095,
  // scripts/lib/doing.mjs). The refusal itself is proved in check-doing.mjs.
  url = withDoing(url, method, 'checking a branch against the board it came from');
  const response = await fetch(`${base}${url}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const elementsOn = async board => (await api('GET', `/api/elements?board=${encodeURIComponent(board)}`)).body?.elements ?? [];

/** Draw a labelled box and return the id the server gave it. */
async function addBox(board, label, x, y) {
  const made = await api('POST', `/api/elements?board=${encodeURIComponent(board)}`, {
    type: 'rectangle', x, y, width: 200, height: 100, label: { text: label }
  });
  return made.body?.element?.id;
}

const addArrow = (board, from, to) =>
  api('POST', `/api/elements?board=${encodeURIComponent(board)}`, {
    type: 'arrow', x: 0, y: 0, width: 100, height: 0, start: { id: from }, end: { id: to }
  });

/**
 * Promote a shape the way `promote --kind ... --variant ...` does: the real
 * planner decides the node id from the label, and the updates go over the same
 * HTTP route the CLI uses. Deriving the id from the label is the whole reason a
 * reworded redraw stops comparing, so nothing here may shortcut it.
 *
 * The variant is passed explicitly, which is what the CLI's `--variant` is for.
 * Leaving it off would make this check depend on what `promote` defaults to on
 * a variant board, and that default is being changed under TASK-040.
 */
async function promote(board, elementId, kind, variant) {
  return promoteTogether(board, [elementId], kind, variant);
}

/**
 * The same act over a whole stencil: many elements, one node. A stencil drawn
 * out of lines carries no label to derive an id from, so the name is spoken,
 * which is what the CLI's `--name` is for.
 */
async function promoteTogether(board, elementIds, kind, variant, name) {
  const all = await elementsOn(board);
  const wanted = new Set(elementIds);
  const targets = all.filter(el => wanted.has(el.id));
  const plan = planPromotion({
    targets, board: all, kind, variant, level: 'service', ...(name ? { name } : {})
  });
  for (const update of plan.updates) {
    await api('PUT', `/api/elements/${update.id}?board=${encodeURIComponent(board)}`, update);
  }
  return plan.nodes[0]?.node;
}

/** The whole architecture at once: boxes in a row, arrows along it, promoted. */
async function draw(board, variant, nodes, edges) {
  const ids = {};
  for (const [label, kind, x, y] of nodes) ids[label] = await addBox(board, label, x, y);
  for (const [from, to] of edges) await addArrow(board, ids[from], ids[to]);
  for (const [label, kind] of nodes) await promote(board, ids[label], kind, variant);
  return ids;
}

const ROW = [
  ['API Gateway', 'gateway', 0, 100],
  ['Orders Service', 'service', 300, 100],
  ['Orders Postgres', 'datastore', 600, 100]
];
const FLOW = [['API Gateway', 'Orders Service'], ['Orders Service', 'Orders Postgres']];

try {
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/health`); break; } catch { await sleep(100); }
  }

  // --- the architecture as it stands -------------------------------------

  await api('POST', '/api/boards/new', { board: 'payments', level: 'service' });
  await draw('payments', 'current', ROW, FLOW);
  const savedCurrent = await api('POST', '/api/boards/save?board=payments');
  check('the source board saves as one note',
    savedCurrent.status === 200 && fs.existsSync(savedCurrent.body?.file ?? ''));
  // Distinct nodes, not stamped elements. Promoting a labelled box stamps its
  // bound label too — a shape and its label are one thing, not two — and since
  // stage 5 that label is on the board from the moment the box is written
  // rather than only after a browser has rendered it (TASK-072).
  const nodesOn = async (board) => new Set(
    (await elementsOn(board)).map(el => el.customData?.archboard?.node).filter(Boolean));
  check('  with its three nodes promoted', (await nodesOn('payments')).size === 3,
    [...await nodesOn('payments')].join(', '));

  // --- the proposal, branched from it ------------------------------------

  const branched = await api('POST', '/api/boards/save?board=payments', { name: 'payments', variant: 'option-a' });
  check('a proposal starts as a branch of the board it proposes against',
    branched.status === 200 && branched.body?.board === 'payments@option-a');

  const onBranch = await elementsOn('payments@option-a');
  const serviceOnBranch = onBranch.find(el => el.customData?.archboard?.node === 'orders-service');
  const cache = await addBox('payments@option-a', 'Orders Cache', 300, 320);
  await addArrow('payments@option-a', serviceOnBranch.id, cache);
  const cacheNode = await promote('payments@option-a', cache, 'datastore', 'option-a');
  check('the one change is drawn on the branch', cacheNode === 'orders-cache');
  await api('POST', '/api/boards/save?board=payments@option-a');

  const branchDiff = (await api('GET', '/api/boards/compare?from=payments&to=payments@option-a')).body;
  const branchWrong = notABranch(branchDiff);
  check('a branched proposal compares as the one thing that changed', branchWrong.length === 0, branchWrong.join('; '));
  check('  three nodes are the same three nodes', branchDiff?.summary?.sharedNodes === 3);
  check('  the added node is named, and it is the only one',
    branchDiff?.nodes?.added?.length === 1 && branchDiff.nodes.added[0]?.node === 'orders-cache');
  check('  nothing reads as removed', branchDiff?.summary?.nodesRemoved === 0);
  check('  the two arrows nobody touched read as unchanged',
    branchDiff?.summary?.edgesUnchanged === 2);
  check('  and the new arrow is the one edge added',
    branchDiff?.summary?.edgesAdded === 1 && branchDiff?.edges?.added?.[0]?.to === 'orders-cache');
  // Zero because the branch restamps every copied node with the variant it was
  // saved as (TASK-035). Before that fix the three copies still said
  // "current" and all three came back changed. If this ever reads 3 again,
  // that restamping is what broke.
  check('  and no shared node reads as changed', branchDiff?.summary?.nodesChanged === 0,
    JSON.stringify(branchDiff?.nodes?.changed?.map(c => c.changes) ?? []));
  check('  with no stale-variant warning to explain away',
    !(branchDiff?.warnings ?? []).some(w => /different variant/.test(w)));

  // --- the same proposal, drawn again from scratch ------------------------
  //
  // Same architecture, same one addition, and two labels worded the way a
  // second pass at the same picture words them.

  await api('POST', '/api/boards/new', { board: 'payments@redraw', level: 'service' });
  await draw('payments@redraw', 'redraw', [
    ['Gateway', 'gateway', 0, 100],
    ['Orders Service', 'service', 300, 100],
    ['Postgres', 'datastore', 600, 100],
    ['Orders Cache', 'datastore', 300, 320]
  ], [['Gateway', 'Orders Service'], ['Orders Service', 'Postgres'], ['Orders Service', 'Orders Cache']]);
  await api('POST', '/api/boards/save?board=payments@redraw');

  const redrawDiff = (await api('GET', '/api/boards/compare?from=payments&to=payments@redraw')).body;
  const redrawWrong = notABranch(redrawDiff);
  check('a redraw of the same architecture is not a branch', redrawWrong.length > 0, redrawWrong.join('; '));
  check('  two words changed cost two nodes',
    redrawDiff?.summary?.nodesRemoved === 2 && redrawDiff?.summary?.sharedNodes === 1,
    `removed ${redrawDiff?.summary?.nodesRemoved}, shared ${redrawDiff?.summary?.sharedNodes}`);
  check('  and the rewordings arrive as new nodes beside the real addition',
    redrawDiff?.summary?.nodesAdded === 3, `added ${redrawDiff?.summary?.nodesAdded}`);
  check('  and no edge survives, because an edge is its two endpoints',
    redrawDiff?.summary?.edgesUnchanged === 0);
  check('  so the one real change is not findable in the diff',
    redrawDiff?.nodes?.added?.length === 3);

  // --- and a redraw that renames as it goes -------------------------------

  await api('POST', '/api/boards/new', { board: 'payments@fresh', level: 'service' });
  await draw('payments@fresh', 'fresh', [
    ['Edge Proxy', 'gateway', 0, 100],
    ['Order Handling', 'service', 300, 100],
    ['Order Store', 'datastore', 600, 100],
    ['Order Cache', 'datastore', 300, 320]
  ], [['Edge Proxy', 'Order Handling'], ['Order Handling', 'Order Store'], ['Order Handling', 'Order Cache']]);
  await api('POST', '/api/boards/save?board=payments@fresh');

  const freshDiff = (await api('GET', '/api/boards/compare?from=payments&to=payments@fresh')).body;
  check('an independently drawn proposal shares no node identity at all',
    freshDiff?.summary?.sharedNodes === 0);
  check('  so the branch test fails on it', notABranch(freshDiff).length > 0,
    notABranch(freshDiff).join('; '));
  check('  and compare says it could not compare them, not that they agree',
    freshDiff?.summary?.comparable === false && freshDiff?.summary?.identical === false);
  check('  and says what to do instead',
    (freshDiff?.warnings ?? []).some(w => /share no node ids/.test(w) && /copy of the current board/.test(w)));

  // --- a node made out of a stencil ---------------------------------------
  //
  // The skill tells an agent to look in the library before drawing primitives,
  // and a stencil is whatever primitives its artist reached for: the shipped
  // PostgreSQL is seven `line` elements and nothing else. Both readers used to
  // take any line for a connector and refuse to see a node in one, so
  // promotion reported success, the metadata was on the board, and the
  // datastore appeared in neither the read-back nor the diff. Not added, not
  // removed, not changed, no warning (TASK-053).

  await api('POST', '/api/boards/new', { board: 'storage', level: 'service' });
  const ledger = await addBox('storage', 'Ledger Service', 0, 100);
  await promote('storage', ledger, 'service', 'current');

  setRequestedBoard('storage');
  const stencil = await insertStencil({ name: 'PostgreSQL', source: 'drwnio', x: 400, y: 100 });
  setRequestedBoard(null);
  const stencilTypes = [...new Set(stencil.elements.map(el => el.type))];
  check('the shipped library holds a stencil drawn out of nothing but lines',
    stencil.count === 7 && stencilTypes.join() === 'line',
    `${stencil.count} elements: ${stencilTypes.join(',')}`);

  const dbNode = await promoteTogether(
    'storage', stencil.elements.map(el => el.id), 'datastore', 'current', 'Ledger DB');
  check('  promoting the whole stencil gives it one node id', dbNode === 'ledger-db', String(dbNode));
  const promoted = (await elementsOn('storage')).filter(el => el.customData?.archboard?.node === 'ledger-db');
  check('  carried by every line it is made of', promoted.length === 7, `${promoted.length} of 7`);

  const readBack = describeScene(await elementsOn('storage'));
  check('  and the read-back counts it as a node', /\(2 nodes,/.test(readBack),
    readBack.split('\n').find(l => l.startsWith('Total elements')));
  check('  names it', readBack.includes('Ledger DB'));
  check('  and reads no edge into it', /0 edges/.test(readBack));

  await api('POST', '/api/boards/save?board=storage');
  const storageBranch = await api('POST', '/api/boards/save?board=storage', { name: 'storage', variant: 'option-a' });
  check('the board branches with the stencil node on it',
    storageBranch.status === 200 && storageBranch.body?.board === 'storage@option-a');

  const replica = await addBox('storage@option-a', 'Ledger Replica', 400, 400);
  await promote('storage@option-a', replica, 'datastore', 'option-a');
  await api('POST', '/api/boards/save?board=storage@option-a');

  const storageDiff = (await api('GET', '/api/boards/compare?from=storage&to=storage@option-a')).body;
  check('  and compare sees the stencil node on both sides',
    storageDiff?.summary?.sharedNodes === 2, `sharedNodes ${storageDiff?.summary?.sharedNodes}`);
  check('  reports it unchanged by name',
    (storageDiff?.nodes?.unchanged ?? []).some(n => n.node === 'ledger-db'),
    JSON.stringify((storageDiff?.nodes?.unchanged ?? []).map(n => n.node)));
  check('  not as something added or removed',
    storageDiff?.summary?.nodesAdded === 1 && storageDiff?.summary?.nodesRemoved === 0 &&
    storageDiff?.nodes?.added?.[0]?.node === 'ledger-replica');
  check('  and no line of it is left over as a connector bound to nothing',
    (storageDiff?.edges?.unresolved?.to ?? []).length === 0,
    JSON.stringify(storageDiff?.edges?.unresolved?.to ?? []));

  // --- a connector that got promoted --------------------------------------
  //
  // The other half of the same rule. An element carrying a node id is part of
  // that node, so it is not also a candidate edge: the two loops divide the
  // board rather than counting one element twice. Nothing refuses this at
  // promotion time, because stencils are made of arrows as well as lines and a
  // type test there would put promotion at the mercy of the tool an artist
  // reached for. That leaves one case where promoting costs something: an
  // arrow swept into a selection stops being the dependency it was drawn as,
  // and `compare` says so rather than letting it disappear.

  await api('POST', '/api/boards/new', { board: 'wiring', level: 'service' });
  const web = await addBox('wiring', 'Web', 0, 100);
  const worker = await addBox('wiring', 'Worker', 400, 100);
  await promote('wiring', web, 'service', 'current');
  await promote('wiring', worker, 'service', 'current');
  await addArrow('wiring', web, worker);
  await api('POST', '/api/boards/save?board=wiring');
  await api('POST', '/api/boards/save?board=wiring', { name: 'wiring', variant: 'option-a' });

  // The lasso selection a user makes: the box, and the arrow that happened to
  // be under it.
  const onWiring = await elementsOn('wiring@option-a');
  const arrow = onWiring.find(el => el.type === 'arrow');
  const sweptIn = await promoteTogether(
    'wiring@option-a', [worker, arrow.id], 'service', 'option-a');
  check('an arrow swept into a promotion joins the node it was promoted with',
    sweptIn === 'worker', String(sweptIn));

  const wiringRead = describeScene(await elementsOn('wiring@option-a'));
  check('  the read-back counts it once, as part of that node', /\(2 nodes, 0 edges/.test(wiringRead),
    wiringRead.split('\n').find(l => l.startsWith('Total elements')));

  await api('POST', '/api/boards/save?board=wiring@option-a');

  const wiringDiff = (await api('GET', '/api/boards/compare?from=wiring&to=wiring@option-a')).body;
  check('  and stops being an edge, rather than being counted as both',
    wiringDiff?.summary?.edgesRemoved === 1 && wiringDiff?.summary?.edgesAdded === 0,
    `removed ${wiringDiff?.summary?.edgesRemoved}, added ${wiringDiff?.summary?.edgesAdded}`);
  check('  which compare says out loud, naming the connection that went',
    (wiringDiff?.warnings ?? []).some(w => /includes a connector/.test(w) && /"Web"/.test(w) && /"Worker"/.test(w)),
    JSON.stringify(wiringDiff?.warnings ?? []));
  check('  and both nodes are still the same two nodes',
    wiringDiff?.summary?.sharedNodes === 2 && wiringDiff?.summary?.nodesRemoved === 0);

  // --- the half a script cannot check -------------------------------------
  //
  // Whether an agent chooses to branch is an eval, so the eval file has to say
  // which of its entries is checked here and which needs a human reading a
  // transcript. Otherwise the split is a thing somebody remembered once.

  const evalsPath = path.join(repoRoot, 'skills/archboard/evals/evals.json');
  const evals = JSON.parse(fs.readFileSync(evalsPath, 'utf-8')).evals ?? [];
  check('every eval says how it is graded', evals.length > 0 && evals.every(e => typeof e.graded_by === 'string' && e.graded_by),
    evals.filter(e => !e.graded_by).map(e => `#${e.id}`).join(','));
  check('  the branching one names this check', evals.some(e => e.graded_by === SELF));
  check('  every other grader is a human reading a transcript, or another script that exists',
    evals.every(e => e.graded_by === 'human' || fs.existsSync(path.join(repoRoot, e.graded_by))),
    evals.filter(e => e.graded_by !== 'human' && !fs.existsSync(path.join(repoRoot, e.graded_by)))
      .map(e => e.graded_by).join(','));
} finally {
  server.kill('SIGTERM');
  await sleep(200);
  fs.rmSync(vault, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nbranch-compare: ${failures} check(s) failed.`);
  if (serverStderr.trim()) console.error(serverStderr.trim().split('\n').slice(-10).join('\n'));
  process.exit(1);
}
console.log('\nbranch-compare: all checks passed.');

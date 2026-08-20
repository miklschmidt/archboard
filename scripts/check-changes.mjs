#!/usr/bin/env bun
//
// Semantic change events (TASK-018) and app-server injection (TASK-019).
//
// Three layers, none of which needs a browser and none of which needs Codex:
//
//   engine     what counts as a change, and what it is called
//   feed       when a change becomes an event, and when it deliberately does not
//   injection  the guards, the wire format, and the choice of channel
//
// The injection layer runs against a stub daemon in this file that speaks the
// same wire protocol as Codex's app-server control socket (unix socket,
// WebSocket upgrade, no `jsonrpc` field, initialize first). That proves the
// client's behaviour and the shape of what it sends; it does not prove Codex
// accepts it, which only a real daemon can.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = p => path.join(repoRoot, 'src', p);

let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const identity = { board: 'payments', variant: 'current', level: 'service' };
const box = (id, x, y, node, kind = 'service') => ({
  id, type: 'rectangle', x, y, width: 200, height: 100,
  ...(node ? { customData: { archboard: { node, kind, name: node } } } : {})
});
// Excalidraw stores a labelled shape as a shape plus a bound text element that
// moves with it; the fixtures mirror that, because the difference is exactly
// what one of the checks below is about.
const label = (id, container, text, x, y) => ({
  id, type: 'text', x: x + 20, y: y + 40, width: 100, height: 20, text, containerId: container
});
const arrow = (id, from, to) => ({
  id, type: 'arrow', x: 0, y: 0, width: 10, height: 10,
  startBinding: { elementId: from }, endBinding: { elementId: to }
});

const scene = () => [
  box('a', 0, 0, 'gateway', 'gateway'), label('al', 'a', 'Gateway', 0, 0),
  box('b', 300, 0, 'auth'), label('bl', 'b', 'AuthService', 300, 0),
  box('c', 600, 0, 'pg', 'datastore'), label('cl', 'c', 'Postgres', 600, 0),
  arrow('e1', 'a', 'b'), arrow('e2', 'b', 'c')
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const { diffBoardStates, narrateChange } = await import(src('core/changes.ts'));
const diff = (before, after) => diffBoardStates(before, after, identity, 'payments');

{
  const base = scene();
  const nudged = base.map(el => (el.id === 'b' ? { ...el, x: 312 } : el.id === 'bl' ? { ...el, x: 332 } : el));
  const change = diff(base, nudged);
  check('a 12px nudge is not a change worth reporting', change.significance === 'none', change.significance);
}

{
  const base = scene();
  const pulled = base.map(el =>
    el.id === 'b' ? { ...el, y: 1400 } : el.id === 'bl' ? { ...el, y: 1440 } : el);
  const change = diff(base, pulled);
  check('dragging a node out of its cluster is a layout change', change.significance === 'layout', change.significance);
  const moved = change.nodes.moved.find(m => m.node === 'auth');
  check('  and the node is reported as leaving the company it kept',
    Boolean(moved) && 'cluster' in moved.changes);
  check('  and the narration names nodes, never node ids',
    !narrateChange(change).includes('el:') && narrateChange(change).includes('AuthService'));
}

{
  const base = scene();
  const change = diff(base, base.filter(el => el.id !== 'e1'));
  check('cutting an edge is structural', change.significance === 'structural' && change.counts.edgesRemoved === 1);
  check('  and it is named by both ends',
    change.edges.removed[0]?.fromName === 'Gateway' && change.edges.removed[0]?.toName === 'AuthService');
}

{
  const base = scene();
  const rerouted = base.map(el => (el.id === 'e2' ? { ...el, startBinding: { elementId: 'a' } } : el));
  const change = diff(base, rerouted);
  check('moving one end of an edge is inferred as a reroute', change.counts.edgesRerouted === 1);
}

{
  // An un-promoted box: no node id, so nothing but element identity to join on.
  const base = [...scene(), box('z', 620, 300), label('zl', 'z', 'Redis', 620, 300)];
  const change = diff(scene(), base);
  check('a box the human drew but nobody promoted is still reported',
    change.significance === 'structural' && change.counts.nodesAdded === 1);
  check('  and it is described, not identified by id',
    change.nodes.added[0]?.anonymous === true && change.nodes.added[0]?.name === 'Redis');

  const promoted = base.map(el =>
    el.id === 'z' ? { ...el, customData: { archboard: { node: 'redis', kind: 'datastore', name: 'Redis' } } } : el);
  const after = diff(base, promoted);
  check('promoting it reads as a promotion, not as a deletion plus an addition',
    after.counts.identityChanges === 1 && after.counts.nodesAdded === 0 && after.counts.nodesRemoved === 0,
    JSON.stringify(after.counts));
  check('  and it does not make the cluster look like it churned',
    after.layout.clusters.length === 0, JSON.stringify(after.layout.clusters.map(c => c.kind)));
  check('  and the promotion knows what it used to be',
    after.nodes.identity[0]?.what === 'promoted' && after.nodes.identity[0]?.to.kind === 'datastore');
}

{
  // archboard stores a labelled shape as ONE element carrying its label inline;
  // the browser syncs it back as a shape plus a bound text element. The label
  // is the same either way, so the only difference is how it is stored — and
  // that must not read as a change. Observed live: without this, every node the
  // agent drew reported "elementCount 1 → 2" the moment a human touched the
  // board, and that noise took the headline off the change the human made.
  const labelled = { ...box('a', 0, 0, 'gateway', 'gateway'), label: { text: 'Gateway' } };
  const drawn = [labelled];
  const synced = [labelled, label('al', 'a', 'Gateway', 0, 0)];
  const change = diff(drawn, synced);
  check('a node gaining its bound label on first sync is not a semantic change',
    change.counts.nodesChanged === 0, JSON.stringify(change.counts));
}

{
  const base = scene();
  const recoloured = base.map(el => (el.id === 'a' ? { ...el, backgroundColor: '#ffc9c9' } : el));
  check('recolouring is cosmetic, and cosmetic is not an event',
    diff(base, recoloured).significance === 'cosmetic');
}

// --- a label left behind tells the reader the wrong thing (TASK-034) --------
//
// A node's box is the box round the shape *and* its bound label. So a label
// whose stored coordinates were never moved when its container was does not
// merely sit in the wrong place: it stretches the node it belongs to across
// everything in between, and the read-back describes that instead of the move.
// Nothing on screen shows it, because Excalidraw recomputes a bound label's
// position from its container at draw time.

const { boundTextDrift } = await import(src('core/labels.ts'));

{
  const base = scene();
  const moved = base.map(el => (el.id === 'b' ? { ...el, y: 900 } : el));
  const stranded = moved;
  const carried = moved.map(el => (el.id === 'bl' ? { ...el, y: 940 } : el));

  check('a label left behind is drift, and the invariant says so',
    boundTextDrift(stranded).length === 1 && boundTextDrift(stranded)[0].textId === 'bl',
    JSON.stringify(boundTextDrift(stranded).map(d => d.textId)));
  check('  while a label that came along is not',
    boundTextDrift(carried).length === 0);

  const wrong = diff(base, stranded);
  const right = diff(base, carried);
  check('a dragged node leaves the cluster it was in', right.nodes.moved.length === 3 &&
    right.nodes.moved.every(node => 'cluster' in node.changes));
  check('  and with its label left behind, the same drag reports none of that',
    wrong.nodes.moved.length === 1 && !('cluster' in wrong.nodes.moved[0].changes),
    JSON.stringify(wrong.nodes.moved.map(node => Object.keys(node.changes))));
  check('  it reports the node growing instead, which is not what happened',
    wrong.nodes.moved[0]?.changes.prominence?.to === 'larger');
}

{
  // Every board this file builds holds the invariant, so a change here that
  // strands a label fails the check that reads boards rather than the one that
  // moves them.
  const boards = {
    scene: scene(),
    'with an unpromoted box': [...scene(), box('z', 620, 300), label('zl', 'z', 'Redis', 620, 300)],
    'a shape and its first bound label': [
      { ...box('a', 0, 0, 'gateway', 'gateway'), label: { text: 'Gateway' } },
      label('al', 'a', 'Gateway', 0, 0)
    ]
  };
  for (const [name, elements] of Object.entries(boards)) {
    const drifted = boundTextDrift(elements);
    check(`${name}: every bound label sits on the thing it names`, drifted.length === 0,
      drifted.map(d => `${d.text} ${Math.round(d.distance)}px`).join(', '));
  }
}

// --- region, and the frame it is measured in (TASK-022) ---------------------
//
// A region name is a place inside a frame drawn round the board's nodes, so
// the frame moves when the board does. Observed live: adding one box past the
// right edge stretched the frame and the feed said two boxes nobody had
// touched had "moved" — noise in the JSON, and a false statement about a human
// once it reaches a thread as prose.
{
  // Far enough apart that each box is its own cluster, so region is the only
  // signal in play and nothing here is carried by cluster membership.
  const spread = [
    box('a', 0, 0, 'alpha'), box('b', 700, 0, 'bravo'), box('c', 1400, 0, 'charlie'),
    box('d', 0, 600, 'delta'), box('e', 1400, 600, 'echo')
  ];
  const regionMoves = change => change.nodes.moved.filter(m => 'region' in m.changes);

  const added = diff(spread, [...spread, box('z', 2600, 0, 'zulu')]);
  check('a node added past the right edge does not move the nodes nobody touched',
    regionMoves(added).length === 0,
    regionMoves(added).map(m => `${m.name} ${JSON.stringify(m.changes.region)}`).join('; '));
  check('  and the arriving node is still placed at the right of the frame it arrived in',
    added.detail.nodes.added[0]?.layout.region === 'top-right',
    added.detail.nodes.added[0]?.layout.region);
  check('  and the frame is the box round the nodes both sides have, not round everything',
    added.detail.to.regionFrame.maxX === 1600 && added.detail.to.nodeBox.maxX === 2800,
    `frame ${added.detail.to.regionFrame.maxX}, nodes ${added.detail.to.nodeBox.maxX}`);

  const removed = diff(spread, spread.filter(el => el.id !== 'c'));
  check('a node deleted from the right edge does not move the nodes nobody touched',
    regionMoves(removed).length === 0,
    regionMoves(removed).map(m => m.name).join('; '));

  // The other half: the frame can also be stretched by a node that really was
  // dragged. The drag is the event; its bystanders are not.
  const dragged = spread.map(el => (el.id === 'b' ? { ...el, x: 1400, y: 300 } : el));
  const genuine = diff(spread, dragged);
  check('a node genuinely dragged across the board still reports its new region',
    regionMoves(genuine).map(m => m.node).join() === 'bravo',
    regionMoves(genuine).map(m => m.node).join());
  check('  and it reports where it went',
    genuine.nodes.moved[0]?.changes.region?.to === 'middle-right',
    JSON.stringify(genuine.nodes.moved[0]?.changes.region));
  check('  while the nodes it was dragged past are not called moved',
    regionMoves(genuine).every(m => m.node === 'bravo'));

  check('panning the whole board reports nothing at all',
    diff(spread, spread.map(el => ({ ...el, x: el.x + 5000, y: el.y + 5000 }))).significance === 'none');

  const rearranged = diff(spread, spread.map((el, i) => ({ ...el, x: 0, y: i * 700 })));
  check('a board rearranged wholesale still reports the boxes that were moved',
    rearranged.significance === 'layout' && regionMoves(rearranged).length >= 3,
    `${rearranged.significance}, ${regionMoves(rearranged).length} region moves`);
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

process.env.ARCHBOARD_SETTLE_MS = '60000';    // long, so only explicit settles fire
const { changeFeed } = await import(src('core/change-feed.ts'));
const { copyElements } = await import(src('core/board-store.ts'));

{
  let elements = scene();
  const read = () => elements;
  changeFeed.reset('payments', identity, read);

  // A drag, as the browser reports one: many small updates.
  for (let i = 1; i <= 30; i++) {
    elements = elements.map(el =>
      el.id === 'b' ? { ...el, y: i * 50 } : el.id === 'bl' ? { ...el, y: i * 50 + 40 } : el);
    changeFeed.record('payments', identity, read, 'human');
  }
  const event = changeFeed.settle('payments');
  check('a drag of 30 element updates settles into exactly one event',
    event !== null && event.mutations === 30, event ? `mutations=${event.mutations}` : 'no event');
  check('  attributed to the human, because the browser reported it', event?.origin === 'human');
  check('  and a second settle with nothing pending says nothing', changeFeed.settle('payments') === null);

  // Cosmetic-only: silent, and the baseline must NOT move, so that a later
  // real change is still measured from the last thing anybody was told.
  elements = elements.map(el => (el.id === 'a' ? { ...el, backgroundColor: '#ffc9c9' } : el));
  changeFeed.record('payments', identity, read, 'human');
  check('a cosmetic-only change produces no event', changeFeed.settle('payments') === null);

  const cursorBefore = changeFeed.cursor;
  elements = elements.filter(el => el.id !== 'e1');
  changeFeed.record('payments', identity, read, 'agent');
  const next = changeFeed.settle('payments');
  check('the next real change still becomes an event', next !== null && next.cursor === cursorBefore + 1);
  check('  and knows the agent made it', next?.origin === 'agent');

  // The baseline is a deep copy, so an element edited in place is still seen
  // (TASK-052). No route writes this way: they all replace the object. That is
  // the point. A baseline sharing `customData` or `boundElements` with the
  // live board moves when the board moves, and the diff then compares the
  // board against itself and reports nothing, which is silence rather than a
  // wrong answer and so is the hardest kind to notice.
  {
    const live = scene();
    const readLive = () => live;
    changeFeed.reset('inplace', identity, readLive);

    const node = live.find(el => el.id === 'a');
    node.customData.archboard.kind = 'datastore';
    changeFeed.record('inplace', identity, readLive, 'agent');
    const kindEvent = changeFeed.settle('inplace');
    check('customData edited in place is still a change, so the baseline is a copy',
      kindEvent !== null,
      kindEvent ? '' : 'the feed diffed the board against itself and found nothing');

    // The other half is measured on the copy itself, because pushing to
    // boundElements is bookkeeping rather than a semantic change, so it
    // produces no event either way and behaviour cannot tell the two apart.
    const original = scene();
    original[0].boundElements = [{ id: 'al', type: 'text' }];
    const copy = copyElements(original);
    original[0].customData.archboard.kind = 'queue';
    original[0].boundElements.push({ id: 'ghost', type: 'text' });
    check('  and the copy shares neither customData nor boundElements',
      copy[0].customData.archboard.kind === 'gateway' && copy[0].boundElements.length === 1,
      `kind=${copy[0].customData.archboard.kind} bound=${copy[0].boundElements.length}`);
  }

  const net = changeFeed.coalesce(cursorBefore - 1, 'payments');
  check('a caller can ask for one net diff since a cursor rather than a replay',
    net !== null && net.events.length === 2 && net.change.significance !== 'none',
    net ? `${net.events.length} events` : 'no checkpoint');
  check('a cursor the feed can no longer reach answers null, not a wrong diff',
    changeFeed.coalesce(-999, 'nonexistent-board') === null);
}

{
  // Opening a board is not several hundred additions.
  const elements = scene();
  changeFeed.reset('loaded', identity, () => elements);
  check('a board arriving wholesale sets the baseline instead of emitting an event',
    changeFeed.settle('loaded') === null);
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

// Unix socket paths are capped near 100 bytes, so this cannot live under a
// long scratch path.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-'));
const socketDir = path.join(home, 'app-server-control');
fs.mkdirSync(socketDir, { recursive: true, mode: 0o700 });
const socketPath = path.join(socketDir, 'app-server-control.sock');

const received = [];
const httpServer = http.createServer();
const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', ws => {
  let initialized = false;
  ws.on('message', raw => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === 'initialize') {
      initialized = true;
      ws.send(JSON.stringify({ id: msg.id, result: { userAgent: 'stub/0' } }));
      setTimeout(() => {
        ws.send(JSON.stringify({ method: 'thread/started', params: { threadId: 'thread-idle' } }));
        ws.send(JSON.stringify({
          method: 'item/started',
          params: {
            threadId: 'thread-live', turnId: 'turn-1', startedAtMs: Date.now(),
            item: { type: 'mcpToolCall', id: 'i1', server: 'archboard', tool: 'describe', status: 'inProgress', arguments: {} }
          }
        }));
        ws.send(JSON.stringify({
          method: 'turn/started',
          params: { threadId: 'thread-live', turn: { id: 'turn-1', status: 'inProgress', items: [] } }
        }));
      }, 20);
      return;
    }
    received.push(msg);
    if (msg.id === undefined) return;                      // a notification
    if (!initialized) {
      ws.send(JSON.stringify({ id: msg.id, error: { code: -32600, message: 'Not initialized' } }));
    } else if (msg.method === 'thread/loaded/list') {
      ws.send(JSON.stringify({ id: msg.id, result: { data: ['thread-idle', 'thread-live'], nextCursor: null } }));
    } else if (msg.method === 'thread/inject_items') {
      ws.send(JSON.stringify({ id: msg.id, result: {} }));
    } else if (msg.method === 'turn/steer') {
      ws.send(msg.params.expectedTurnId === 'turn-1'
        ? JSON.stringify({ id: msg.id, result: { turnId: 'turn-1' } })
        : JSON.stringify({ id: msg.id, error: { code: -32602, message: 'expectedTurnId does not match' } }));
    } else {
      ws.send(JSON.stringify({ id: msg.id, error: { code: -32601, message: 'method not found' } }));
    }
  });
});
await new Promise(resolve => httpServer.listen(socketPath, resolve));
fs.chmodSync(socketPath, 0o600);

process.env.CODEX_HOME = home;
process.env.ARCHBOARD_INJECT_DEBOUNCE_MS = '150';
process.env.ARCHBOARD_INJECT_MIN_INTERVAL_MS = '150';
const injection = await import(src('core/injection.ts'));

{
  process.env.ARCHBOARD_INJECT = '1';
  injection.startInjection('0.0.0.0');
  const status = injection.injectionStatus();
  check('injection refuses to arm when the canvas is not on loopback',
    status.armed === false && /0\.0\.0\.0/.test(status.refusal ?? ''));
  injection.stopInjection();

  injection.startInjection('192.168.1.20');
  check('  including a plain LAN address', injection.injectionStatus().armed === false);
  injection.stopInjection();

  delete process.env.ARCHBOARD_INJECT;
  injection.startInjection('127.0.0.1');
  check('being on loopback is not enough on its own — the switch is required',
    injection.injectionStatus().armed === false);
  let refused = false;
  await injection.injectTest('nope').catch(() => { refused = true; });
  check('  and the probe refuses too', refused);
  injection.stopInjection();
}

{
  process.env.ARCHBOARD_INJECT = '1';
  injection.startInjection('127.0.0.1');
  await sleep(300);
  const status = injection.injectionStatus();
  check('armed on loopback with the switch set, and connected over the unix socket',
    status.armed && status.connected, status.lastError ?? '');
  check('the target is the thread that called an archboard tool, not an arbitrary one',
    status.target.threadId === 'thread-live' && status.target.reason === 'used-archboard',
    status.target.reason);

  const quiet = await injection.injectTest('wiring check');
  check('injection is quiet by default', quiet.channel === 'quiet');
  const injected = received.find(m => m.method === 'thread/inject_items');
  check('  and appends a developer message in the shape the app-server expects',
    injected?.params?.threadId === 'thread-live' &&
    injected?.params?.items?.[0]?.type === 'message' &&
    injected?.params?.items?.[0]?.role === 'developer' &&
    injected?.params?.items?.[0]?.content?.[0]?.type === 'input_text');
  check('  and never sends a jsonrpc field, which this protocol does not use',
    received.every(m => m.jsonrpc === undefined));

  const loud = await injection.injectTest('loud check', true);
  const steered = received.find(m => m.method === 'turn/steer');
  check('loud can be forced for one probe, and steers the running turn',
    loud.channel === 'loud' && steered?.params?.expectedTurnId === 'turn-1');

  // A change the agent made is not news to the agent.
  const before = injection.injectionStatus().injected.quiet;
  let elements = scene();
  changeFeed.reset('inject-board', identity, () => elements);
  elements = elements.filter(el => el.id !== 'e2');
  changeFeed.record('inject-board', identity, () => elements, 'agent');
  changeFeed.settle('inject-board');
  await sleep(400);
  check('the agent\'s own changes are never injected back at it',
    injection.injectionStatus().injected.quiet === before);

  // A human's change is.
  elements = elements.map(el => (el.id === 'b' ? { ...el, y: 1600 } : el.id === 'bl' ? { ...el, y: 1640 } : el));
  changeFeed.record('inject-board', identity, () => elements, 'human');
  changeFeed.settle('inject-board');
  await sleep(500);
  const after = injection.injectionStatus();
  check('a human\'s change is injected, once', after.injected.quiet === before + 1,
    `${before} -> ${after.injected.quiet}`);
  check('  and what the thread receives names the board and says nothing is being asked of it',
    /\[archboard\]/.test(after.lastInjection.text) && /Nobody is waiting on you/.test(after.lastInjection.text));

  injection.stopInjection();
}

await new Promise(resolve => httpServer.close(resolve));
wss.close();
fs.rmSync(home, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} change/injection check(s) failed.`);
  process.exit(1);
}
console.log('\nchange events and injection: all checks passed.');
process.exit(0);

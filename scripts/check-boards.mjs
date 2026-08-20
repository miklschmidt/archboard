#!/usr/bin/env bun
//
// A board per pane, and a board named on every call (TASK-021, ADR 0009).
//
// Two things are being proved here, and they are the two halves of the same
// decision:
//
//   addressing   a pane can be pointed at a board without disturbing the other
//                pane — the switch reaches one socket, one pane's selection is
//                dropped, and the other pane keeps its board, its elements and
//                its pick
//   authority    a call that names no board is refused, with a message that
//                says what to pass, and nothing is written
//
// It runs against the real canvas server over HTTP and real WebSockets, with
// the sockets standing in for panes. No browser: a pane is a socket plus a
// registration, so everything except rendering can be exercised headlessly —
// which is what makes this cheap enough to run on every build.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = p => path.join(repoRoot, 'src', p);
const { labelTextIdFor } = await import(src('core/labels.ts'));

let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// The rules, on their own
// ---------------------------------------------------------------------------

const {
  resolveBoard, openBoardKeys, SCRATCH_KEY, boards: boardStore,
  getOrCreateBoard, replaceBoardElements
} = await import(src('core/board-store.ts'));
const { BoardRequiredError } = await import(src('core/board-target.ts'));
const { resolvePaneSpec, soloPane, panesInOrder, MAX_PANES } = await import(src('core/panes.ts'));
const { planPromotion } = await import(src('core/promote.ts'));
const {
  boardKey, makeIdentity, parseBoardKey, boardDisplayName,
  normalizeBoardKey, vaultPathFor, listBoards, readBoardFile, identityFrontmatter
} = await import(src('core/board.ts'));

// Board addresses are case-insensitive and unicode-normalised (ADR 0010).
// Boards get named out loud, and a human cannot pronounce casing, so two
// boards that sound the same must not be able to exist. Case-preserving all
// the same: the note keeps the name a human typed.
{
  check('a name is keyed lowercase', makeIdentity({ board: 'Payments' }).board === 'payments');
  check('  and two spellings are one address',
    boardKey(parseBoardKey('Payments')) === boardKey(parseBoardKey('payments')));
  check('  and the casing that was typed is kept for showing',
    boardDisplayName(parseBoardKey('Payments')) === 'Payments');
  check('  and a name already lowercase carries nothing extra',
    parseBoardKey('payments').displayName === undefined);
  check('a variant is a slug, so it is lowercased outright',
    boardKey(parseBoardKey('payments@Option-A')) === 'payments@option-a');
  check('a nested name is normalised segment by segment',
    boardKey(parseBoardKey('Billing/Ledger')) === 'billing/ledger');

  // macOS has historically written an accented name decomposed and Linux
  // writes it composed. Same word, so it has to be the same board.
  const nfc = 'café';        // é
  const nfd = 'café';       // e + combining acute
  check('an accented name is one address however it is composed',
    normalizeBoardKey(nfd) === normalizeBoardKey(nfc) &&
    boardKey(parseBoardKey(nfd)) === boardKey(parseBoardKey(nfc)));

  check('the frontmatter records the casing a human chose, not the key',
    identityFrontmatter(makeIdentity({ board: 'Payments' }))
      .find(([k]) => k === 'board')?.[1] === 'Payments');

  // Against a real vault: case-preserving means a note that exists wins,
  // whatever it was named, and a note that does not yet exist is named the way
  // it was asked for.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-case-'));
  try {
    fs.writeFileSync(path.join(scratch, 'Payments.excalidraw.md'),
      '---\nboard: Payments\nvariant: current\n---\n\n# Excalidraw Data\n\n## Text Elements\n\n%%\n## Drawing\n```json\n{"type":"excalidraw","version":2,"elements":[],"appState":{}}\n```\n%%\n');
    check('a note already in the vault is found under its own casing',
      vaultPathFor(parseBoardKey('payments'), scratch) === path.join(scratch, 'Payments.excalidraw.md'));
    check('  and reading it reports that casing, not the address that was typed',
      readBoardFile(parseBoardKey('payments'), scratch)?.identity?.displayName === 'Payments');
    check('  and it is not reported as declaring a different board',
      readBoardFile(parseBoardKey('payments'), scratch)?.declaredKey === undefined);
    check('a note that does not exist yet takes the casing that was asked for',
      vaultPathFor(parseBoardKey('NewBoard'), scratch) === path.join(scratch, 'NewBoard.excalidraw.md'));

    // The filename a macOS vault would carry: decomposed. Asking for it the
    // composed way has to find it, or a vault stops being portable.
    fs.writeFileSync(path.join(scratch, `${nfd}.excalidraw.md`),
      '---\nboard: café\nvariant: current\n---\n\n# Excalidraw Data\n\n%%\n## Drawing\n```json\n{"type":"excalidraw","version":2,"elements":[],"appState":{}}\n```\n%%\n');
    check('a decomposed filename is found by its composed spelling',
      vaultPathFor(parseBoardKey(nfc), scratch) === path.join(scratch, `${nfd}.excalidraw.md`));

    // A case-sensitive filesystem will hold both spellings, so a vault
    // authored on Linux before this rule can arrive holding two notes at one
    // address. Only one is reachable, and that is a thing to be told.
    fs.writeFileSync(path.join(scratch, 'payments.excalidraw.md'),
      '---\nboard: payments\nvariant: current\n---\n\n# Excalidraw Data\n\n%%\n## Drawing\n```json\n{"type":"excalidraw","version":2,"elements":[],"appState":{}}\n```\n%%\n');
    const listed = listBoards(scratch);
    check('two notes at one address are both listed', listed.filter(b => b.key === 'payments').length === 2);
    check('  and each one names the others it collides with',
      listed.filter(b => b.key === 'payments').every(b => b.collidesWith?.length === 1));
    check('  and which one is reachable does not depend on readdir order',
      vaultPathFor(parseBoardKey('payments'), scratch) === vaultPathFor(parseBoardKey('PAYMENTS'), scratch));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

{
  let refused = null;
  try { resolveBoard(undefined, 'Adding an element'); } catch (error) { refused = error; }
  check('a call that names no board is refused', refused instanceof BoardRequiredError);
  check('  and the refusal says nothing was done', /Nothing was done/.test(refused?.message ?? ''));
  check('  and says how to name one', /--board <key>/.test(refused?.message ?? ''));
  check('  and lists what is open, so the next step is on screen',
    (refused?.open ?? []).includes(SCRATCH_KEY));
  check('  and it is a client error, not a server fault', refused?.status === 400);

  check('the scratch board exists from boot, so a first run has something to name',
    openBoardKeys().includes('scratch'));
  check('naming it works', resolveBoard('scratch').key === 'scratch');

  let unopened = null;
  try { resolveBoard('nope'); } catch (error) { unopened = error; }
  check('a board that is not open is a different refusal', /is not open/.test(unopened?.message ?? ''));
  check('  which also lists what is', /Open right now/.test(unopened?.message ?? ''));
}

// A branch shares no element objects with the board it came from (TASK-042).
//
// `board save --as` used to put the source's own objects into the branch's
// map, so two boards held one set of elements behind two names. Nothing ever
// failed, because every path that changes an element replaces the object
// rather than editing it — an invariant nobody wrote down and nothing
// enforced. So this mutates in place, which is exactly what that invariant was
// holding back, and it is the one way to tell a copy from a shared reference.
//
// In process, against the real store, because object identity is not something
// HTTP can show. `replaceBoardElements` is the only way a branch's map is
// filled: POST /api/boards/save calls it and nothing else writes across
// boards.
{
  const source = getOrCreateBoard(makeIdentity({ board: 'branch-sharing', level: 'service' }), true).board;
  const original = {
    id: 'e1', type: 'rectangle', x: 0, y: 0, width: 160, height: 80,
    customData: { archboard: { node: 'api', kind: 'gateway', variant: 'current' } },
    boundElements: [{ id: 'lbl', type: 'text' }],
    groupIds: ['g1']
  };
  source.elements.set(original.id, original);

  const branch = getOrCreateBoard(
    makeIdentity({ board: 'branch-sharing', variant: 'option-a', level: 'service' }), true
  ).board;
  replaceBoardElements(branch, Array.from(source.elements.values()));
  const copy = branch.elements.get('e1');

  check('a branch holds its own element objects', copy !== original);
  check('  and its own nested ones, which is where the meaning is',
    copy.customData !== original.customData &&
    copy.customData.archboard !== original.customData.archboard &&
    copy.boundElements !== original.boundElements &&
    copy.groupIds !== original.groupIds);
  check('  holding the same content, so nothing was lost in the copy',
    JSON.stringify(copy) === JSON.stringify(original));

  copy.x = 999;
  copy.customData.archboard.kind = 'datastore';
  copy.boundElements.push({ id: 'extra', type: 'arrow' });
  copy.groupIds.push('g2');
  check('mutating an element on the branch in place leaves the source alone',
    original.x === 0 &&
    original.customData.archboard.kind === 'gateway' &&
    original.boundElements.length === 1 &&
    original.groupIds.length === 1,
    JSON.stringify(original));

  boardStore.delete('branch-sharing');
  boardStore.delete('branch-sharing@option-a');
}

// A snapshot shares no element objects with the board it was taken from
// (TASK-048). The same hazard as the branch above, one route along: POST
// /api/snapshots built its Snapshot from `Array.from(board.elements.values())`,
// so editing the board in place would have edited the snapshot taken to
// protect against exactly that.
//
// The route, not just the helper. The express app is imported rather than
// spawned so that it shares this process's board store, which is the only way
// object identity is visible at all — over HTTP everything is serialised and a
// shared reference looks exactly like a copy. It listens on an ephemeral port
// of its own and is closed again, so it never meets the spawned server below.
{
  const { default: app } = await import(src('server.ts'));
  const { snapshots } = await import(src('types.ts'));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  const at = `http://127.0.0.1:${listener.address().port}`;

  const live = getOrCreateBoard(makeIdentity({ board: 'snapshot-sharing', level: 'service' }), true).board;
  const onTheBoard = {
    id: 's1', type: 'rectangle', x: 0, y: 0, width: 160, height: 80,
    customData: { archboard: { node: 'api', kind: 'gateway', variant: 'current' } },
    boundElements: [{ id: 'lbl', type: 'text' }],
    groupIds: ['g1']
  };
  live.elements.set(onTheBoard.id, onTheBoard);

  const taken = await fetch(`${at}/api/snapshots?board=snapshot-sharing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'before-the-split' })
  });
  check('a snapshot can be taken of a board', taken.status === 200, String(taken.status));

  const kept = snapshots.get('before-the-split')?.elements?.[0];
  check('  and it holds its own element object, not the board\'s',
    Boolean(kept) && kept !== onTheBoard);
  check('  and its own nested ones, which is where the meaning is',
    kept.customData !== onTheBoard.customData &&
    kept.customData.archboard !== onTheBoard.customData.archboard &&
    kept.boundElements !== onTheBoard.boundElements &&
    kept.boundElements[0] !== onTheBoard.boundElements[0] &&
    kept.groupIds !== onTheBoard.groupIds);
  check('  holding the same content, so nothing was lost in the copy',
    JSON.stringify(kept) === JSON.stringify(onTheBoard));

  // The edit a snapshot exists to survive, made the way nothing in the server
  // makes it: in place. That is the invariant this replaces.
  onTheBoard.x = 999;
  onTheBoard.customData.archboard.kind = 'datastore';
  onTheBoard.boundElements.push({ id: 'extra', type: 'arrow' });
  onTheBoard.groupIds.push('g2');

  check('mutating the board in place after snapshotting leaves the snapshot unchanged',
    kept.x === 0 &&
    kept.customData.archboard.kind === 'gateway' &&
    kept.boundElements.length === 1 &&
    kept.groupIds.length === 1,
    JSON.stringify(kept));

  snapshots.delete('before-the-split');
  boardStore.delete('snapshot-sharing');
  await new Promise(resolve => listener.close(resolve));
}

// Pane addressing shares its reading order with the report, so "right" cannot
// mean one pane to `--pane` and another to `panes`.
{
  const pane = (clientId, x, board, extra = {}) => ({
    clientId, paneId: clientId, board, primary: x === 0, focused: false,
    elementCount: 0, rect: { x, y: 0, width: 640, height: 800 },
    viewport: { x: 0, y: 0, width: 640, height: 800, zoom: 1 },
    at: new Date().toISOString(), ...extra
  });
  const two = [pane('b', 640, 'payments@option-a'), pane('a', 0, 'payments')];

  check('panes are ordered left to right, whatever order they registered in',
    panesInOrder(two).map(entry => entry.pane.clientId).join(',') === 'a,b');
  check('--pane left is the left one', resolvePaneSpec(two, 'left').clientId === 'a');
  check('--pane right is the right one', resolvePaneSpec(two, 'right').clientId === 'b');
  check('--pane 2 is the second in reading order', resolvePaneSpec(two, '2').clientId === 'b');
  check('--pane primary is the one that answers for the browser',
    resolvePaneSpec(two, 'primary').clientId === 'a');

  let unknown = null;
  try { resolvePaneSpec(two, 'middle'); } catch (error) { unknown = error; }
  check('an unknown pane is refused, and the message lists the real ones',
    /No pane called "middle"/.test(unknown?.message ?? '') && /payments@option-a/.test(unknown?.message ?? ''));
  check('  and with the screen full it does not offer to make another',
    !/pane open/.test(unknown?.message ?? ''));

  let missing = null;
  try { resolvePaneSpec([two[1]], 'right'); } catch (error) { missing = error; }
  check('a pane that could exist but does not says how to make it (TASK-033)',
    /archboard pane open/.test(missing?.message ?? ''), missing?.message);
  check('two panes is what the shell lays out', MAX_PANES === 2);

  // A node takes its board's variant and NOT its board's level (ADR 0013).
  // The two look alike and are not: a node cannot belong to another variant,
  // but it can sit at another tier, and `describe` shows a level only when a
  // board's nodes carry more than one. Defaulting it would stamp every node
  // the same and silence that.
  {
    const shape = { id: 's', type: 'rectangle', x: 0, y: 0, width: 200, height: 100, label: { text: 'Payments' } };
    const plan = planPromotion({
      targets: [shape], board: [shape], kind: 'service',
      boardVariant: 'option-a'
    });
    const stamped = plan.nodes[0]?.customData?.archboard ?? plan.updates?.[0]?.customData?.archboard ?? {};
    check('a promoted node takes its board\'s variant', stamped.variant === 'option-a', JSON.stringify(stamped));
    check('  and no level, because none was asked for (ADR 0013)',
      stamped.level === undefined, `level=${stamped.level}`);

    const withLevel = planPromotion({
      targets: [shape], board: [shape], kind: 'service',
      boardVariant: 'option-a', level: 'service'
    });
    const explicit = withLevel.nodes[0]?.customData?.archboard ?? withLevel.updates?.[0]?.customData?.archboard ?? {};
    check('  and records one when the caller says the node differs from its board',
      explicit.level === 'service', `level=${explicit.level}`);
  }


  // One list of spellings, in four places: matchesSpec accepts them, PANE_SPECS
  // names them in every refusal, run.ts teaches them, and the skill repeats
  // them. They drifted once already, so this asserts they agree (TASK-050).
  {
    const panesSrc = fs.readFileSync(path.join(repoRoot, 'src/core/panes.ts'), 'utf8');
    const specs = (panesSrc.match(/const PANE_SPECS = '([^']+)'/) ?? [])[1] ?? '';
    const named = ['left', 'right', 'top', 'bottom', 'focused', 'primary'];
    check('every documented pane spec is named in the refusal text',
      named.every(word => specs.includes(word)), specs);

    const runSrc = fs.readFileSync(path.join(repoRoot, 'src/cli/run.ts'), 'utf8');
    check('  and the CLI help teaches the same ones',
      named.every(word => runSrc.includes(word)));

    // `only` was accepted and taught nowhere. It matched just when one pane was
    // open, which is exactly when --pane can be left off, so it was never the
    // only way to say anything.
    let gone = null;
    try { resolvePaneSpec([two[1]], 'only'); } catch (error) { gone = error; }
    check('  and a spelling nobody documents is refused rather than quietly working',
      /No pane called "only"/.test(gone?.message ?? ''), gone?.message ?? 'it resolved');
    check('  with the refusal naming what does work',
      named.some(word => (gone?.message ?? '').includes(word)));
  }


  check('with one pane, no pane needs naming', soloPane([two[1]]).clientId === 'a');
  check('with no pane, a board can be loaded without being shown', soloPane([]) === null);
  let ambiguous = null;
  try { soloPane(two); } catch (error) { ambiguous = error; }
  check('with two panes, which one is not guessed at',
    /needs a pane as well as a board/.test(ambiguous?.message ?? ''));
}

// ---------------------------------------------------------------------------
// The canvas, with two panes on it
// ---------------------------------------------------------------------------

// A free-ish port per run, so several checkouts can run this concurrently.
// A fixed port made every agent working on this repo serialise on it.
const PORT = Number(process.env.PORT || 33000 + Math.floor(Math.random() * 2000));
const base = `http://127.0.0.1:${PORT}`;
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-boards-'));

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

// The shell, in miniature.
//
// Pane layout lives in the browser, so `pane open` is a request the canvas
// makes of whatever is rendering it. Answering it means mounting another pane,
// which here is another socket and another registration — exactly what the
// real shell produces, minus the pixels. Without this the harness could test
// the refusals and nothing else.
const shell = { panes: [] };
let paneSerial = 0;

/** A pane: a socket, a registration, and a note of everything it was sent. */
async function openPane(clientId, x, { primary = false, focused = false } = {}) {
  const socket = new WebSocket(`ws://127.0.0.1:${PORT}/?clientId=${clientId}`);
  const seen = [];
  let pane;
  socket.on('message', data => {
    const message = JSON.parse(data.toString());
    seen.push(message);
    // What a browser does with each of these, in one line apiece.
    if (message.type === 'pane_open') void shellOpen();
    else if (message.type === 'pane_close') void shellClose(pane);
    else if (message.type === 'set_viewport') {
      void api('POST', '/api/viewport/result', { requestId: message.requestId, success: true });
    }
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  await sleep(80);
  const registration = {
    clientId, paneId: clientId, primary, focused, elementCount: 0,
    rect: { x, y: 0, width: 640, height: 800 },
    viewport: { x: 0, y: 0, width: 640, height: 800, zoom: 1 }
  };
  // The board a pane reports is the one it was told to hold, which is what a
  // browser does after it adopts a board_switched.
  const adopt = key => api('POST', '/api/panes', { ...registration, board: key });
  const board = () => [...seen].reverse().find(m => m.type === 'initial_elements' || m.type === 'board_switched')?.board;
  await adopt(board());
  pane = { clientId, socket, seen, adopt, board, registration, since: () => seen.length };
  shell.panes.push(pane);
  return pane;
}

/** Another pane, to the right of what is already there. */
async function shellOpen() {
  return openPane(`p-shell-${++paneSerial}`, shell.panes.length * 640);
}

/** One pane gone: the socket closes, and the server retires it on the close. */
async function shellClose(pane) {
  shell.panes = shell.panes.filter(entry => entry !== pane);
  pane.socket.close();
}

try {
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/health`); break; } catch { await sleep(100); }
  }

  // Two boards to compare, made before anything is on screen — which is
  // allowed, and reported as such.
  const madeCurrent = await api('POST', '/api/boards/new', { board: 'payments', level: 'system' });
  check('a board can be started with no pane open', madeCurrent.status === 200);
  check('  and it says nothing is showing it', madeCurrent.body?.pane === null);
  await api('POST', '/api/boards/new', { board: 'payments@option-a', level: 'system' });

  const left = await openPane('p-left', 0, { primary: true, focused: true });
  check('a fresh pane holds the scratch board, so there is something to name',
    left.board() === 'scratch');

  const opened = await api('POST', '/api/boards/open', { board: 'payments' });
  check('with one pane, a board opens into it without being told which',
    opened.status === 200 && opened.body?.pane?.place === 'the only pane');
  await sleep(60);
  await left.adopt('payments');
  check('  and the pane was told', left.board() === 'payments');

  const right = await openPane('p-right', 640);
  check('a second pane starts on what the first is showing', right.board() === 'payments');

  // --- addressing --------------------------------------------------------

  const unaddressed = await api('POST', '/api/boards/open', { board: 'payments@option-a' });
  check('with two panes, opening a board without naming one is refused',
    unaddressed.status === 400, `got ${unaddressed.status}`);
  check('  and the message names the panes', /--pane left \| right/.test(unaddressed.body?.error ?? ''));

  // A refusal has to mean nothing happened, and it has to name the obstacle
  // the caller cannot see for themselves (TASK-055). Starting a board with two
  // panes up is refused on the pane, so the board must not exist afterwards;
  // and a name that is already taken has to be reported as that, rather than
  // sending the caller off to add a --pane and meet a second, different
  // refusal with nothing having said the board was there all along.
  const unaddressedNew = await api('POST', '/api/boards/new', { board: 'never-made', level: 'service' });
  check('with two panes, starting a board without naming one is refused as well',
    unaddressedNew.status === 400, `got ${unaddressedNew.status}`);
  const afterRefusal = await api('GET', '/api/boards');
  check('  and the board it refused to start does not exist',
    !(afterRefusal.body?.open ?? []).some(entry => entry.key === 'never-made'),
    (afterRefusal.body?.open ?? []).map(entry => entry.key).join(','));
  check('  and no note was written for it either',
    !fs.existsSync(path.join(vault, 'never-made.excalidraw.md')));

  const takenName = await api('POST', '/api/boards/new', { board: 'payments' });
  check('a name already taken is reported as taken, whatever the panes are doing',
    takenName.status === 409 && /already open/.test(takenName.body?.error ?? ''),
    takenName.body?.error);
  const openMissing = await api('POST', '/api/boards/open', { board: 'never-made' });
  check('and a board that is nowhere says so, rather than asking which pane to put it in',
    openMissing.status === 404 && /No board "never-made"/.test(openMissing.body?.error ?? ''),
    openMissing.body?.error);

  const leftBefore = left.since();
  const intoRight = await api('POST', '/api/boards/open', { board: 'payments@option-a', pane: 'right' });
  check('naming a pane opens the board there', intoRight.status === 200);
  check('  and the answer says where it went', intoRight.body?.pane?.place === 'right');
  await sleep(120);
  await right.adopt('payments@option-a');

  check('the switch reached the pane it was addressed to',
    right.seen.some(m => m.type === 'board_switched' && m.board === 'payments@option-a'));
  check('and reached no other pane',
    left.seen.slice(leftBefore).every(m => m.type !== 'board_switched'),
    JSON.stringify(left.seen.slice(leftBefore).map(m => m.type)));

  const panes = await api('GET', '/api/panes');
  check('panes reports two different boards', panes.body?.sameBoard === false);
  check('  naming both', panes.body?.panes?.map(p => p.board).join(',') === 'payments,payments@option-a');
  check('  and drops the line saying the server holds one board at a time',
    !/one board at a time/.test(panes.body?.text ?? ''));
  check('  and says what an unnamed call will do instead',
    /refused until one is named/.test(panes.body?.text ?? ''));

  // --- authority ---------------------------------------------------------

  const rect = { type: 'rectangle', x: 10, y: 10, width: 100, height: 60 };
  const unqualified = await api('POST', '/api/elements', rect);
  check('an element with no board is refused', unqualified.status === 400);
  check('  with a code a caller can act on', unqualified.body?.code === 'BOARD_REQUIRED');
  check('  and the open boards as data', Array.isArray(unqualified.body?.open));

  const before = await api('GET', '/api/elements?board=payments');
  const qualified = await api('POST', '/api/elements?board=payments@option-a', rect);
  check('the same element with a board lands', qualified.status === 201 || qualified.status === 200);
  const after = await api('GET', '/api/elements?board=payments');
  check('  on that board and no other',
    after.body?.count === before.body?.count,
    `payments went ${before.body?.count} -> ${after.body?.count}`);
  const other = await api('GET', '/api/elements?board=payments@option-a');
  check('  which now holds it', other.body?.count === 1);

  const refusedClear = await api('DELETE', '/api/elements/clear');
  check('clearing without a board is refused too — the dangerous one most of all',
    refusedClear.status === 400);
  const stillThere = await api('GET', '/api/elements?board=payments@option-a');
  check('  and nothing was cleared', stillThere.body?.count === 1);

  // --- per-pane selection ------------------------------------------------

  const elementId = other.body?.elements?.[0]?.id;
  await api('POST', '/api/selection', { elementIds: [elementId], clientId: 'p-right' });
  await api('POST', '/api/panes', {
    clientId: 'p-left', paneId: 'p-left', board: 'payments', primary: true, focused: true,
    elementCount: 0, rect: { x: 0, y: 0, width: 640, height: 800 },
    viewport: { x: 0, y: 0, width: 640, height: 800, zoom: 1 }
  });
  const withPick = await api('GET', '/api/panes');
  check('a pick belongs to the pane that made it',
    withPick.body?.panes?.find(p => p.paneId === 'p-right')?.selection?.count === 1);
  check('  and not to the other one',
    withPick.body?.panes?.find(p => p.paneId === 'p-left')?.selection?.count === 0);

  await api('DELETE', '/api/elements/clear?board=payments');
  const afterClear = await api('GET', '/api/panes');
  check('clearing one board leaves the other pane\'s pick alone',
    afterClear.body?.panes?.find(p => p.paneId === 'p-right')?.selection?.count === 1);

  // --- two boards, two baselines -----------------------------------------

  const savedA = await api('POST', '/api/boards/save?board=payments@option-a');
  check('each board saves to its own note', savedA.status === 200);
  const savedCurrent = await api('POST', '/api/boards/save?board=payments');
  check('  and so does the other, from the same canvas', savedCurrent.status === 200);
  check('  to different files', savedA.body?.file !== savedCurrent.body?.file);

  fs.writeFileSync(savedA.body.file, fs.readFileSync(savedA.body.file, 'utf-8') + '\nedited elsewhere\n');
  const refusedSave = await api('POST', '/api/boards/save?board=payments@option-a');
  check('a note that changed underneath is still refused, per board (ADR 0006)',
    refusedSave.status === 409);
  const otherStillSaves = await api('POST', '/api/boards/save?board=payments');
  check('  and the other board\'s baseline is untouched by that', otherStillSaves.status === 200);

  const noBoardSave = await api('POST', '/api/boards/save', {});
  check('saving without naming a board is refused', noBoardSave.status === 400);

  // --- a pane leaving ----------------------------------------------------

  right.socket.close();
  await sleep(200);
  const alone = await api('GET', '/api/panes');
  check('a closed pane leaves no ghost', alone.body?.paneCount === 1);
  check('  and the pane still open keeps its own board',
    alone.body?.panes?.[0]?.board === 'payments');

  // --- making and unmaking panes (TASK-033) ------------------------------
  //
  // One pane is on screen at this point, holding `payments`. Everything below
  // is what a thread that cannot click has to be able to do instead.

  const lonely = await api('GET', '/api/panes');
  check('with one pane, the report says how to get a second',
    /archboard pane open/.test(lonely.body?.text ?? ''), lonely.body?.text);

  const noSuchPane = await api('POST', '/api/boards/open', { board: 'payments@option-a', pane: 'right' });
  check('opening into a pane that does not exist is still refused', noSuchPane.status === 400);
  check('  and the refusal now says how to make it, not just that it is missing',
    /archboard pane open/.test(noSuchPane.body?.error ?? ''), noSuchPane.body?.error);

  const closingTheLast = await api('POST', '/api/panes/close', { pane: '1' });
  check('the only pane cannot be closed', closingTheLast.status === 409);
  check('  and the refusal says the board is unaffected either way',
    /board is unaffected/.test(closingTheLast.body?.error ?? ''));

  const leftBeforeSplit = left.since();
  const split = await api('POST', '/api/panes/open');
  check('a pane can be opened with no browser interaction', split.status === 200, split.body?.error);
  check('  and the answer says where it landed', split.body?.pane?.place === 'right', JSON.stringify(split.body?.pane));
  check('  and there are two panes now', split.body?.paneCount === 2);
  const second = shell.panes.find(entry => entry.clientId === split.body?.pane?.clientId);
  check('  the new pane is a real registration, not a promise', Boolean(second));
  check('  it starts on what was already on screen', second?.board() === 'payments');
  check('  and the pane the human was reading was not touched',
    left.seen.slice(leftBeforeSplit).every(m => m.type !== 'board_switched'),
    JSON.stringify(left.seen.slice(leftBeforeSplit).map(m => m.type)));

  const intoTheNewOne = await api('POST', '/api/boards/open', { board: 'payments@option-a', pane: 'right' });
  check('the board an agent wanted beside the current one opens into it',
    intoTheNewOne.status === 200 && intoTheNewOne.body?.pane?.place === 'right');
  await sleep(120);
  await second.adopt('payments@option-a');
  check('  so the two variants are side by side',
    (await api('GET', '/api/panes')).body?.sameBoard === false);

  const full = await api('POST', '/api/panes/open');
  check('a third pane is refused, because the shell lays out two', full.status === 409);
  check('  and the refusal names what is on screen and what to do instead',
    /payments@option-a/.test(full.body?.error ?? '') && /pane close/.test(full.body?.error ?? ''),
    full.body?.error);

  const unnamed = await api('POST', '/api/panes/close', {});
  check('closing a pane without saying which is refused', unnamed.status === 400);
  check('  and the refusal spells out both options',
    /pane close left/.test(unnamed.body?.error ?? '') && /pane close right/.test(unnamed.body?.error ?? ''),
    unnamed.body?.error);

  // --- addressing the browser at a pane ----------------------------------

  const leftBeforeCamera = left.since();
  const secondBeforeCamera = second.since();
  const camera = await api('POST', '/api/viewport', { scrollToContent: true, pane: 'right' });
  check('the camera can be pointed at the second pane', camera.status === 200, camera.body?.error);
  check('  and it moved there', second.seen.slice(secondBeforeCamera).some(m => m.type === 'set_viewport'));
  check('  and nowhere else', left.seen.slice(leftBeforeCamera).every(m => m.type !== 'set_viewport'));

  const badCamera = await api('POST', '/api/viewport', { scrollToContent: true, pane: 'middle' });
  check('a camera aimed at no pane is refused rather than sent somewhere',
    badCamera.status === 400 && /No pane called "middle"/.test(badCamera.body?.error ?? ''));

  const leftBeforePicture = left.since();
  const secondBeforePicture = second.since();
  const picture = api('POST', '/api/export/image', { format: 'png', pane: 'right' });
  await sleep(1400);
  check('a picture can be taken of the second pane',
    second.seen.slice(secondBeforePicture).some(m => m.type === 'export_image_request'));
  check('  and the first pane is not the one photographed',
    left.seen.slice(leftBeforePicture).every(m => m.type !== 'export_image_request'));
  await api('POST', '/api/export/image/result', {
    requestId: second.seen.slice(secondBeforePicture).find(m => m.type === 'export_image_request')?.requestId,
    format: 'png',
    data: 'aGk='
  });
  check('  and the picture comes back', (await picture).status === 200);

  // --- mermaid converts where its board is (TASK-046) --------------------
  //
  // Unlike the camera, mermaid takes no pane, and must not. It already names a
  // board and a board is in at most one pane, so a --pane would be a second
  // way to say the same thing and a way to say two different things. What is
  // being proved is that a proposal can be drawn into the right-hand pane
  // without the current architecture being taken off the left to make room.

  const diagram = { mermaidDiagram: 'graph TD; A[Client] --> B[API];' };
  const leftBeforeDiagram = left.since();
  const secondBeforeDiagram = second.since();
  const intoTheRight = await api('POST', '/api/elements/from-mermaid?board=payments@option-a', diagram);
  check('mermaid converts in the pane holding the board it was given',
    intoTheRight.status === 200, intoTheRight.body?.error);
  check('  which here is the right one, and no --pane was passed or exists',
    intoTheRight.body?.pane?.place === 'right', JSON.stringify(intoTheRight.body?.pane));
  check('  and that is not the pane that answers for the browser',
    second.registration.primary !== true);
  const arrived = second.seen.slice(secondBeforeDiagram).find(m => m.type === 'mermaid_convert');
  check('  the diagram reached it', Boolean(arrived));
  check('  carrying the board that was asked for',
    arrived?.board === 'payments@option-a', arrived?.board);
  check('  and the pane holding the current architecture was left alone',
    left.seen.slice(leftBeforeDiagram).every(m => m.type !== 'mermaid_convert'));

  // The other way round, so this cannot be passing by always picking the right.
  const leftBeforeOther = left.since();
  const secondBeforeOther = second.since();
  const intoTheLeft = await api('POST', '/api/elements/from-mermaid?board=payments', diagram);
  check('and the board in the left pane converts there',
    intoTheLeft.status === 200 && intoTheLeft.body?.pane?.place === 'left',
    JSON.stringify(intoTheLeft.body?.pane));
  check('  reaching the left pane',
    left.seen.slice(leftBeforeOther).some(m => m.type === 'mermaid_convert'));
  check('  and not the right one',
    second.seen.slice(secondBeforeOther).every(m => m.type !== 'mermaid_convert'));

  // Open, but on no pane. Conversion runs in a canvas, so there is nowhere for
  // it to happen, and the refusal has to say how to get the board on screen.
  const leftBeforeOffScreen = left.since();
  const secondBeforeOffScreen = second.since();
  const notShowing = await api('POST', '/api/elements/from-mermaid?board=scratch', diagram);
  check('a board no pane is holding is refused, not converted somewhere else',
    notShowing.status === 409, JSON.stringify(notShowing.body));
  check('  with nothing sent to either pane',
    left.seen.slice(leftBeforeOffScreen).every(m => m.type !== 'mermaid_convert') &&
    second.seen.slice(secondBeforeOffScreen).every(m => m.type !== 'mermaid_convert'));
  check('  and the refusal lists the panes and what each is holding',
    /left \(payments\)/.test(notShowing.body?.error ?? '') &&
    /right \(payments@option-a\)/.test(notShowing.body?.error ?? ''),
    notShowing.body?.error);
  check('  and with the screen full it says which pane to repoint',
    /board open scratch --pane <left\|right>/.test(notShowing.body?.error ?? ''),
    notShowing.body?.error);

  // --- unmaking one ------------------------------------------------------

  const unsplit = await api('POST', '/api/panes/close', { pane: 'right' });
  check('a named pane can be closed', unsplit.status === 200, unsplit.body?.error);
  check('  and the answer says which one went', unsplit.body?.closed?.place === 'right');
  check('  leaving one pane', unsplit.body?.paneCount === 1);
  const survivor = await api('GET', '/api/panes');
  check('  which is the one that was not named', survivor.body?.panes?.[0]?.paneId === 'p-left');
  const orphan = await api('GET', '/api/boards');
  check('  and the board it was showing is still open, just not on screen',
    orphan.body?.open?.some(entry => entry.key === 'payments@option-a'));

  // Same refusal, one pane fewer, and now there is room for another. So it
  // offers the command that makes one rather than the one that overwrites the
  // pane the human is reading.
  const roomForOne = await api('POST', '/api/elements/from-mermaid?board=payments@option-a', diagram);
  check('the board just taken off screen can no longer be converted into',
    roomForOne.status === 409, JSON.stringify(roomForOne.body));
  check('  and with room on the glass it offers a new pane, not a repointed one',
    /archboard pane open --board payments@option-a/.test(roomForOne.body?.error ?? '') &&
    !/board open/.test(roomForOne.body?.error ?? ''),
    roomForOne.body?.error);

  left.socket.close();
  await sleep(200);

  // --- with nothing on screen --------------------------------------------

  const headlessOpen = await api('POST', '/api/panes/open');
  check('with no browser, a pane cannot be invented', headlessOpen.status === 503);
  check('  and the caller is told which kind of problem it is',
    headlessOpen.body?.code === 'BROWSER_REQUIRED');
  const headlessClose = await api('POST', '/api/panes/close', { pane: 'left' });
  check('closing one says the same', headlessClose.body?.code === 'BROWSER_REQUIRED');
  const headlessCamera = await api('POST', '/api/viewport', { scrollToContent: true });
  check('and so does the camera', headlessCamera.body?.code === 'BROWSER_REQUIRED');
  const headlessPicture = await api('POST', '/api/export/image', { format: 'png' });
  check('and so does a picture', headlessPicture.body?.code === 'BROWSER_REQUIRED');
  const headlessMermaid = await api('POST', '/api/elements/from-mermaid?board=payments', diagram);
  check('and so does mermaid, which has no pane to convert in either',
    headlessMermaid.body?.code === 'BROWSER_REQUIRED', JSON.stringify(headlessMermaid.body));

  // The exit code is the part a script reads, so it is checked through the CLI
  // rather than inferred from the status.
  const cli = (args) => new Promise(resolve => {
    const child = spawn(process.execPath, [src('bin.ts'), ...args], {
      env: {
        ...process.env,
        EXPRESS_SERVER_URL: base,
        EXCALIDRAW_NO_AUTOSTART: '1',
        ARCHBOARD_VAULT: vault,
        LOG_LEVEL: 'error'
      },
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('exit', code => resolve({ code, stderr }));
  });

  for (const args of [['pane', 'open'], ['pane', 'close', 'right'], ['viewport', '--fit'], ['screenshot']]) {
    const run = await cli(args);
    check(`\`${args.join(' ')}\` exits 4 when no browser is open`, run.code === 4, `exit ${run.code}`);
    check('  saying so in words', /browser/i.test(run.stderr), run.stderr.trim());
  }

  await sleep(100);

  // --- branching a proposal, then diffing it (TASK-035) -------------------
  //
  // `save --as` is how a proposal starts, so the diff between a board and the
  // branch taken off it has to read as "here is the one thing that changed".
  // It used to read as "every node changed", because the copy still recorded
  // the variant each node was promoted under.

  const promoted = (node, label, x, kind) => ({
    type: 'rectangle', x, y: 400, width: 160, height: 80,
    label: { text: label },
    customData: { archboard: { node, kind, variant: 'current' } }
  });

  await api('POST', '/api/boards/new', { board: 'ledger', level: 'service' });
  const ledgerIds = [];
  for (const spec of [['api', 'API', 0, 'gateway'], ['worker', 'Worker', 300, 'service'], ['store', 'Store', 600, 'datastore']]) {
    const made = await api('POST', '/api/elements?board=ledger', promoted(...spec));
    ledgerIds.push(made.body?.element?.id ?? made.body?.id);
  }
  await api('POST', '/api/boards/save?board=ledger');

  const branched = await api('POST', '/api/boards/save?board=ledger', { name: 'ledger', variant: 'option-a' });
  check('save --as branches the board', branched.status === 200 && branched.body?.board === 'ledger@option-a');

  const onBranch = await api('GET', '/api/elements?board=ledger@option-a');
  const branchVariants = (onBranch.body?.elements ?? []).map(el => el.customData?.archboard?.variant);
  check('  and every node on the copy records the variant it was saved as',
    branchVariants.length === 3 && branchVariants.every(v => v === 'option-a'),
    branchVariants.join(','));

  const onOrigin = await api('GET', '/api/elements?board=ledger');
  check('  while the board it was branched from is untouched',
    (onOrigin.body?.elements ?? []).every(el => el.customData?.archboard?.variant === 'current'));

  const branchNote = fs.readFileSync(branched.body.file, 'utf-8');
  check('  including in the note on disk, which is what compare reads',
    !/"variant"\s*:\s*"current"/.test(branchNote) && /"variant"\s*:\s*"option-a"/.test(branchNote));

  // A branch is the same subject at the same abstraction tier, and level is
  // board identity from a vocabulary the project grew on purpose. `--variant`
  // always carried it; `--as` built a fresh identity and dropped it, so a
  // proposal sat at no level while its source sat at service (TASK-039).
  check('  and the branch is at the level its source was at',
    branched.body?.identity?.level === 'service', JSON.stringify(branched.body?.identity));
  check('  including in the note, which is where identity is recorded',
    /^level: service$/m.test(branchNote));
  const levelled = await api('POST', '/api/boards/save?board=ledger', { name: 'ledger@option-d', level: 'module' });
  check('  while a level the caller states still wins over the source\'s',
    levelled.body?.identity?.level === 'module', JSON.stringify(levelled.body?.identity));

  await api('DELETE', `/api/elements/${ledgerIds[1]}?board=ledger@option-a`);
  await api('POST', '/api/boards/save?board=ledger@option-a');
  const diff = await api('GET', '/api/boards/compare?from=ledger&to=ledger@option-a');
  check('the diff reports the one node the human removed',
    diff.body?.summary?.nodesRemoved === 1 && diff.body?.nodes?.removed?.[0]?.node === 'worker');
  check('  and nothing else as changed', diff.body?.summary?.nodesChanged === 0,
    JSON.stringify(diff.body?.nodes?.changed?.map(c => c.changes) ?? []));
  check('  and the nodes nobody touched as unchanged', diff.body?.summary?.nodesUnchanged === 2);
  check('  with no stale-variant warning to explain away',
    !(diff.body?.warnings ?? []).some(w => /different variant/.test(w)));

  // The check is still worth having: a node pasted onto a board that was never
  // branched keeps the variant it came from, and that is worth saying.
  await api('POST', '/api/boards/new', { board: 'billing', level: 'service' });
  await api('POST', '/api/boards/new', { board: 'billing@option-b', level: 'service' });
  await api('POST', '/api/elements?board=billing', promoted('gw', 'Gateway', 0, 'gateway'));
  await api('POST', '/api/elements?board=billing@option-b', promoted('gw', 'Gateway', 0, 'gateway'));
  await api('POST', '/api/boards/save?board=billing');
  await api('POST', '/api/boards/save?board=billing@option-b');
  const copied = await api('GET', '/api/boards/compare?from=billing&to=billing@option-b');
  check('a node copied between boards without re-promotion still reports variantAnomaly',
    copied.body?.nodes?.changed?.[0]?.changes?.variantAnomaly?.to === 'current');
  check('  and still warns about it',
    (copied.body?.warnings ?? []).some(w => /different variant/.test(w)));

  // --- promoting on a variant board (TASK-040) ----------------------------
  //
  // The other route to the same wrong stamp. `promote` wrote the literal
  // 'current' whatever board it was called on, so a node promoted directly on
  // a proposal claimed to belong to the board it proposes against, and every
  // one of them came back from `compare` as a variantAnomaly. The skill taught
  // `--variant` to work around it; a fact about the board should not have to
  // be typed. Driven through the CLI, because the default lives at the surface
  // that knows which board was named.

  const boxOn = async (board, label, y) => {
    const made = await api('POST', `/api/elements?board=${encodeURIComponent(board)}`, {
      type: 'rectangle', x: 0, y, width: 200, height: 100, label: { text: label }
    });
    return made.body?.element?.id ?? made.body?.id;
  };
  const variantOf = async (board, id) => {
    const got = await api('GET', `/api/elements/${id}?board=${encodeURIComponent(board)}`);
    return got.body?.element?.customData?.archboard?.variant;
  };

  await api('POST', '/api/boards/new', { board: 'shipping', level: 'service' });
  await api('POST', '/api/boards/new', { board: 'shipping@option-a', level: 'service' });

  const onProposal = await boxOn('shipping@option-a', 'Rate Quoter', 800);
  const promotedThere = await cli(['promote', '--board', 'shipping@option-a', '--ids', onProposal, '--kind', 'service']);
  check('promoting on a variant board takes no --variant', promotedThere.code === 0, promotedThere.stderr.trim());
  check('  and stamps the variant of the board it was promoted on',
    await variantOf('shipping@option-a', onProposal) === 'option-a',
    await variantOf('shipping@option-a', onProposal));

  const onCurrent = await boxOn('shipping', 'Rate Quoter', 800);
  const promotedHere = await cli(['promote', '--board', 'shipping', '--ids', onCurrent, '--kind', 'service']);
  check('  and the same call on a current board still stamps current',
    promotedHere.code === 0 && await variantOf('shipping', onCurrent) === 'current',
    await variantOf('shipping', onCurrent));

  await api('POST', '/api/boards/save?board=shipping');
  await api('POST', '/api/boards/save?board=shipping@option-a');
  const promotedDiff = await api('GET', '/api/boards/compare?from=shipping&to=shipping@option-a');
  check('  so a node promoted on each board reports no variantAnomaly',
    promotedDiff.body?.summary?.nodesChanged === 0 && promotedDiff.body?.summary?.nodesUnchanged === 1,
    JSON.stringify(promotedDiff.body?.nodes?.changed?.map(c => c.changes) ?? []));
  check('  and no stale-variant warning either',
    !(promotedDiff.body?.warnings ?? []).some(w => /different variant/.test(w)),
    JSON.stringify(promotedDiff.body?.warnings ?? []));

  // The flag is still there for the promotion that really does mean another
  // variant, and it still wins.
  const overridden = await boxOn('shipping@option-a', 'Label Printer', 950);
  const promotedAs = await cli([
    'promote', '--board', 'shipping@option-a', '--ids', overridden,
    '--kind', 'service', '--variant', 'option-z'
  ]);
  check('  while --variant still overrides the board it is called on',
    promotedAs.code === 0 && await variantOf('shipping@option-a', overridden) === 'option-z',
    await variantOf('shipping@option-a', overridden));

  // --- a branch does not move a pane (TASK-039, ADR 0012) -----------------
  //
  // Branching is how a proposal starts, and a proposal exists to sit beside
  // the architecture it came from. A save that dragged the source's pane onto
  // the branch took current off screen at the exact moment it became worth
  // looking at, and the skill had to teach a line that put it back.

  const one = await openPane('p-one', 0, { primary: true, focused: true });
  const two = await openPane('p-two', 640);
  await api('POST', '/api/boards/open', { board: 'ledger', pane: 'left' });
  await sleep(80);
  await one.adopt('ledger');
  await api('POST', '/api/boards/open', { board: 'ledger@option-a', pane: 'right' });
  await sleep(80);
  await two.adopt('ledger@option-a');

  // An unpromoted element too, so the branch carries something `restampVariant`
  // returns untouched: those were the objects the two boards used to share
  // (TASK-042).
  await api('POST', '/api/elements?board=ledger', {
    type: 'text', x: 0, y: 600, width: 200, height: 24, text: 'a note to self'
  });

  const beforeBranch = one.since();
  const rebranch = await api('POST', '/api/boards/save?board=ledger', { variant: 'option-c' });
  await sleep(150);
  check('branching leaves the pane holding the source exactly where it was',
    one.board() === 'ledger', one.board());
  check('  and sends it nothing, so the scene in front of the human is untouched',
    one.seen.slice(beforeBranch).every(m => m.type !== 'board_switched'),
    JSON.stringify(one.seen.slice(beforeBranch).map(m => m.type)));
  check('  and leaves the other pane alone too', two.board() === 'ledger@option-a');
  check('  and says what it did, naming the pane it kept and moving none',
    rebranch.body?.saveKind === 'branch' &&
    rebranch.body?.panes?.moved?.length === 0 &&
    rebranch.body?.panes?.kept?.map(p => p.place).join(',') === 'left',
    JSON.stringify(rebranch.body?.panes));
  check('  and names the board it branched from', rebranch.body?.savedFrom === 'ledger');
  const offScreen = await api('GET', '/api/elements?board=ledger@option-c');
  check('  and the branch is a real board, just not one on screen', offScreen.body?.count === 4,
    `count ${offScreen.body?.count}`);
  check('  carrying the unpromoted element too, content and all',
    (offScreen.body?.elements ?? []).some(el => el.type === 'text' && el.text === 'a note to self'));

  // Having moved nothing, the answer has to say how the branch gets on screen,
  // and there are two ways with very different costs (TASK-054). `pane open`
  // makes a pane, so it cannot take a board off; `board open` replaces what a
  // pane is holding. Which one is right depends on there being room, which the
  // caller cannot see, so the save reports the whole screen.
  check('  and reports the screen it left alone, pane by pane',
    rebranch.body?.panes?.onScreen?.map(p => `${p.place}:${p.board}`).join(',')
      === 'left:ledger,right:ledger@option-a',
    JSON.stringify(rebranch.body?.panes?.onScreen));

  const branchedFull = await cli(['board', 'save', '--board', 'ledger', '--variant', 'option-f']);
  check('with the screen full, the branch answer offers board open',
    branchedFull.code === 0 && /board open ledger@option-f --pane left/.test(branchedFull.stderr),
    branchedFull.stderr.trim());
  check('  and says which board each pane would lose',
    /--pane left` replaces "ledger"/.test(branchedFull.stderr) &&
    /--pane right` replaces "ledger@option-a"/.test(branchedFull.stderr),
    branchedFull.stderr.trim());

  // The one save that does move a pane. Scratch is a placeholder, not a
  // subject: after it is named, the placeholder and the named board hold the
  // same drawing, so a pane left on scratch would show a copy of the board it
  // just made.
  await api('POST', '/api/boards/open', { board: 'scratch', pane: 'right' });
  await sleep(80);
  await two.adopt('scratch');
  await api('POST', '/api/elements?board=scratch', { type: 'rectangle', x: 0, y: 0, width: 40, height: 40 });
  const namedScratch = await api('POST', '/api/boards/save?board=scratch', { name: 'sketchbook', level: 'module' });
  await sleep(150);
  check('naming the scratch board takes its pane with it',
    namedScratch.body?.saveKind === 'named' && two.board() === 'sketchbook', two.board());
  check('  and the answer says which pane it moved',
    namedScratch.body?.panes?.moved?.map(p => p.place).join(',') === 'right',
    JSON.stringify(namedScratch.body?.panes));
  check('  while the pane on another board stays on it', one.board() === 'ledger');

  const inPlace = await api('POST', '/api/boards/save?board=ledger');
  check('a save back to a board\'s own note had no screen decision to report',
    inPlace.body?.saveKind === 'same-board' &&
    inPlace.body?.panes?.moved?.length === 0 && inPlace.body?.panes?.kept?.length === 0,
    JSON.stringify(inPlace.body?.panes));

  // One pane again, so there is room beside it. Now the offer has to be the
  // command that adds a pane: with one pane on screen, `board open <branch>`
  // lands in that pane and takes the source off, which is the very move ADR
  // 0012 stopped the save from making.
  two.socket.close();
  await sleep(200);
  const branchedRoom = await cli(['board', 'save', '--board', 'ledger', '--variant', 'option-g']);
  check('with room for another pane, the branch answer offers pane open --board',
    branchedRoom.code === 0 && /pane open --board ledger@option-g/.test(branchedRoom.stderr),
    branchedRoom.stderr.trim());
  check('  and never names the command that would take the source off screen',
    !/board open/.test(branchedRoom.stderr), branchedRoom.stderr.trim());
  check('  while still saying the source stayed put',
    /the only pane still holds "ledger"/.test(branchedRoom.stderr), branchedRoom.stderr.trim());

  one.socket.close();
  await sleep(200);

  // --- one board however it is spelled (TASK-032, ADR 0010) ---------------

  const madeMixed = await api('POST', '/api/boards/new', { board: 'CaseTest', level: 'service' });
  check('a board named with capitals is addressed in lower case',
    madeMixed.status === 200 && madeMixed.body?.board === 'casetest');
  check('  and keeps the casing it was named with', madeMixed.body?.identity?.displayName === 'CaseTest');
  check('  and its note is named that way too',
    path.basename(madeMixed.body?.file ?? '') === 'CaseTest.excalidraw.md');

  const otherSpelling = await api('POST', '/api/elements?board=casetest', {
    type: 'rectangle', x: 0, y: 0, width: 40, height: 40
  });
  check('the same board answers to another spelling of its name', otherSpelling.status === 201 || otherSpelling.status === 200);
  const spelledLoud = await api('GET', '/api/elements?board=CASETEST');
  check('  and to a third', spelledLoud.body?.count === 1);

  const savedMixed = await api('POST', '/api/boards/save?board=CaseTest');
  check('saving finds it under any spelling', savedMixed.status === 200);
  check('  and writes the one note, not a second one',
    fs.readdirSync(vault).filter(f => /^casetest\.excalidraw\.md$/i.test(f)).length === 1);
  check('  with the human\'s casing in the frontmatter',
    /^board: CaseTest$/m.test(fs.readFileSync(savedMixed.body.file, 'utf-8')));

  const collides = await api('POST', '/api/boards/new', { board: 'casetest', level: 'service' });
  check('a second board differing only in case is refused', collides.status === 409);
  check('  and the refusal says which board it means',
    /already open|already exists/.test(collides.body?.error ?? ''), collides.body?.error);

  // A note that appeared under a different casing while archboard was not
  // looking is the same board, so opening it reaches that file rather than
  // starting a second one beside it.
  fs.writeFileSync(path.join(vault, 'Handover.excalidraw.md'),
    '---\nboard: Handover\nvariant: current\n---\n\n# Excalidraw Data\n\n%%\n## Drawing\n```json\n{"type":"excalidraw","version":2,"elements":[],"appState":{}}\n```\n%%\n');
  const startedOver = await api('POST', '/api/boards/new', { board: 'handover' });
  check('starting a board over a note that differs only in case is refused',
    startedOver.status === 409, startedOver.body?.error);
  check('  and the refusal names the note it would have collided with',
    /Handover\.excalidraw\.md/.test(startedOver.body?.error ?? ''));

  const openedLower = await api('POST', '/api/boards/open', { board: 'handover' });
  check('a note authored under another casing opens by the lower-case address',
    openedLower.status === 200 && path.basename(openedLower.body?.file ?? '') === 'Handover.excalidraw.md');
  check('  and is not reported as declaring a different board',
    openedLower.body?.declaredKey === undefined);

  // --- saving a board renames nothing (TASK-069) --------------------------
  //
  // A text element's block id is its element id, so a note cannot hold one
  // longer than eight characters and the writer renames anything longer.
  // Under ADR 0015 the note is the board, which makes that rename the thing
  // the browser gets back — and a text element renamed under an open editor
  // discards what is typed into it without a word. Every id the server mints
  // is therefore already short enough that the writer has nothing to do.

  await api('POST', '/api/boards/new', { board: 'idcheck' });
  const drawn = await api('POST', '/api/elements/batch?board=idcheck', {
    elements: [
      { type: 'rectangle', x: 0, y: 0, width: 200, height: 100, label: { text: 'AuthService' } },
      { type: 'rectangle', x: 400, y: 0, width: 200, height: 100, label: { text: 'Gateway' } },
      { type: 'arrow', x: 200, y: 50, points: [[0, 0], [200, 0]], label: { text: 'HTTP' } },
      { type: 'text', x: 0, y: 300, text: 'a note somebody left' }
    ]
  });
  check('a board is drawn for the id check', drawn.status === 200 || drawn.status === 201,
    JSON.stringify(drawn.body?.error ?? '').slice(0, 120));

  const stored = (await api('GET', '/api/elements?board=idcheck')).body?.elements ?? [];
  const blockShaped = id => /^[A-Za-z0-9-]{1,8}$/.test(id);
  const longIds = stored.map(el => el.id).filter(id => !blockShaped(id));
  check('every id the server minted is short enough to be a block reference',
    stored.length === 4 && longIds.length === 0, longIds.join(', '));

  const savedIds = await api('POST', '/api/boards/save?board=idcheck');
  check('  and the board saves', savedIds.status === 200, savedIds.body?.error);
  const idNote = fs.readFileSync(savedIds.body.file, 'utf-8');
  const sceneJson = JSON.parse(idNote.match(/```json\n([\s\S]*?)\n```/)[1]);
  const inNote = sceneJson.elements.map(el => el.id);
  check('  expanding the labels adds three text elements, not more',
    sceneJson.elements.length === 7, `${sceneJson.elements.length} elements in the note`);
  const renamed = inNote.filter(id => !blockShaped(id));
  check('  and writing the note renamed none of them', renamed.length === 0, renamed.join(', '));
  const carried = stored.map(el => el.id).filter(id => inNote.includes(id));
  check('  every element the board holds is in the note under the name it had',
    carried.length === stored.length,
    stored.map(el => el.id).filter(id => !inNote.includes(id)).join(', '));
  for (const el of sceneJson.elements) {
    if (!el.containerId) continue;
    check(`  the label bound to ${el.containerId} has a block reference`,
      idNote.includes(`^${el.id}`) && inNote.includes(el.containerId), el.id);
    // Derived from the container, which is how the browser's expansion reaches
    // the same name without being told it. Two names for one label is what
    // TASK-024 was made of.
    check(`  and is named after it, so the browser would agree`,
      el.id === labelTextIdFor(el.containerId), `${el.id} vs ${labelTextIdFor(el.containerId)}`);
  }

  // --- scratch has a home, and goes back to it (TASK-077) ----------------
  //
  // The board a first run draws on used to live in the process and nowhere
  // else, so quitting the canvas threw it away without saying so. It has a
  // note now like every other board (ADR 0015), in the vault's own hidden
  // directory beside the library, and this is the check that it is really
  // there afterwards. Its own canvas and its own vault, because the point is
  // what a restart does and the canvas above is holding the rest of the file.

  const scratchVault = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-scratch-'));
  let scratchPort = PORT + 137;
  let scratchBase = `http://127.0.0.1:${scratchPort}`;
  const scratchNote = path.join(scratchVault, '.archboard', 'scratch.excalidraw.md');

  // Started twice, so "is it up" has to mean "is OUR canvas up". A port this
  // did not pick is a port something else may be holding, and a canvas that
  // answers with somebody else's pid would make every check below read as a
  // scratch bug. The port moves rather than the check failing.
  const startScratchCanvas = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const child = spawn(process.execPath, [src('server.ts')], {
        env: { ...process.env, PORT: String(scratchPort), HOST: '127.0.0.1', ARCHBOARD_VAULT: scratchVault, LOG_LEVEL: 'error' },
        stdio: ['ignore', 'ignore', 'ignore']
      });
      for (let i = 0; i < 150; i++) {
        try {
          const health = await (await fetch(`${scratchBase}/health`)).json();
          if (health?.pid === child.pid) return child;
          break;
        } catch { await sleep(100); }
      }
      child.kill('SIGKILL');
      scratchPort += 1;
      scratchBase = `http://127.0.0.1:${scratchPort}`;
    }
    throw new Error(`no canvas of ours came up for the scratch checks (last port ${scratchPort - 1})`);
  };
  const scratchApi = async (method, url, body) => {
    const response = await fetch(`${scratchBase}${url}`, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  let scratchCanvas = await startScratchCanvas();
  try {
    const firstInfo = await scratchApi('GET', '/api/boards/info?board=scratch');
    check('scratch keeps its own name and says where its note goes',
      firstInfo.body?.board === 'scratch' && firstInfo.body?.file === scratchNote,
      firstInfo.body?.file);
    check('  and is the one board marked a placeholder, because nobody named it',
      firstInfo.body?.placeholder === true, JSON.stringify(firstInfo.body?.placeholder));

    await scratchApi('POST', '/api/elements?board=scratch', {
      type: 'rectangle', x: 5, y: 5, width: 60, height: 30, label: { text: 'thinking' }
    });
    const savedScratch = await scratchApi('POST', '/api/boards/save?board=scratch');
    check('saving scratch writes its own note rather than demanding a name',
      savedScratch.status === 200 && savedScratch.body?.file === scratchNote,
      savedScratch.body?.error ?? savedScratch.body?.file);
    check('  and the note is on disk, in the vault\'s hidden directory',
      fs.existsSync(scratchNote));

    // A note in a dot-directory is archboard's, not the vault's. It must not
    // turn up among somebody's boards, and `board list` walks past dot
    // directories for exactly this reason.
    const listed = await scratchApi('GET', '/api/boards');
    check('  without turning up in the vault\'s list of boards',
      (listed.body?.boards ?? []).length === 0, JSON.stringify(listed.body?.boards));
    check('  while still being open, and addressable, like any other board',
      (listed.body?.open ?? []).some(b => b.key === 'scratch'),
      JSON.stringify((listed.body?.open ?? []).map(b => b.key)));

    scratchCanvas.kill('SIGTERM');
    await sleep(300);
    scratchCanvas = await startScratchCanvas();

    const after = await scratchApi('GET', '/api/elements?board=scratch');
    const drawn = (after.body?.elements ?? []).find(el => el.type === 'rectangle');
    check('and the drawing is still there after the canvas is restarted',
      drawn?.width === 60 && drawn?.height === 30, JSON.stringify(after.body?.elements?.length));
    const reopened = await scratchApi('GET', '/api/boards/info?board=scratch');
    check('  read back from the note, not invented empty',
      reopened.body?.elementCount === 2 && typeof reopened.body?.loadedAt === 'string',
      JSON.stringify(reopened.body));
  } finally {
    scratchCanvas.kill('SIGTERM');
    await sleep(200);
    fs.rmSync(scratchVault, { recursive: true, force: true });
  }
} finally {
  server.kill('SIGTERM');
  await sleep(200);
  fs.rmSync(vault, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nboards: ${failures} check(s) failed.`);
  if (serverStderr.trim()) console.error(serverStderr.trim().split('\n').slice(-10).join('\n'));
  process.exit(1);
}
console.log('\nboards: all checks passed.');

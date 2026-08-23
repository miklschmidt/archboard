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
import { withDoing } from './lib/doing.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = p => path.join(repoRoot, 'src', p);

// The throwaway vault, made before anything is imported: a board is a note now
// (ADR 0015), so even the in-process checks below need somewhere for one to be,
// and `src/core/config.ts` reads ARCHBOARD_VAULT once, at import.
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-boards-'));
process.env.ARCHBOARD_VAULT = vault;

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
  resolveBoard, openBoardKeys, SCRATCH_KEY, boards: boardStore, getOrCreateBoard
} = await import(src('core/board-store.ts'));
const { BoardRequiredError } = await import(src('core/board-target.ts'));
const { resolvePaneSpec, soloPane, panesInOrder, MAX_PANES } = await import(src('core/panes.ts'));
const { planPromotion } = await import(src('core/promote.ts'));
const {
  boardKey, makeIdentity, parseBoardKey, boardDisplayName,
  normalizeBoardKey, vaultPathFor, listBoards, identityFrontmatter
} = await import(src('core/board.ts'));
// `board open`'s reader lives with the per-request one now, on top of the same
// `readNoteFile` (TASK-089).
const { readBoardFile, readNote } = await import(src('core/board-io.ts'));

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

// The registry holds no board content (ADR 0015, TASK-078).
//
// This is the shape of the whole decision, checked at the one place it can be
// checked directly: the structure. A board this canvas has open is an identity,
// a note path and the hash of the bytes last put on screen or written there.
// Elements, images and the note's own text used to be here too, and that made
// every open board a second copy that could drift from the note.
{
  const { board } = getOrCreateBoard(makeIdentity({ board: 'registry-shape', level: 'service' }));
  const fields = Object.keys(board).sort();
  check('an open board is a registry entry, not a copy of a board',
    !('elements' in board) && !('files' in board) && !('note' in board), fields.join(', '));
  check('  and what it does hold is where the note is and what was last seen there',
    fields.every(name => ['identity', 'file', 'baseline', 'loadedAt', 'savedAt'].includes(name)),
    fields.join(', '));
  boardStore.delete('registry-shape');
}

// A snapshot shares no element objects with the board it was taken from
// (TASK-048). POST /api/snapshots built its Snapshot from the board's own
// element objects, so editing the board in place would have edited the snapshot
// taken to protect against exactly that.
//
// Object identity is not something HTTP can show, so the express app is
// imported rather than spawned and the snapshot is inspected in this process.
// What it is a snapshot *of* comes off disk like everything else now, so the
// board is a note this block writes and then rewrites. It listens on an
// ephemeral port of its own and is closed again, so it never meets the spawned
// server below.
{
  const { default: app } = await import(src('server.ts'));
  const { snapshots } = await import(src('types.ts'));
  const { readBoardContent, writeBoardContent } = await import(src('core/board-io.ts'));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  const at = `http://127.0.0.1:${listener.address().port}`;

  const identity = makeIdentity({ board: 'snapshot-sharing', level: 'service' });
  const { board: live } = getOrCreateBoard(identity);
  live.file = vaultPathFor(identity);
  const onTheBoard = {
    id: 's1', type: 'rectangle', x: 0, y: 0, width: 160, height: 80,
    customData: { archboard: { node: 'api', kind: 'gateway', variant: 'current' } },
    boundElements: [{ id: 'lbl', type: 'text' }],
    groupIds: ['g1']
  };
  const seeded = readBoardContent(live);
  seeded.elements.set(onTheBoard.id, { ...onTheBoard });
  writeBoardContent(live, seeded);

  const taken = await fetch(`${at}/api/snapshots?board=snapshot-sharing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'before-the-split' })
  });
  check('a snapshot can be taken of a board', taken.status === 200, String(taken.status));

  const kept = snapshots.get('before-the-split')?.elements?.find(el => el.id === 's1');
  check('  holding what the note held', Boolean(kept) && kept.x === 0 &&
    kept.customData.archboard.kind === 'gateway');

  // The board the snapshot was taken of, changed the way the server changes
  // one: a write to the note. Nothing in this process can reach the snapshot's
  // objects, and that is now a property of where a board lives rather than of
  // anybody remembering to deep-copy.
  const after = readBoardContent(live);
  after.elements.set('s1', {
    ...after.elements.get('s1'),
    x: 999,
    customData: { archboard: { node: 'api', kind: 'datastore', variant: 'current' } }
  });
  writeBoardContent(live, after);

  check('changing the board after snapshotting leaves the snapshot unchanged',
    kept.x === 0 && kept.customData.archboard.kind === 'gateway', JSON.stringify(kept));
  check('  and the change really did land on the board',
    readBoardContent(live).elements.get('s1').x === 999);

  snapshots.delete('before-the-split');
  boardStore.delete('snapshot-sharing');
  fs.rmSync(live.file, { force: true });
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

const server = spawn(process.execPath, [src('server.ts')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'pipe']
});
let serverStderr = '';
server.stderr.on('data', chunk => { serverStderr += chunk.toString(); });

const api = async (method, url, body) => {
  // Every write says what it is doing, once for the whole check (TASK-095,
  // scripts/lib/doing.mjs). The refusal itself is proved in check-doing.mjs.
  url = withDoing(url, method, 'checking that every call names its board');
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
    // As with `api` above: the global `--doing` goes on every invocation, so
    // the checks below stay about what they are about (TASK-095).
    const said = args.includes('--doing')
      ? args
      : [...args, '--doing', 'checking that every call names its board'];
    const child = spawn(process.execPath, [src('bin.ts'), ...said], {
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

  // Nodes only. A labelled shape is two elements on the board — itself and its
  // bound text — and only the one somebody promoted carries a node record.
  const variantsOf = body => (body?.elements ?? [])
    .filter(el => el.customData?.archboard?.node)
    .map(el => el.customData.archboard.variant);

  const onBranch = await api('GET', '/api/elements?board=ledger@option-a');
  const branchVariants = variantsOf(onBranch.body);
  check('  and every node on the copy records the variant it was saved as',
    branchVariants.length === 3 && branchVariants.every(v => v === 'option-a'),
    branchVariants.join(','));

  const onOrigin = await api('GET', '/api/elements?board=ledger');
  check('  while the board it was branched from is untouched',
    variantsOf(onOrigin.body).every(v => v === 'current'), variantsOf(onOrigin.body).join(','));

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
  // Three labelled shapes, their three labels and a loose note: seven.
  check('  and the branch is a real board, just not one on screen', offScreen.body?.count === 7,
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

  // The second exception, and the last thing this pane is used for: saving a
  // board that has STOPPED SAVING somewhere else does move the pane holding it
  // (TASK-079). The rule is unchanged — you branch in order to compare, so the
  // source stays where it is — but a held board is not a source anybody is
  // comparing against. It is about to go back to the version another editor
  // wrote, so a pane left on it would show the human their own work being
  // replaced, one second after being told it was safe.
  const ledgerNote = (await api('GET', '/api/boards/info?board=ledger')).body?.file;
  fs.writeFileSync(ledgerNote, fs.readFileSync(ledgerNote, 'utf-8').replace(
    '"type": "text"', '"id": "theirledger", "type": "text"'
  ));
  const ledgerRefused = await api('POST', '/api/elements?board=ledger', {
    type: 'rectangle', x: 700, y: 700, width: 20, height: 20
  });
  check('a held board is the one branch that takes its pane with it: first it is held',
    ledgerRefused.status === 409 && ledgerRefused.body?.held?.board === 'ledger',
    `${ledgerRefused.status}`);
  const heldElsewhere = await api('POST', '/api/boards/save?board=ledger', { name: 'ledger-mine' });
  await sleep(150);
  check('  and saving it elsewhere moves the pane onto the copy that has a home',
    heldElsewhere.body?.resolvedHold?.outcome === 'elsewhere' &&
    heldElsewhere.body?.panes?.moved?.map(p => p.place).join(',') === 'the only pane' &&
    one.board() === 'ledger-mine',
    `${JSON.stringify(heldElsewhere.body?.panes)} ${one.board()}`);
  check('  rather than reporting it kept, which is what a branch of a saving board reports',
    (heldElsewhere.body?.panes?.kept ?? []).length === 0,
    JSON.stringify(heldElsewhere.body?.panes?.kept));

  // What a script reads is the exit code, so the refusal is checked through the
  // CLI rather than inferred from a status. An agent's write is refused exactly
  // as it always was — the board stopping saving does not soften that — and the
  // write after it is taken, with the hold said out loud either way.
  await api('POST', '/api/boards/new', { board: 'cliheld' });
  await api('POST', '/api/elements?board=cliheld', {
    type: 'rectangle', x: 0, y: 0, width: 30, height: 30
  });
  const cliNote = (await api('GET', '/api/boards/info?board=cliheld')).body?.file;
  fs.writeFileSync(cliNote, fs.readFileSync(cliNote, 'utf-8').replace(
    '"type": "rectangle"', '"type": "rectangle", "angle": 0.5'
  ));
  const cliRefused = await cli(['add', '--board', 'cliheld', '--one',
    '{"type":"ellipse","x":1,"y":1,"width":10,"height":10}']);
  check('an agent write refused for the same reason still exits 5 from the CLI',
    cliRefused.code === 5, `exit ${cliRefused.code}`);
  check('  with the three outcomes, and what happens to everything drawn from here',
    /Refusing to save/.test(cliRefused.stderr) &&
    /has stopped saving/.test(cliRefused.stderr) &&
    /board open cliheld --reload/.test(cliRefused.stderr),
    cliRefused.stderr.trim().split('\n').slice(-2).join(' '));
  const cliAfter = await cli(['add', '--board', 'cliheld', '--one',
    '{"type":"ellipse","x":2,"y":2,"width":10,"height":10}']);
  check('  and the write after it is taken, saying where it went',
    cliAfter.code === 0 && /stopped saving/.test(cliAfter.stderr),
    `exit ${cliAfter.code} ${cliAfter.stderr.trim().split('\n')[0]}`);

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
  // Seven, not four: the three labels are text elements on the board from the
  // moment they are written, because the one converter runs at the write
  // boundary rather than on the way into the note (ADR 0015, TASK-072).
  check('every id the server minted is short enough to be a block reference',
    stored.length === 7 && longIds.length === 0,
    longIds.length > 0 ? longIds.join(', ') : `${stored.length} elements`);

  const savedIds = await api('POST', '/api/boards/save?board=idcheck');
  check('  and the board saves', savedIds.status === 200, savedIds.body?.error);
  const idNote = fs.readFileSync(savedIds.body.file, 'utf-8');
  const sceneJson = JSON.parse(idNote.match(/```json\n([\s\S]*?)\n```/)[1]);
  const inNote = sceneJson.elements.map(el => el.id);
  check('  and the note holds what the board holds, expanding nothing further',
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

  // --- a note somebody else wrote, before anybody writes (TASK-062) ------
  //
  // The state between ADR 0016's lock and ADR 0006's refusal, and it used to
  // have nothing to say it. The lock excludes archboard's own writers and does
  // not exclude Obsidian, a sync client or a `git pull`; the refusal fires on
  // the next write, which may be an hour of drawing away. In between, a pane
  // shows a board the vault no longer holds and says nothing.
  //
  // In process, so that none of this waits on the sweep's timer. The wire — the
  // beat, the message and the pane that hears it — is checked further down
  // against a real canvas.
  {
    const { noteWrittenElsewhere, forgetNoteWatch } = await import(src('core/note-watch.ts'));
    const { writeBoardContent, emptyContent } = await import(src('core/board-io.ts'));
    const { beginHold, releaseHold } = await import(src('core/board-hold.ts'));
    const { recordBaseline } = await import(src('core/board-store.ts'));
    const { hashBoardBytes } = await import(src('core/board.ts'));
    const { versionNumber } = await import(src('core/board-version.ts'));

    const identity = makeIdentity({ board: 'notewatch' });
    const { key: watched, board: watchedBoard } = getOrCreateBoard(identity);
    watchedBoard.file = vaultPathFor(identity);
    forgetNoteWatch();

    check('a board with no note yet has nobody else\'s writing on it',
      noteWrittenElsewhere(watched) === null);
    writeBoardContent(watchedBoard, emptyContent());
    check('  and neither has one archboard has just written itself',
      noteWrittenElsewhere(watched) === null);

    // The gate, which is what keeps this off the critical path: a note is read
    // and hashed only when its size or its time has moved, or when archboard's
    // own baseline for it has. Proved by changing the bytes and putting both
    // back — the answer stays what it was, because nothing looked.
    // A whole second, so that putting the time back puts it back exactly:
    // `utimes` takes a Date and loses the sub-millisecond part a write leaves.
    const pinned = new Date(Math.floor(Date.now() / 1000) * 1000);
    fs.utimesSync(watchedBoard.file, pinned, pinned);
    noteWrittenElsewhere(watched);
    const original = fs.readFileSync(watchedBoard.file);
    const tweaked = Buffer.from(original);
    tweaked[tweaked.length - 1] = 0x20;
    fs.writeFileSync(watchedBoard.file, tweaked);
    fs.utimesSync(watchedBoard.file, pinned, pinned);
    const restored = fs.statSync(watchedBoard.file);
    check('a note whose size and time have not moved is not read again',
      restored.size === original.length && restored.mtimeMs === pinned.getTime() &&
      noteWrittenElsewhere(watched) === null,
      `${original.length}/${pinned.getTime()} then ${restored.size}/${restored.mtimeMs}`);
    fs.writeFileSync(watchedBoard.file, original);

    // Somebody else. A foreign writer joins no protocol — it carries the
    // version key across verbatim like any other frontmatter — so what catches
    // it is the change in the bytes and nothing else, which is why this is the
    // same sha-256 comparison the refusal makes. What the version adds on top
    // is which side is ahead, and that is `check-version.mjs`.
    fs.writeFileSync(watchedBoard.file, `${original.toString('utf-8')}\n<!-- somebody else was here -->\n`);
    const written = noteWrittenElsewhere(watched);
    check('a note written by something that is not archboard is seen with no write and no command',
      written?.board === watched && written?.reason === 'changed', JSON.stringify(written));
    check('  saying when it was written and when archboard last saw it, not only that they differ',
      typeof written?.writtenAt === 'string' && typeof written?.lastReadAt === 'string',
      JSON.stringify({ writtenAt: written?.writtenAt, lastReadAt: written?.lastReadAt }));
    check('  and offering the reload alone, because nothing has been refused and nothing is held',
      /board open notewatch --reload/.test(written?.message ?? '') &&
      !/--force/.test(written?.message ?? ''),
      written?.message);

    // The mark's whole claim: it is the state in which the next write would be
    // refused, because both come off the one comparison.
    let refusal = null;
    try {
      writeBoardContent(watchedBoard, emptyContent());
    } catch (error) {
      refusal = error.conflict ?? null;
    }
    check('  which is exactly the state the next write is refused in',
      refusal?.reason === written?.reason && refusal?.board === watched,
      JSON.stringify(refusal?.reason));

    // And from the refusal on it is the hold's story, not this one. Two marks
    // about one thing is a person reading twice to find out there is one
    // problem.
    beginHold(watched, refusal, emptyContent());
    check('once that refusal has happened the hold says it and this stops',
      noteWrittenElsewhere(watched) === null);
    releaseHold(watched);
    check('  and it is back the moment the hold ends without the note being taken',
      noteWrittenElsewhere(watched)?.reason === 'changed');

    // It clears itself, and the thing that clears it is taking the note —
    // which is what `board open --reload` does, and all it does here.
    recordBaseline(
      watchedBoard, watchedBoard.file, hashBoardBytes(fs.readFileSync(watchedBoard.file)),
      versionNumber(fs.readFileSync(watchedBoard.file, 'utf-8'))
    );
    check('taking the note clears it, with no write, no restart and no timer',
      noteWrittenElsewhere(watched) === null);

    forgetNoteWatch();
    boardStore.delete(watched);
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
    url = withDoing(url, method, 'checking what happens to the board nobody named');
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

    // --- nothing is unsaved, so nothing is lost (TASK-078, ADR 0015) -------
    //
    // The check above saved first, which is the old shape of the promise: work
    // survives a restart if somebody remembered to write it. The promise now is
    // that there is nothing to remember — a write is a write to the note, so
    // killing the canvas mid-thought costs the process and nothing else.
    //
    // Both kinds of board, because they used to fail differently: scratch had
    // no home at all, and a `board new` board had one it had never been written
    // to. Killed rather than asked to stop, because a shutdown hook that saved
    // on the way out would pass this and would not be the property.
    await scratchApi('POST', '/api/boards/new', { board: 'unsaved' });
    await scratchApi('POST', '/api/elements?board=unsaved', {
      type: 'rectangle', x: 40, y: 40, width: 123, height: 45, label: { text: 'never saved' }
    });
    await scratchApi('POST', '/api/elements?board=scratch', {
      type: 'ellipse', x: 300, y: 300, width: 77, height: 33
    });
    const beforeKill = await scratchApi('GET', '/api/elements?board=scratch');

    scratchCanvas.kill('SIGKILL');
    await sleep(300);
    scratchCanvas = await startScratchCanvas();

    const survivedScratch = await scratchApi('GET', '/api/elements?board=scratch');
    check('a board drawn on and never saved survives the canvas being killed',
      (survivedScratch.body?.elements ?? []).some(el => el.type === 'ellipse' && el.width === 77),
      JSON.stringify((survivedScratch.body?.elements ?? []).map(el => el.type)));
    check('  with everything else on it, not just the last thing drawn',
      (survivedScratch.body?.elements ?? []).length === (beforeKill.body?.elements ?? []).length,
      `${(beforeKill.body?.elements ?? []).length} before, ${(survivedScratch.body?.elements ?? []).length} after`);

    // A board `board new` started and nobody saved has a note the moment
    // something is drawn on it, so it is in the vault to be reopened.
    const reopenedUnsaved = await scratchApi('POST', '/api/boards/open', { board: 'unsaved' });
    check('  and so does one that `board new` started and nobody saved',
      reopenedUnsaved.status === 200 && reopenedUnsaved.body?.source === 'vault',
      reopenedUnsaved.body?.error ?? reopenedUnsaved.body?.source);
    const unsavedElements = await scratchApi('GET', '/api/elements?board=unsaved');
    check('  holding what was drawn on it, label and all',
      (unsavedElements.body?.elements ?? []).some(el => el.width === 123) &&
      (unsavedElements.body?.elements ?? []).some(el => el.text === 'never saved'),
      JSON.stringify((unsavedElements.body?.elements ?? []).map(el => el.type)));

    // And the other half of the same fact: the process is not holding the
    // board, so a change made to the note behind its back is what a read
    // answers with. This is what "no authoritative copy between requests"
    // means, said as a behaviour rather than as a field that is missing.
    const notePath = (await scratchApi('GET', '/api/boards/info?board=unsaved')).body?.file;
    const noteText = fs.readFileSync(notePath, 'utf-8');
    fs.writeFileSync(notePath, noteText.replace('"width": 123', '"width": 321'));
    const afterEdit = await scratchApi('GET', '/api/elements?board=unsaved');
    check('a board edited on disk reads back changed, with no restart and no reload',
      (afterEdit.body?.elements ?? []).some(el => el.width === 321),
      JSON.stringify((afterEdit.body?.elements ?? []).map(el => el.width)));

    // ADR 0006 has not gone anywhere: that edit is somebody else's work, and
    // the next write is refused rather than quietly built on top of it.
    const refused = await scratchApi('POST', '/api/elements?board=unsaved', {
      type: 'rectangle', x: 0, y: 0, width: 10, height: 10
    });
    check('  and the next write is refused, because the note changed underneath',
      refused.status === 409 && /Refusing to save/.test(refused.body?.error ?? ''),
      `${refused.status} ${String(refused.body?.error ?? '').slice(0, 60)}`);
    check('  offering the three outcomes rather than picking one',
      Boolean(refused.body?.conflict?.outcomes?.reload &&
        refused.body?.conflict?.outcomes?.overwrite &&
        refused.body?.conflict?.outcomes?.saveAs),
      JSON.stringify(refused.body?.conflict?.outcomes));
    check('  and nothing was written, so the disk still holds their version',
      fs.readFileSync(notePath, 'utf-8').includes('"width": 321'));

    // Outcome one, and the way back: take the note.
    const reloaded = await scratchApi('POST', '/api/boards/open', { board: 'unsaved', reload: true });
    check('  taking the note un-sticks it, which is ADR 0006\'s first outcome',
      reloaded.status === 200, reloaded.body?.error);
    const resumed = await scratchApi('POST', '/api/elements?board=unsaved', {
      type: 'rectangle', x: 0, y: 0, width: 11, height: 11
    });
    check('  and writing works again', resumed.status === 200, resumed.body?.error);

    // --- a refusal stops the board saving, and does not interrupt (TASK-079)
    //
    // ADR 0006 survives ADR 0015, but the moment it fires moved: from a save
    // somebody ran to 400 ms after a human lifted their finger. So the refusal
    // above is the LAST one — the board stops saving, holds what is drawn on it
    // after that, and waits for one of the three outcomes to be asked for.
    //
    // Each of the three gets its own board, because each ends in a different
    // place and running them in sequence on one board would test the order
    // rather than the outcomes.

    // One board, drawn on, then rewritten underneath by "another editor" and
    // written to once, which is what stops it saving. Returns the refusal.
    const stopSaving = async (key, theirs) => {
      await scratchApi('POST', '/api/boards/new', { board: key });
      await scratchApi('POST', `/api/elements?board=${key}`, {
        id: 'ours1', type: 'rectangle', x: 10, y: 10, width: 50, height: 50
      });
      const file = (await scratchApi('GET', `/api/boards/info?board=${key}`)).body?.file;
      // Their edit: the same note with a second element in it that this canvas
      // has never seen, so "their version" is recognisable afterwards.
      const note = fs.readFileSync(file, 'utf-8');
      fs.writeFileSync(file, note.replace(
        '"id": "ours1"',
        `"id": "${theirs}", "width": 999}, {"id": "ours1"`
      ));
      const refused = await scratchApi('POST', `/api/elements?board=${key}`, {
        id: 'lost1', type: 'ellipse', x: 5, y: 5, width: 20, height: 20
      });
      return { file, refused };
    };

    const overwriteCase = await stopSaving('holdover', 'theirs1');
    check('a write refused by the hash check leaves the board not saving',
      overwriteCase.refused.status === 409 &&
      overwriteCase.refused.body?.held?.board === 'holdover',
      `${overwriteCase.refused.status} ${JSON.stringify(overwriteCase.refused.body?.held?.board)}`);
    check('  and says so with the three outcomes, since when, and how much is held',
      Boolean(overwriteCase.refused.body?.held?.conflict?.outcomes?.reload) &&
      overwriteCase.refused.body?.held?.writes === 0 &&
      typeof overwriteCase.refused.body?.held?.since === 'string',
      JSON.stringify(overwriteCase.refused.body?.held));
    check('  and the refused write is a refusal: it is not on the board',
      !(await scratchApi('GET', '/api/elements?board=holdover')).body?.elements
        ?.some(el => el.id === 'lost1'));

    // The point of the whole thing: drawing carries on, and stops being refused.
    const held1 = await scratchApi('POST', '/api/elements?board=holdover', {
      id: 'held1', type: 'rectangle', x: 100, y: 100, width: 30, height: 30
    });
    check('the next change is taken rather than refused again',
      held1.status === 200, `${held1.status} ${held1.body?.error}`);
    check('  and goes into the held copy, not into their note',
      !fs.readFileSync(overwriteCase.file, 'utf-8').includes('held1'));
    check('  which is what the board now reads as',
      (await scratchApi('GET', '/api/elements?board=holdover')).body?.elements
        ?.some(el => el.id === 'held1'));
    check('  and every answer about it says it is not being saved, and counts what is held',
      (await scratchApi('GET', '/api/elements?board=holdover')).body?.held?.writes === 1,
      JSON.stringify((await scratchApi('GET', '/api/elements?board=holdover')).body?.held?.writes));
    check('  including the listing, so an agent finds out without writing to it first',
      (await scratchApi('GET', '/api/boards')).body?.open
        ?.find(b => b.key === 'holdover')?.held?.board === 'holdover');
    // The last time this board was written down is still the last time it was
    // written down: a held change is not a save. Nothing in the chrome reads
    // this any more (TASK-062), but an agent asking when a held board was last
    // in the vault is asking a real question and must not be told "just now".
    const savedAtWhenHeld = (await scratchApi('GET', '/api/boards/info?board=holdover')).body?.savedAt;
    await scratchApi('POST', '/api/elements?board=holdover', {
      id: 'held2a', type: 'rectangle', x: 140, y: 140, width: 30, height: 30
    });
    check('  and the last-saved time does not move, because nothing was saved',
      (await scratchApi('GET', '/api/boards/info?board=holdover')).body?.savedAt === savedAtWhenHeld,
      savedAtWhenHeld);

    // A pane says what is on its screen. Only allowed on a held board: the
    // server's copy of one starts as the note the other editor wrote, and this
    // is what makes overwrite mean "what you are looking at" (TASK-079).
    const rebased = await scratchApi('POST', '/api/elements/changes?board=holdover', {
      upserts: [
        { id: 'ours1', type: 'rectangle', x: 10, y: 10, width: 50, height: 50 },
        { id: 'held1', type: 'rectangle', x: 100, y: 100, width: 30, height: 30 }
      ],
      deletes: [],
      rebase: true,
      clientId: 'a-pane'
    });
    check('a pane saying what is on its screen is taken on a held board',
      rebased.status === 200, `${rebased.status} ${rebased.body?.error}`);
    const afterRebase = (await scratchApi('GET', '/api/elements?board=holdover')).body?.elements ?? [];
    check('  and the held copy becomes that screen, not their note with a gesture on top',
      afterRebase.some(el => el.id === 'held1') && !afterRebase.some(el => el.id === 'theirs1'),
      JSON.stringify(afterRebase.map(el => el.id)));
    check('  and the board says a pane has spoken for it',
      (await scratchApi('GET', '/api/elements?board=holdover')).body?.held?.fromScreen === true);

    // Outcome two: overwrite. The held copy goes over their note.
    const forced = await scratchApi('POST', '/api/boards/save', { board: 'holdover', force: true });
    check('overwrite writes the held copy over the note',
      forced.status === 200 && fs.readFileSync(overwriteCase.file, 'utf-8').includes('held1'),
      `${forced.status} ${forced.body?.error}`);
    check('  and their version is gone, which is what overwrite costs',
      !fs.readFileSync(overwriteCase.file, 'utf-8').includes('theirs1'));
    check('  and the board is saving again, saying which outcome ended it',
      forced.body?.resolvedHold?.outcome === 'overwrite' &&
      forced.body?.resolvedHold?.writes === 3 &&
      forced.body?.held === undefined,
      JSON.stringify(forced.body?.resolvedHold));
    const afterForce = await scratchApi('POST', '/api/elements?board=holdover', {
      id: 'after1', type: 'rectangle', x: 0, y: 0, width: 9, height: 9
    });
    check('  so the next change reaches the note like any other',
      afterForce.status === 200 && fs.readFileSync(overwriteCase.file, 'utf-8').includes('after1'),
      `${afterForce.status} ${afterForce.body?.error}`);
    const noRebase = await scratchApi('POST', '/api/elements/changes?board=holdover', {
      upserts: [{ id: 'ours1', type: 'rectangle', x: 1, y: 1, width: 5, height: 5 }],
      deletes: [], rebase: true, clientId: 'a-pane'
    });
    check('  and a pane can no longer declare the whole board, because it is saving again',
      noRebase.status === 400 && /rebase/.test(noRebase.body?.error ?? ''),
      `${noRebase.status} ${noRebase.body?.error}`);

    // Outcome one: reload. It takes the note and ends the held work, which is
    // what it says it costs.
    const reloadCase = await stopSaving('holdreload', 'theirs2');
    await scratchApi('POST', '/api/elements?board=holdreload', {
      id: 'held2', type: 'rectangle', x: 100, y: 100, width: 30, height: 30
    });
    const took = await scratchApi('POST', '/api/boards/open', { board: 'holdreload', reload: true });
    check('reload takes the note and the board saves again',
      took.status === 200 && took.body?.held === undefined, `${took.status} ${took.body?.error}`);
    const afterReload = (await scratchApi('GET', '/api/elements?board=holdreload')).body?.elements ?? [];
    check('  and what was held is gone, which is what reload costs',
      !afterReload.some(el => el.id === 'held2') && afterReload.some(el => el.id === 'theirs2'),
      JSON.stringify(afterReload.map(el => el.id)));

    // Outcome three: elsewhere. Both copies kept, and the source goes back to
    // being their note.
    const elsewhereCase = await stopSaving('holdelse', 'theirs3');
    await scratchApi('POST', '/api/elements?board=holdelse', {
      id: 'held3', type: 'rectangle', x: 100, y: 100, width: 30, height: 30
    });
    const elsewhere = await scratchApi('POST', '/api/boards/save', { board: 'holdelse', name: 'holdmine' });
    check('save elsewhere writes the held copy to a note of its own',
      elsewhere.status === 200 &&
      fs.readFileSync(elsewhere.body?.file, 'utf-8').includes('held3'),
      `${elsewhere.status} ${elsewhere.body?.error}`);
    check('  and says the hold is over and which outcome ended it',
      elsewhere.body?.resolvedHold?.outcome === 'elsewhere' && elsewhere.body?.held === undefined,
      JSON.stringify(elsewhere.body?.resolvedHold));
    check('  and their note is untouched, which is what makes this the free one',
      fs.readFileSync(elsewhereCase.file, 'utf-8').includes('theirs3') &&
      !fs.readFileSync(elsewhereCase.file, 'utf-8').includes('held3'));
    const sourceAfter = (await scratchApi('GET', '/api/elements?board=holdelse')).body ?? {};
    check('  and the board that was held reads as their version now, saving again',
      sourceAfter.held === undefined &&
      (sourceAfter.elements ?? []).some(el => el.id === 'theirs3') &&
      !(sourceAfter.elements ?? []).some(el => el.id === 'held3'),
      JSON.stringify((sourceAfter.elements ?? []).map(el => el.id)));
    // --- and the pane is told, on the beat the lock watch already keeps
    // (TASK-062)
    //
    // The rules are checked in process above. This is the wire: that the news
    // reaches a pane at all, that a pane arriving on a board somebody else has
    // already rewritten is told outright rather than left to a sweep, and that
    // taking the note takes the mark down.
    const paneSocket = new WebSocket(`ws://127.0.0.1:${scratchPort}/?clientId=note-pane`);
    const heard = [];
    paneSocket.on('message', data => heard.push(JSON.parse(data.toString())));
    await new Promise((resolve, reject) => {
      paneSocket.once('open', resolve);
      paneSocket.once('error', reject);
    });
    const notes = () => heard.filter(m => m.type === 'board_note' && m.board === 'watched');
    const lastNote = () => notes()[notes().length - 1]?.writtenElsewhere ?? null;
    try {
      await scratchApi('POST', '/api/boards/new', { board: 'watched' });
      await scratchApi('POST', '/api/elements?board=watched', {
        id: 'seen1', type: 'rectangle', x: 1, y: 1, width: 40, height: 40
      });
      await scratchApi('POST', '/api/panes', {
        clientId: 'note-pane', paneId: 'note-pane', primary: true, focused: true, elementCount: 1,
        board: 'watched',
        rect: { x: 0, y: 0, width: 640, height: 800 },
        viewport: { x: 0, y: 0, width: 640, height: 800, zoom: 1 }
      });
      await scratchApi('POST', '/api/boards/open', { board: 'watched', pane: 'note-pane' });
      await sleep(200);
      check('a pane is told where the note stands as it arrives on a board',
        notes().length > 0 && lastNote() === null,
        JSON.stringify(notes().map(m => m.writtenElsewhere)));

      const watchedFile = (await scratchApi('GET', '/api/boards/info?board=watched')).body?.file;
      fs.writeFileSync(watchedFile, `${fs.readFileSync(watchedFile, 'utf-8')}\n<!-- theirs -->\n`);
      await sleep(2400);
      check('  and hears about a note written underneath it without anybody writing to the board',
        lastNote()?.reason === 'changed' && lastNote()?.board === 'watched',
        JSON.stringify(lastNote()));
      // Its own message, saying its own thing. Not a hold, because nothing has
      // been refused, so there is nothing held and no three outcomes to offer.
      // Not a lock, because nobody is excluded from anything: the board is free
      // and the pane keeps drawing.
      const locks = heard.filter(m => m.type === 'board_lock' && m.board === 'watched');
      check('  which is not a hold and not a lock: nothing was refused and nobody is excluded',
        !heard.some(m => m.type === 'board_hold') &&
        lastNote()?.outcomes === undefined && lastNote()?.writes === undefined &&
        locks[locks.length - 1]?.held === false,
        JSON.stringify({ holds: heard.filter(m => m.type === 'board_hold').length, lock: locks[locks.length - 1]?.held }));
      // Once, not once a second: it is the state of the board, and a socket
      // carrying it on every beat is the same sentence a thousand times an hour.
      check('  said once rather than repeated on every sweep',
        notes().filter(m => m.writtenElsewhere !== null).length === 1,
        `${notes().filter(m => m.writtenElsewhere !== null).length} times`);

      await scratchApi('POST', '/api/boards/open', { board: 'watched', pane: 'note-pane', reload: true });
      await sleep(200);
      check('  and taking the note takes the mark down by itself',
        lastNote() === null, JSON.stringify(lastNote()));
    } finally {
      paneSocket.close();
      await sleep(100);
    }
  } finally {
    scratchCanvas.kill('SIGTERM');
    await sleep(200);
    fs.rmSync(scratchVault, { recursive: true, force: true });
  }

  // --- the answer names the id the board holds (TASK-069, TASK-078) -------
  //
  // A text element's block id is its element id, and a block reference cannot
  // hold more than eight characters, so an id from elsewhere — Excalidraw mints
  // 21, and a caller can send anything — gets a shorter one on the way into a
  // note. Nothing archboard mints needs that.
  //
  // The rename used to happen after the write had already answered, which was
  // survivable while the note and the board were two documents: the note said
  // one name, the board said another, and nobody compared them. The note is the
  // board now, so an agent was told an id the board did not hold, and the next
  // read brought the element back renamed under whoever was drawing.
  {
    await api('POST', '/api/boards/new', { board: 'blockids' });
    const long = 'a-caption-id-nobody-can-reference';
    const made = await api('POST', '/api/elements?board=blockids', {
      id: long, type: 'text', x: 0, y: 0, text: 'a caption'
    });
    const answered = made.body?.element?.id;
    check('a text element whose id cannot be a block reference is renamed',
      made.status === 200 && answered !== long, `${made.status} ${answered}`);
    check('  to something a block reference can hold',
      /^[A-Za-z0-9-]{1,8}$/.test(answered ?? ''), String(answered));
    check('  and the write answers with the name the board actually holds',
      Boolean(answered) &&
      (await api('GET', `/api/elements/${answered}?board=blockids`)).status === 200,
      String(answered));

    // The point of moving it: reading the board back does not rename anything
    // a second time, so nobody is holding an id that stops existing.
    const held = await api('GET', '/api/elements?board=blockids');
    check('  and reading the board back finds that same name, not another one',
      (held.body?.elements ?? []).map(el => el.id).join(',') === answered,
      JSON.stringify((held.body?.elements ?? []).map(el => el.id)));
    const noteFile = (await api('GET', '/api/boards/info?board=blockids')).body?.file;
    check('  which is also the block reference in the note',
      fs.readFileSync(noteFile, 'utf-8').includes(`a caption ^${answered}`),
      String(answered));

    // An id that is already a block reference is left alone, because renaming
    // is the dangerous act and nothing here needs doing.
    const short = await api('POST', '/api/elements?board=blockids', {
      id: 'cap2', type: 'text', x: 0, y: 60, text: 'another'
    });
    check('  while an id that can already be one is left exactly as it is',
      short.body?.element?.id === 'cap2', String(short.body?.element?.id));
  }

  // --- a note is written by rename (TASK-061, ADR 0015) -------------------
  //
  // Not "the file has the right contents afterwards", which a bare
  // writeFileSync passes too. The property is about the window in the middle
  // of the write, and it is proved by holding two references to the old note
  // across a save: an open file descriptor, which is what a reader mid-write
  // has, and a second hard link, which is that reader's file surviving the
  // write. A truncate-and-fill takes both of those down with it. A rename
  // leaves the old inode whole and gives the path a new one.

  const witnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-witness-'));
  try {
    await api('POST', '/api/boards/new', { board: 'atomic' });
    await api('POST', '/api/elements?board=atomic', {
      type: 'rectangle', x: 0, y: 0, width: 100, height: 60, label: { text: 'before' }
    });
    const firstSave = await api('POST', '/api/boards/save?board=atomic');
    check('a board is saved for the atomicity check', firstSave.status === 200, firstSave.body?.error);
    const note = firstSave.body.file;

    const before = fs.readFileSync(note, 'utf-8');
    const beforeInode = fs.statSync(note).ino;
    // The reader who opened the note a moment before the second save.
    const heldOpen = fs.openSync(note, 'r');
    // And their copy of it, by inode rather than by bytes.
    const witness = path.join(witnessDir, 'witness.md');
    fs.linkSync(note, witness);

    await api('POST', '/api/elements?board=atomic', {
      type: 'rectangle', x: 200, y: 0, width: 100, height: 60, label: { text: 'after' }
    });
    const secondSave = await api('POST', '/api/boards/save?board=atomic');
    check('  and saved again over itself', secondSave.status === 200, secondSave.body?.error);
    const after = fs.readFileSync(note, 'utf-8');
    check('  the note really changed, so there is a write to be atomic about',
      after !== before && after.includes('after'));

    const throughHeldFd = fs.readFileSync(heldOpen, 'utf-8');
    fs.closeSync(heldOpen);
    check('a reader holding the note open across the write still has the whole old note',
      throughHeldFd === before,
      `${throughHeldFd.length} bytes through the fd vs ${before.length} before the save`);
    check('  and so does a second link to it, so the old bytes were never truncated',
      fs.readFileSync(witness, 'utf-8') === before);
    check('  because the path got a new inode rather than the old one being refilled',
      fs.statSync(note).ino !== beforeInode);

    const strays = fs.readdirSync(vault).filter(name => name.endsWith('.tmp'));
    check('nothing named .tmp is left in the vault', strays.length === 0, strays.join(', '));
    const listedAfter = await api('GET', '/api/boards');
    check('  and the vault listing sees one board named atomic, not a second',
      (listedAfter.body?.boards ?? []).filter(b => b.key === 'atomic').length === 1);

    // The temp file's name is the other half of "cannot be mistaken for a
    // board": a dotfile with a .tmp suffix, which `listBoards` skips twice over
    // and Obsidian does not show. Asserted against the helper rather than
    // against a race, because the file only exists for the length of a write.
    const { writeFileAtomic, tempPathFor } = await import(src('core/atomic-write.ts'));
    const tempName = path.basename(tempPathFor(path.join(vault, 'payments.excalidraw.md')));
    check('the temp file a write goes through is hidden from a vault',
      tempName.startsWith('.') && tempName.endsWith('.tmp'), tempName);

    // The fsync, and that it lands before the rename. A rename is atomic to
    // readers whatever else happens; it is the fsync that stops the new name
    // pointing at a short file after a crash, and it is over half the cost of
    // a write, so something has to notice if it is quietly dropped.
    const realFsync = fs.fsyncSync;
    const realRename = fs.renameSync;
    const order = [];
    fs.fsyncSync = fd => { order.push('fsync'); return realFsync(fd); };
    fs.renameSync = (from, to) => { order.push('rename'); return realRename(from, to); };
    try {
      writeFileAtomic(path.join(witnessDir, 'ordered.md'), 'contents\n');
    } finally {
      fs.fsyncSync = realFsync;
      fs.renameSync = realRename;
    }
    check('the bytes are flushed to disk before the rename', order[0] === 'fsync' && order[1] === 'rename',
      order.join(' -> '));
    check('  and the file is there afterwards',
      fs.readFileSync(path.join(witnessDir, 'ordered.md'), 'utf-8') === 'contents\n');

    // Every writer of a vault note, not only the board save. A second idiom is
    // how the first one goes stale, so the rule is that these modules do not
    // call writeFileSync on a path at all.
    for (const module of ['core/board-io.ts', 'core/library.ts', 'core/repo-registry.ts']) {
      const source = fs.readFileSync(src(module), 'utf-8');
      check(`  ${module} writes through the shared atomic write`,
        !/\bfs\.writeFileSync\(/.test(source) && /writeFileAtomic\(/.test(source));
    }
  } finally {
    fs.rmSync(witnessDir, { recursive: true, force: true });
  }

  // --- a board's images are its own (TASK-060, ADR 0015) ------------------
  //
  // Nothing in archboard's data model used to say which board an image
  // belonged to: one map per process, keyed by file id, shared by every open
  // board. Excalidraw's format does say, and it is the only thing that does —
  // an image element carries `fileId` and the scene's `files` map is keyed by
  // it. So a board's images are the ones its own elements draw, which is a
  // relation rather than a guess.

  const pngA = 'data:image/png;base64,QUJPQVJEQUFBQQ==';
  const pngB = 'data:image/png;base64,QUJPQVJEQkJCQg==';
  const imageOn = (board, fileId, x) => api('POST', `/api/elements?board=${board}`, {
    type: 'image', x, y: 0, width: 80, height: 80, fileId
  });

  await api('POST', '/api/boards/new', { board: 'picsa' });
  await api('POST', '/api/boards/new', { board: 'picsb' });
  // The element first, then its data. A note holds the images its own elements
  // draw, so the element is what gives the data somewhere to be (ADR 0015);
  // `import` has always done it in this order.
  await imageOn('picsa', 'img-a', 0);
  await imageOn('picsb', 'img-b', 0);
  const addedA = await api('POST', '/api/files?board=picsa', {
    files: [{ id: 'img-a', dataURL: pngA, mimeType: 'image/png' }]
  });
  await api('POST', '/api/files?board=picsb', {
    files: [{ id: 'img-b', dataURL: pngB, mimeType: 'image/png' }]
  });
  check('an image is added to the board that is drawing it',
    addedA.status === 200 && addedA.body?.board === 'picsa' && addedA.body?.count === 1);

  const beforeItsElement = await api('POST', '/api/files?board=picsb', {
    files: [{ id: 'img-early', dataURL: 'data:image/png;base64,RUFSTFk=', mimeType: 'image/png' }]
  });
  check('  and one posted before anything draws it is not kept, and says so',
    beforeItsElement.body?.count === 0 &&
    (beforeItsElement.body?.orphaned ?? []).join(',') === 'img-early' &&
    /Create the image element first/.test(beforeItsElement.body?.warning ?? ''),
    JSON.stringify(beforeItsElement.body).slice(0, 120));

  const onlyA = await api('GET', '/api/files?board=picsa');
  check('  and asking one board for its images gets that board\'s',
    Object.keys(onlyA.body?.files ?? {}).join(',') === 'img-a');
  const noBoard = await api('GET', '/api/files');
  check('  while asking without naming a board is refused, like every other route',
    noBoard.status === 400, JSON.stringify(noBoard.body?.error ?? '').slice(0, 80));

  const savedPicsA = await api('POST', '/api/boards/save?board=picsa');
  const savedPicsB = await api('POST', '/api/boards/save?board=picsb');
  check('both boards with images save', savedPicsA.status === 200 && savedPicsB.status === 200);
  const noteA = fs.readFileSync(savedPicsA.body.file, 'utf-8');
  const noteB = fs.readFileSync(savedPicsB.body.file, 'utf-8');
  check('a saved note carries its own board\'s image', noteA.includes(pngA));
  check('  and not the other board\'s, which was open at the same time', !noteA.includes(pngB));
  check('  and the same the other way round', noteB.includes(pngB) && !noteB.includes(pngA));

  // An image nothing draws is not an image the board uses. The filter is
  // reachability from the elements, so a file left over from a deleted picture
  // does not ride along into the note for ever. Posted straight into the note's
  // scene, because the route refuses to keep one.
  const orphaned = noteA.replace(
    '"img-a":',
    '"img-orphan":{"id":"img-orphan","mimeType":"image/png","dataURL":"data:image/png;base64,T1JQSEFO"},"img-a":'
  );
  fs.writeFileSync(savedPicsA.body.file, orphaned);
  await api('POST', '/api/boards/open', { board: 'picsa', reload: true });
  const withOrphan = await api('POST', '/api/boards/save?board=picsa');
  check('an image no element draws is left out of the note',
    withOrphan.status === 200 &&
    !fs.readFileSync(withOrphan.body.file, 'utf-8').includes('T1JQSEFO'),
    withOrphan.body?.error);

  // The read half, and the dangerous one. Under ADR 0015 the note is rewritten
  // from what was read, so an image that does not come back off disk is
  // deleted by the next write rather than merely failing to render.
  //
  // Opened cold, from a note this process has never held, because a board that
  // is already open keeps the images it has in memory and would answer from
  // those whether the read half works or not.
  const coldFile = path.join(vault, 'picsc.excalidraw.md');
  fs.writeFileSync(coldFile, noteA.replace(/^board: picsa$/m, 'board: picsc'));
  const cold = await api('POST', '/api/boards/open', { board: 'picsc' });
  check('a board opened from a note nothing here has held loads', cold.status === 200, cold.body?.error);
  const coldFiles = await api('GET', '/api/files?board=picsc');
  check('  and its images come off the disk with it',
    coldFiles.body?.files?.['img-a']?.dataURL === pngA,
    JSON.stringify(Object.keys(coldFiles.body?.files ?? {})));
  const resaved = await api('POST', '/api/boards/save?board=picsc');
  check('  so writing back what was just read keeps the image rather than dropping it',
    resaved.status === 200 && fs.readFileSync(resaved.body.file, 'utf-8').includes(pngA),
    resaved.body?.error);

  // A pane gets the pictures with the board. `board_switched` used to carry
  // elements and no files, so an image element arrived with nothing to draw.
  const picPane = await openPane('p-pics', 0, { primary: true, focused: true });
  await api('POST', '/api/boards/open', { board: 'picsb' });
  await sleep(120);
  const switched = [...picPane.seen].reverse().find(m => m.type === 'board_switched');
  check('a pane pointed at a board with pictures is sent the pictures',
    switched?.files?.['img-b']?.dataURL === pngB, JSON.stringify(Object.keys(switched?.files ?? {})));
  picPane.socket.close();
  await sleep(150);

  // A branch of a board with images is a board with images. It gets copies,
  // for the same reason it gets copies of the elements (TASK-042).
  const branchedPics = await api('POST', '/api/boards/save?board=picsa', { variant: 'option-p' });
  check('a branch of a board with images carries them', branchedPics.status === 200);
  const branchFiles = await api('GET', '/api/files?board=picsa@option-p');
  check('  as its own copy, not a reference to the source\'s',
    branchFiles.body?.files?.['img-a']?.dataURL === pngA &&
    branchFiles.body.files['img-a'] !== onlyA.body.files['img-a']);
  check('  and its note has the image in it too',
    fs.readFileSync(branchedPics.body.file, 'utf-8').includes(pngA));

  // The property, on its own, at the place every scene is assembled. This is
  // the one that still means something under ADR 0015, where a note is written
  // by things other than `board save` — the filter is not on the save path, it
  // is on the only path that builds a scene.
  {
    const { buildScene } = await import(src('core/scene-io.ts'));
    const everyImage = {
      'img-a': { id: 'img-a', dataURL: pngA, mimeType: 'image/png' },
      'img-b': { id: 'img-b', dataURL: pngB, mimeType: 'image/png' }
    };
    const built = buildScene(
      [{ id: 'e1', type: 'image', x: 0, y: 0, width: 10, height: 10, fileId: 'img-a' }],
      everyImage
    );
    check('a scene built from one board\'s elements carries only the images they draw',
      Object.keys(built.scene.files ?? {}).join(',') === 'img-a');
    const noImages = buildScene(
      [{ id: 'e2', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }],
      everyImage
    );
    check('  and a board that draws none has no files key at all',
      noImages.scene.files === undefined);
  }

  // --- a note the Obsidian plugin has been through (TASK-085, ADR 0017) ----
  //
  // The plugin does not keep image bytes in the drawing. It writes each one
  // out as a real vault file, records where it went under `## Embedded Files`
  // as `<fileId>: [[path]]`, and empties `scene.files`. So a board that has
  // been opened in Obsidian comes back with no pictures in it and a section
  // that is the only record of where they are.
  //
  // Both halves are asserted here because either alone is useless: preserving
  // the section without following it keeps the record and not the picture, and
  // following it without preserving it loses the record on the first save.
  {
    const { wrapSceneAsObsidianMd } = await import(src('core/obsidian-md.ts'));
    const PNG_BASE64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    fs.mkdirSync(path.join(vault, 'attachments'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'attachments', 'logo.png'), Buffer.from(PNG_BASE64, 'base64'));

    // A note in the plugin's own shape: an image element, an empty files map,
    // and the section naming the vault file it moved the bytes to.
    const pluginNote = (boardName, sectionLines) => {
      const bare = wrapSceneAsObsidianMd(
        {
          type: 'excalidraw',
          version: 2,
          elements: [{ id: 'img-emb', type: 'image', x: 0, y: 0, width: 40, height: 40, fileId: 'emb12345' }],
          appState: { viewBackgroundColor: '#ffffff' },
          files: {}
        },
        null,
        { frontmatter: [['board', boardName], ['variant', 'current']] }
      );
      const at = bare.indexOf('\n%%\n## Drawing\n');
      return `${bare.slice(0, at)}\n## Embedded Files\n${sectionLines}\n${bare.slice(at + 1)}`;
    };

    fs.writeFileSync(
      path.join(vault, 'picsd.excalidraw.md'),
      pluginNote('picsd', 'emb12345: [[attachments/logo.png]]\n')
    );
    const migrated = await api('POST', '/api/boards/open', { board: 'picsd' });
    check('a note the plugin has migrated the images out of opens', migrated.status === 200, migrated.body?.error);
    const migratedFiles = await api('GET', '/api/files?board=picsd');
    check('  and the image it moved into the vault is followed to its file',
      migratedFiles.body?.files?.emb12345?.dataURL === `data:image/png;base64,${PNG_BASE64}`,
      JSON.stringify(Object.keys(migratedFiles.body?.files ?? {})));

    const savedMigrated = await api('POST', '/api/boards/save?board=picsd');
    const migratedNote = fs.readFileSync(savedMigrated.body.file, 'utf-8');
    check('  and the save keeps the section saying where it went',
      migratedNote.includes('## Embedded Files') &&
      migratedNote.includes('emb12345: [[attachments/logo.png]]'),
      savedMigrated.body?.error);
    check('  without writing the bytes back into a note the plugin migrated them out of',
      !migratedNote.includes(PNG_BASE64));

    // The plugin writes the shortest form that still picks the file out, so a
    // bare filename is the common case rather than the exception.
    fs.writeFileSync(
      path.join(vault, 'picse.excalidraw.md'),
      pluginNote('picse', 'emb12345: [[logo.png]]\n')
    );
    const byName = await api('POST', '/api/boards/open', { board: 'picse' });
    const byNameFiles = await api('GET', '/api/files?board=picse');
    check('a bare filename is resolved against the vault',
      byName.status === 200 && byNameFiles.body?.files?.emb12345?.dataURL?.endsWith(PNG_BASE64),
      JSON.stringify(Object.keys(byNameFiles.body?.files ?? {})));

    // Two files of that name and there is no answer, so there is no picture
    // either. Guessing would put a different image on the board than the one
    // Obsidian shows, which is worse than the hole.
    fs.mkdirSync(path.join(vault, 'elsewhere'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'elsewhere', 'logo.png'), Buffer.from(PNG_BASE64, 'base64'));
    fs.writeFileSync(
      path.join(vault, 'picsf.excalidraw.md'),
      pluginNote('picsf', 'emb12345: [[logo.png]]\n')
    );
    const ambiguous = await api('POST', '/api/boards/open', { board: 'picsf' });
    const ambiguousFiles = await api('GET', '/api/files?board=picsf');
    check('  but a name two files answer to is left unresolved rather than guessed at',
      ambiguous.status === 200 && ambiguousFiles.body?.files?.emb12345 === undefined,
      JSON.stringify(Object.keys(ambiguousFiles.body?.files ?? {})));

    // A link out of the vault is not a vault file, whoever wrote it there.
    fs.writeFileSync(
      path.join(vault, 'picsg.excalidraw.md'),
      pluginNote('picsg', 'emb12345: [[../../etc/passwd.png]]\n')
    );
    const escaping = await api('POST', '/api/boards/open', { board: 'picsg' });
    const escapingFiles = await api('GET', '/api/files?board=picsg');
    check('a wikilink pointing outside the vault resolves to nothing',
      escaping.status === 200 && escapingFiles.body?.files?.emb12345 === undefined,
      JSON.stringify(Object.keys(escapingFiles.body?.files ?? {})));

    // --- one reader, and something that says so (TASK-089) -----------------
    //
    // `board open` reads a note through `readBoardFile`; every request that
    // touches a board reads it through `readNote`. Those were two
    // implementations of one act, and the wikilink resolution above went into
    // only one of them. The two merged with no conflict, git reported nothing,
    // and a migrated board rendered holes on every read until 256369d put it
    // back by hand.
    //
    // They stand on one `readNoteFile` now. This asserts it from the outside,
    // on the fixture that caught it: whatever is true of reading a note has to
    // be true on both, and each of these is a property somebody has already
    // got wrong on exactly one path.
    {
      const opened = readBoardFile(parseBoardKey('picsd'), vault);
      const perRequest = readNote(path.join(vault, 'picsd.excalidraw.md'));
      const wanted = `data:image/png;base64,${PNG_BASE64}`;
      check('the open path and the per-request path read one note as the same bytes',
        opened.raw === perRequest.note && opened.hash === perRequest.hash);
      const openHasIt = JSON.parse(opened.sceneJson).files?.emb12345?.dataURL === wanted;
      const requestHasIt = perRequest.files.get('emb12345')?.dataURL === wanted;
      check('  and both follow the picture the plugin moved into the vault',
        openHasIt && requestHasIt,
        openHasIt && requestHasIt ? '' : `open ${openHasIt}, per-request ${requestHasIt}`);

      // A file at a board's path that is not a note is refused, in the same
      // words, whichever way it was asked for.
      fs.writeFileSync(path.join(vault, 'notanote.excalidraw.md'), '# just a heading\n');
      const refusal = read => { try { read(); return null; } catch (error) { return error.message; } };
      const onOpen = refusal(() => readBoardFile(parseBoardKey('notanote'), vault));
      const onRequest = refusal(() => readNote(path.join(vault, 'notanote.excalidraw.md')));
      check('  and both refuse a file that is not an Obsidian note, saying the same thing',
        onOpen !== null && onOpen === onRequest && /refusing to read it as a board/.test(onOpen),
        onOpen === onRequest ? '' : `open: ${onOpen} / per-request: ${onRequest}`);

      // And a note that is not there is null on both: a board `board new` has
      // just started exists and has nothing in it.
      check('  and a note that is not there is null on both rather than a throw',
        readBoardFile(parseBoardKey('nosuchboard'), vault) === null &&
        readNote(path.join(vault, 'nosuchboard.excalidraw.md')) === null);
    }

    // The structural half. The agreement checks above catch a second reader
    // that is wrong; this catches a second reader that is right today, which
    // is the state the last one was in for as long as it took somebody to fix
    // the other. Exactly one place in src/ turns a note into a scene.
    {
      const callers = [];
      const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { walk(full); continue; }
          if (!entry.name.endsWith('.ts')) continue;
          for (const line of fs.readFileSync(full, 'utf-8').split('\n')) {
            if (!/\bsceneJsonWithEmbeddedImages\s*\(/.test(line)) continue;
            if (/^export function sceneJsonWithEmbeddedImages/.test(line.trim())) continue;
            callers.push(`${path.relative(repoRoot, full)}:${line.trim()}`);
          }
        }
      };
      walk(path.join(repoRoot, 'src'));
      check('one place in src/ reassembles a note\'s scene, and it is readNoteFile',
        callers.length === 1 && callers[0].startsWith('src/core/board-io.ts:'),
        callers.join(' | ') || 'nothing calls it at all');
    }
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

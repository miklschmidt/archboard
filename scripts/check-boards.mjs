#!/usr/bin/env node
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
const dist = p => path.join(repoRoot, 'dist', p);

let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// The rules, on their own
// ---------------------------------------------------------------------------

const { resolveBoard, openBoardKeys, SCRATCH_KEY } = await import(dist('core/board-store.js'));
const { BoardRequiredError } = await import(dist('core/board-target.js'));
const { resolvePaneSpec, soloPane, panesInOrder, MAX_PANES } = await import(dist('core/panes.js'));

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

const PORT = Number(process.env.PORT || 33000 + Math.floor(Math.random() * 2000));
const base = `http://127.0.0.1:${PORT}`;
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-boards-'));

const server = spawn(process.execPath, [dist('server.js')], {
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

  // The exit code is the part a script reads, so it is checked through the CLI
  // rather than inferred from the status.
  const cli = (args) => new Promise(resolve => {
    const child = spawn(process.execPath, [dist('bin.js'), ...args], {
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

#!/usr/bin/env bun

// A board carries a version, so a writer can say which one it was editing
// (TASK-091).
//
// WHAT THIS IS NOT. It is not a replacement for ADR 0006's hash check, and the
// last section here is the proof rather than the promise: a foreign edit that
// leaves the version exactly where it was, written with a *matching*
// expectation, is still refused. A counter only binds writers who join it and
// Obsidian has not, so it fails open precisely where the hash fails closed.
//
// What it adds is the two things a sha-256 structurally cannot.
//
//   ordering       two documents that disagree are just two documents. The hash
//                  says they differ and can never say which is newer, so
//                  archboard could refuse a write and not tell anybody whether
//                  the note was ahead of the canvas or behind it
//   a precondition a writer may say what it was editing and have the write
//                  refused if the board has moved on, instead of two archboard
//                  clients that both read before either wrote
//
// And together they diagnose, which is the part worth building deliberately.
// Given what archboard last wrote and what the note carries now:
//
//   unchanged, different bytes -> a writer that does not keep the mark
//   moved backwards            -> a revert, or an older copy restored
//   ahead                      -> another archboard, and by how many writes
//
// All three are exercised below, and each is a state no equality check can tell
// from either of the others.
//
// AND NOBODY HAS TO REMEMBER TO SAY IT. An agent is a fresh process per
// command, so a number it has to thread from one answer into the next request
// is a number it drops, and a precondition a caller may leave out protects
// nobody. So the canvas fills it in from what it last told this writer, and the
// two places that can be told are exercised here: a claim, which is the
// identity the canvas keeps against a board (TASK-080), and a client process
// that lives long enough to remember, which is what an MCP server is. The gap
// between them is exercised too, because it is real: an unclaimed CLI process
// is anonymous and nothing can honestly be checked for it.
//
// Two halves. The first runs in this process against the modules, because the
// diagnoses are about the note on disk and reading one is the whole of it. The
// second stands a real canvas up, because the precondition is checked at the
// write boundary under the board's lock and a check that called the function
// directly would not be checking that.

import fs from 'node:fs';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withDoing } from './lib/doing.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => join(repoRoot, 'src', p);

// Before any import: `src/core/config.ts` reads the vault and the canvas URL
// once, at load. The URL above all — its default is 127.0.0.1:3000, which is
// where somebody's real canvas is, and a check that imported the client before
// setting this would drive their boards.
const PORT = 39300 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${PORT}`;
process.env.EXPRESS_SERVER_URL = base;
process.env.EXCALIDRAW_NO_AUTOSTART = '1';
const vault = fs.mkdtempSync(join(os.tmpdir(), 'archboard-version-'));
process.env.ARCHBOARD_VAULT = vault;

let failures = 0;
let checks = 0;
const check = (label, condition, extra = '') => {
  checks += 1;
  if (!condition) failures += 1;
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
  return condition;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { makeIdentity, vaultPathFor } = await import(src('core/board.ts'));
const {
  checkBoardVersion,
  forgetRememberedVersion,
  rememberVersion,
  rememberedVersion,
  versionNumber,
  versionMove,
  versionOfNoteAt
} = await import(src('core/board-version.ts'));
const { getOrCreateBoard, boards: boardStore, recordBaseline } = await import(src('core/board-store.ts'));
const {
  emptyContent, foreignWriteTo, readNote, writeBoardContent
} = await import(src('core/board-io.ts'));
const { hashBoardBytes } = await import(src('core/board.ts'));
const { noteWrittenElsewhere, forgetNoteWatch } = await import(src('core/note-watch.ts'));

const box = (id, x) => ({
  id, type: 'rectangle', x, y: 10, width: 60, height: 40,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', version: 1
});
const contentOf = (...elements) => ({
  elements: new Map(elements.map((element) => [element.id, element])),
  files: new Map()
});

// ---------------------------------------------------------------------------
// 1. The version lives in the note, beside the identity, and round-trips
// ---------------------------------------------------------------------------

const ledgerIdentity = makeIdentity({ board: 'ledger', level: 'service' });
const { key: ledgerKey, board: ledger } = getOrCreateBoard(ledgerIdentity);
ledger.file = vaultPathFor(ledgerIdentity);

{
  const first = writeBoardContent(ledger, contentOf(box('aaa', 10)), { saveCommand: 'board save' });
  const note = fs.readFileSync(ledger.file, 'utf-8');
  check('the first write archboard makes to a note starts the count at 1', first.version === 1,
    String(first.version));
  check('  written into the frontmatter as a plain key, beside board, variant and level',
    /^version: 1$/m.test(note) && /^board: ledger$/m.test(note) && /^level: service$/m.test(note),
    note.slice(0, note.indexOf('---', 4)).replace(/\n/g, ' | '));
  check('  and read back off the note as the number it is', readNote(ledger.file).version === 1);

  const second = writeBoardContent(ledger, contentOf(box('aaa', 10), box('bbb', 200)), { saveCommand: 'board save' });
  check('a write that changes the board moves it on', second.version === 2, String(second.version));
  check('  and the note says so', versionNumber(fs.readFileSync(ledger.file, 'utf-8')) === 2);
  check('  and only that line moved: the version is not stamped anywhere else',
    (fs.readFileSync(ledger.file, 'utf-8').match(/^version: /gm) ?? []).length === 1);

  // The point of reading it from the head alone: this is what the write
  // boundary asks on every request that states an expectation, and a board's
  // scene can be megabytes.
  check('  and the same answer comes off the head of the file, without reading the scene',
    versionOfNoteAt(ledger.file) === 2);
}

// ---------------------------------------------------------------------------
// 2. A write that produces the note that is already there is not a new version
// ---------------------------------------------------------------------------
//
// Not an optimisation. Two saves of an unchanged board have to stay
// byte-identical — that property is older than this counter and a bump on every
// write would break it — and the foreign-writer diagnosis below rests on the
// same fact said the other way round: "the version did not move and the bytes
// did" only names somebody else while archboard never writes different bytes
// without moving it.

{
  const before = fs.readFileSync(ledger.file);
  const again = writeBoardContent(ledger, contentOf(box('aaa', 10), box('bbb', 200)), { saveCommand: 'board save' });
  const after = fs.readFileSync(ledger.file);
  check('writing the same board again leaves the note byte-identical', before.equals(after),
    `${before.length} then ${after.length}`);
  check('  so the version does not move, and two saves still produce one document',
    again.version === 2, String(again.version));
}

// ---------------------------------------------------------------------------
// 3. The write seam owns the sources and their precedence
// ---------------------------------------------------------------------------

{
  const writer = 'check-version-writer';
  rememberVersion(writer, 1);
  check('a version stated for this write beats the older one the canvas remembers',
    checkBoardVersion({
      board: ledgerKey,
      file: ledger.file,
      writesNote: true,
      stated: 2,
      rememberedBy: writer
    }) === null);

  const conflict = checkBoardVersion({
    board: ledgerKey,
    file: ledger.file,
    writesNote: true,
    rememberedBy: writer
  });
  check('without a stated version, the remembered one is the write precondition',
    conflict?.expected === 1 && conflict.actual === 2,
    JSON.stringify({ expected: conflict?.expected, actual: conflict?.actual }));
  check('a refusal remembers the version it just told that writer',
    rememberedVersion(writer) === 2, String(rememberedVersion(writer)));

  forgetRememberedVersion(writer);
  check('the note\'s own current version is deliberately not an expectation source',
    checkBoardVersion({ board: ledgerKey, file: ledger.file, writesNote: true }) === null);
}

// ---------------------------------------------------------------------------
// 4. Somebody's own `version` key is not archboard's to take
// ---------------------------------------------------------------------------

{
  const identity = makeIdentity({ board: 'theirs' });
  const { board } = getOrCreateBoard(identity);
  board.file = vaultPathFor(identity);
  writeBoardContent(board, contentOf(box('ccc', 10)), { saveCommand: 'board save' });
  // Their key, in their frontmatter, holding something that is not a count.
  const theirs = fs.readFileSync(board.file, 'utf-8').replace(/^version: 1$/m, 'version: second draft');
  fs.writeFileSync(board.file, theirs);
  recordBaseline(board, board.file, hashBoardBytes(fs.readFileSync(board.file)), null);

  const written = writeBoardContent(board, contentOf(box('ccc', 10), box('ddd', 200)), { saveCommand: 'board save' });
  const note = fs.readFileSync(board.file, 'utf-8');
  check('a `version` key holding something that is not a count is left exactly as it is',
    /^version: second draft$/m.test(note), note.split('\n').find((l) => l.startsWith('version')));
  check('  so the board is simply unversioned rather than having its frontmatter overwritten',
    written.version === null && versionNumber(note) === null, String(written.version));
  check('  and the write went through, because the hash is what guards a note and still did',
    note.includes('"id": "ddd"'));
}

// ---------------------------------------------------------------------------
// 5. The three diagnoses
// ---------------------------------------------------------------------------
//
// One comparison answers all of them, in `foreignWriteTo`, which is the same
// one the refusal and the pane's mark come off — ADR 0006 says in as many words
// that a second implementation of this question is one that drifts.

const clean = fs.readFileSync(ledger.file, 'utf-8');     // version 2, as archboard left it

{
  // (a) A writer that does not keep the mark. This is what Obsidian, a sync
  //     client and a text editor all look like: the frontmatter is carried
  //     across verbatim, so the number is untouched and the bytes are not.
  fs.writeFileSync(ledger.file, `${clean}\n<!-- somebody else was here -->\n`);
  const foreign = foreignWriteTo(ledger.file, fs.readFileSync(ledger.file));
  check('a foreign write is named rather than inferred: the version stood still and the bytes moved',
    foreign?.versionMove === 'unchanged' && foreign.expectedVersion === 2 && foreign.actualVersion === 2,
    JSON.stringify({ move: foreign?.versionMove, ours: foreign?.expectedVersion, theirs: foreign?.actualVersion }));

  let refusal = null;
  try {
    writeBoardContent(ledger, contentOf(box('aaa', 10)), { saveCommand: 'board save' });
  } catch (error) {
    refusal = error.conflict ?? null;
  }
  check('  and the refusal says which side is ahead, not only that the two differ',
    refusal?.versionMove === 'unchanged' && /does not keep that mark/.test(refusal?.message ?? ''),
    refusal?.message?.split('\n')[2]);
  check('  with both numbers as data, so a surface can say it in its own words',
    refusal?.expectedVersion === 2 && refusal?.actualVersion === 2);

  // (b) A revert, or a pull that brought an older note back. Same bytes-differ
  //     answer from the hash; a number is the only thing that can tell this
  //     from an ordinary edit.
  const older = clean.replace(/^version: 2$/m, 'version: 1');
  fs.writeFileSync(ledger.file, older);
  const back = foreignWriteTo(ledger.file, fs.readFileSync(ledger.file));
  check('a note that has gone backwards is a revert, which no equality check can see',
    back?.versionMove === 'behind' && back.actualVersion === 1 && back.expectedVersion === 2,
    JSON.stringify({ move: back?.versionMove, theirs: back?.actualVersion }));

  // (c) Another archboard over the same vault. It keeps the counter, so the
  //     note is ahead and by a number that means something.
  const theirs = clean.replace(/^version: 2$/m, 'version: 5').replace('"x": 10', '"x": 44');
  fs.writeFileSync(ledger.file, theirs);
  const ahead = foreignWriteTo(ledger.file, fs.readFileSync(ledger.file));
  check('a note another archboard has written is ahead, and says by how many writes',
    ahead?.versionMove === 'ahead' && ahead.actualVersion === 5 && ahead.expectedVersion === 2,
    JSON.stringify({ move: ahead?.versionMove, theirs: ahead?.actualVersion }));

  check('a side with no number to order by says so rather than guessing',
    versionMove(null, 5) === 'unknown' && versionMove(2, null) === 'unknown');
}

// ---------------------------------------------------------------------------
// 6. TASK-062's mark says which side is newer, from the same comparison
// ---------------------------------------------------------------------------
//
// The mark's whole subject is a note being ahead of what a pane holds, and
// until now it could say only that the note was not this board. It comes off
// `foreignWriteTo` like the refusal does, so it improved by the refusal
// improving rather than by a second answer being written.

{
  forgetNoteWatch();
  const mark = noteWrittenElsewhere(ledgerKey);
  check('the mark on a board somebody else wrote now says which side is ahead',
    mark?.versionMove === 'ahead' && mark.version === 5 && mark.ourVersion === 2,
    JSON.stringify({ move: mark?.versionMove, theirs: mark?.version, ours: mark?.ourVersion }));
  check('  in the same sentence the refusal uses, because there is one comparison',
    /another archboard wrote it 3 time\(s\)/.test(mark?.message ?? ''),
    mark?.message?.split('\n')[1]);

  fs.writeFileSync(ledger.file, `${clean}\n<!-- somebody else was here -->\n`);
  forgetNoteWatch();
  const foreign = noteWrittenElsewhere(ledgerKey);
  check('  and over a foreign writer it says that instead, which is a different answer',
    foreign?.versionMove === 'unchanged' && /does not keep that mark/.test(foreign?.message ?? ''));
}

boardStore.delete(ledgerKey);
forgetNoteWatch();

// ---------------------------------------------------------------------------
// 7. Over a real canvas: the fingerprint, and the precondition
// ---------------------------------------------------------------------------

const serverVault = fs.mkdtempSync(join(os.tmpdir(), 'archboard-version-live-'));

const server = spawn(process.execPath, [src('server.ts')], {
  env: {
    ...process.env, PORT: String(PORT), HOST: '127.0.0.1',
    ARCHBOARD_VAULT: serverVault, LOG_LEVEL: 'error'
  },
  stdio: ['ignore', 'ignore', 'ignore']
});

const api = async (method, url, body) => {
  const response = await fetch(`${base}${withDoing(url, method, 'checking what a board is at')}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const cli = (args) => spawnSync(process.execPath, [src('bin.ts'), ...args], {
  encoding: 'utf-8',
  input: '',
  env: {
    ...process.env,
    EXPRESS_SERVER_URL: base,
    EXCALIDRAW_NO_AUTOSTART: '1',
    ARCHBOARD_VAULT: serverVault,
    LOG_LEVEL: 'error'
  }
});

const up = async () => {
  for (let i = 0; i < 120; i += 1) {
    try { if ((await fetch(`${base}/health`)).ok) return true; } catch { /* not yet */ }
    await sleep(100);
  }
  return false;
};

try {
  if (!check('the canvas comes up', await up())) throw new Error('no canvas');
  await api('POST', '/api/boards/new', { board: 'payments' });

  // --- the write says what it produced ------------------------------------

  const first = await api('POST', '/api/elements?board=payments', box('one', 10));
  check('a write answers with the version it produced, so a writer never has to ask',
    first.body?.fingerprint?.version === 1, JSON.stringify(first.body?.fingerprint));
  const noteFile = join(serverVault, 'payments.excalidraw.md');
  check('  and that is the version in the vault, not the one before the write',
    versionOfNoteAt(noteFile) === 1, String(versionOfNoteAt(noteFile)));
  check('  and the hash beside it is the hash of the bytes on disk',
    first.body?.fingerprint?.note === hashBoardBytes(fs.readFileSync(noteFile)),
    first.body?.fingerprint?.note);

  const second = await api('POST', '/api/elements?board=payments', box('two', 200));
  check('the next write moves it on by one', second.body?.fingerprint?.version === 2,
    JSON.stringify(second.body?.fingerprint));

  const info = await api('GET', '/api/boards/info?board=payments');
  check('and a board says which version it is at without being written to',
    info.body?.version === 2, JSON.stringify(info.body?.version));

  // --- a writer states what it was editing --------------------------------

  const kept = await api('POST', '/api/elements?board=payments&expectVersion=2', box('three', 400));
  check('a write against the version the board is at goes through',
    kept.status === 200 && kept.body?.fingerprint?.version === 3,
    `${kept.status} ${JSON.stringify(kept.body?.fingerprint)}`);

  const before = fs.readFileSync(noteFile);
  const stale = await api('POST', '/api/elements?board=payments&expectVersion=2', box('four', 600));
  check('a write against a version the board has moved past is refused',
    stale.status === 409 && stale.body?.code === 'BOARD_VERSION_CONFLICT',
    `${stale.status} ${stale.body?.code}`);
  check('  naming both versions, so the writer knows what it was and what it is',
    stale.body?.versionConflict?.expected === 2 && stale.body?.versionConflict?.actual === 3,
    JSON.stringify({ expected: stale.body?.versionConflict?.expected, actual: stale.body?.versionConflict?.actual }));
  check('  and saying by how many writes somebody else got there first',
    /1 time\(s\)/.test(stale.body?.error ?? ''), stale.body?.error?.split('\n')[1]);
  const staleRead = await api('GET', '/api/elements?board=payments');
  const staleInfo = await api('GET', '/api/boards/info?board=payments');
  check('  with the current document in the refusal, not a second read left to make',
    Array.isArray(stale.body?.document) &&
    JSON.stringify(stale.body.document) === JSON.stringify(staleRead.body?.elements),
    `${stale.body?.document?.length ?? 'no'} refusal / ${staleRead.body?.elements?.length ?? 'no'} read`);
  check('  and the current version beside that document',
    stale.body?.version === 3 && stale.body.version === staleInfo.body?.version,
    `${String(stale.body?.version)} / ${String(staleInfo.body?.version)}`);
  check('  with nothing written', fs.readFileSync(noteFile).equals(before));
  check('  and the board left saving, because a precondition is not a conflict on the note',
    (await api('GET', '/api/boards/info?board=payments')).body?.held === undefined);

  const nonsense = await api('POST', '/api/elements?board=payments&expectVersion=soon', box('five', 800));
  check('an expectation that is not a number is refused rather than dropped',
    nonsense.status === 400 && nonsense.body?.code === 'BAD_EXPECTED_VERSION',
    `${nonsense.status} ${nonsense.body?.code}`);

  await api('POST', '/api/boards/new', { board: 'fresh' });
  const unwritten = await api('POST', '/api/elements?board=fresh&expectVersion=0', box('six', 10));
  check('a board with no note yet is at no version, and a writer that says so is right',
    unwritten.status === 200 && unwritten.body?.fingerprint?.version === 1,
    `${unwritten.status} ${JSON.stringify(unwritten.body?.fingerprint)}`);

  // The whole point of putting the check at the write boundary rather than in
  // each route: the boundary is what knows a request is a board write, so a
  // route nobody thought about is covered.
  const batch = await api('POST', '/api/elements/batch?board=payments&expectVersion=1',
    { elements: [box('seven', 10)] });
  check('the precondition is on the write boundary, so it covers a route it was not written for',
    batch.status === 409 && batch.body?.code === 'BOARD_VERSION_CONFLICT', `${batch.status}`);

  // --- and from the command line ------------------------------------------

  const said = ['--doing', 'adding a box against a version'];
  const shape = (x) => ['add', '--board', 'payments', '--one',
    JSON.stringify({ type: 'rectangle', x, y: 10, width: 60, height: 40 })];
  const at = versionOfNoteAt(noteFile);
  const ok = cli([...shape(900), '--expect-version', String(at), ...said]);
  check('the command line can state it too', ok.status === 0, ok.stderr?.trim()?.split('\n')[0]);
  const refused = cli([...shape(950), '--expect-version', String(at), ...said]);
  check('  and is refused on the next one, having moved the board on itself',
    refused.status !== 0 && /version/.test(refused.stderr ?? ''),
    `${refused.status} ${refused.stderr?.trim()?.split('\n')[0]}`);
  check('  printing the unchanged reason before the attached board on the CLI',
    (refused.stderr ?? '').indexOf('Refusing to write') >= 0 &&
    (refused.stderr ?? '').indexOf('Refusing to write') < (refused.stderr ?? '').indexOf('"document"') &&
    (refused.stderr ?? '').includes(`"version": ${at + 1}`),
    refused.stderr?.trim()?.split('\n')[0]);
  const mistyped = cli([...shape(10), '--expect-version', 'latest', ...said]);
  check('  and a mistyped one is a usage error rather than a write with no precondition',
    mistyped.status === 2 && /--expect-version takes a whole number/.test(mistyped.stderr ?? ''),
    `${mistyped.status} ${mistyped.stderr?.trim()?.split('\n')[0]}`);

  // --- the canvas fills it in, and the caller carries nothing -------------
  //
  // The half that makes this a mechanism rather than a note in a document. Not
  // one of these writes says a version; the canvas checks them because it
  // remembers what it told the writer, and the writer is the claim.

  await api('POST', '/api/boards/new', { board: 'claimed' });
  const claimedFile = join(serverVault, 'claimed.excalidraw.md');
  await api('POST', '/api/elements?board=claimed', box('ten', 10));
  const claim = await api('POST', '/api/boards/claim',
    { board: 'claimed', reason: 'redrawing the claimed board' });
  check('taking a board tells the agent what version it is at, so the count starts somewhere',
    claim.body?.version === 1, JSON.stringify(claim.body?.version));

  const underClaim = await api('POST', '/api/elements?board=claimed', box('eleven', 200));
  check('a write under the claim is checked against that, and it matches',
    underClaim.status === 200 && underClaim.body?.fingerprint?.version === 2,
    `${underClaim.status} ${JSON.stringify(underClaim.body?.fingerprint)}`);

  // Another archboard over the same vault: it keeps the count, so the note goes
  // forward under us. Nothing tells this canvas.
  const mine = fs.readFileSync(claimedFile, 'utf-8');
  fs.writeFileSync(claimedFile, mine.replace(/^version: 2$/m, 'version: 4').replace('"x": 200', '"x": 260'));

  const carriedNothing = await api('POST', '/api/elements?board=claimed', box('twelve', 400));
  check('and a write after somebody else got there is refused, with the caller saying nothing at all',
    carriedNothing.status === 409 && carriedNothing.body?.code === 'BOARD_VERSION_CONFLICT',
    `${carriedNothing.status} ${carriedNothing.body?.code}`);
  check('  naming what this writer was working from and what the board is at',
    carriedNothing.body?.versionConflict?.expected === 2 && carriedNothing.body?.versionConflict?.actual === 4,
    JSON.stringify({ was: carriedNothing.body?.versionConflict?.expected, is: carriedNothing.body?.versionConflict?.actual }));
  check('  and telling it once: the refusal is itself a telling, so it is not wedged on one stale read',
    /only one you get/.test(carriedNothing.body?.error ?? ''));

  const after = await api('POST', '/api/elements?board=claimed&expectVersion=4', box('thirteen', 500));
  check('  its next write goes against what it was just told', after.status === 409 || after.status === 200,
    `${after.status}`);
  check('  and by then it is the hash refusing, because those really were somebody else\'s bytes',
    after.body?.conflict?.reason === 'changed', String(after.body?.conflict?.reason));
  await api('POST', '/api/boards/claim/release', { board: 'claimed' });

  // --- a client that lives long enough remembers for itself ---------------
  //
  // The other identity. An MCP server is one process serving one agent session,
  // so what it was told an hour ago is what this agent last saw. Driven here
  // through the same module that server drives.

  const client = await import(src('core/canvas-client.ts'));
  const { setRequestedBoard, setWriteDoing, setExpectedVersion, applyElementChanges, forgetVersionsSeen } = client;
  forgetVersionsSeen();
  setExpectedVersion(null);
  setWriteDoing('driving the client the way an MCP server does');
  setRequestedBoard('remembered');
  await api('POST', '/api/boards/new', { board: 'remembered' });
  const rememberedFile = join(serverVault, 'remembered.excalidraw.md');

  const firstCall = await applyElementChanges({ upserts: [box('r1', 10)] });
  check('a long-lived client is told the version by the write it just made',
    firstCall.fingerprint?.version === 1, JSON.stringify(firstCall.fingerprint));

  const secondCall = await applyElementChanges({ upserts: [box('r2', 200)] });
  check('  and its next write is checked against it without the agent naming one',
    secondCall.fingerprint?.version === 2, JSON.stringify(secondCall.fingerprint));

  const theirs = fs.readFileSync(rememberedFile, 'utf-8');
  fs.writeFileSync(rememberedFile, theirs.replace(/^version: 2$/m, 'version: 6').replace('"x": 200', '"x": 280'));
  let refusedClient = null;
  try {
    await applyElementChanges({ upserts: [box('r3', 400)] });
  } catch (error) {
    refusedClient = error;
  }
  check('  so a write built on what it saw two calls ago is refused, with nothing threaded through the agent',
    refusedClient?.code === 'BOARD_VERSION_CONFLICT', String(refusedClient?.code ?? 'not refused'));
  check('  and the client error keeps that response document and version for either surface to print',
    refusedClient?.refusal?.version === 6 &&
    refusedClient?.refusal?.document?.some(element => element.id === 'r2' && element.x === 280),
    JSON.stringify({ version: refusedClient?.refusal?.version, count: refusedClient?.refusal?.document?.length }));
  check('  and it learns the real version from the refusal, so it is not stuck repeating it',
    client.currentExpectedVersion() === 6, String(client.currentExpectedVersion()));

  setExpectedVersion(2);
  check('a version the caller states beats the one the client remembers',
    client.currentExpectedVersion() === 2, String(client.currentExpectedVersion()));
  setExpectedVersion(null);
  forgetVersionsSeen();
  setRequestedBoard(null);
  setWriteDoing(null);

  // --- a person is never refused ------------------------------------------
  //
  // ADR 0016 in as many words: no agent may make a 75-inch display stop
  // responding to the person standing at it. Their gesture took the board at
  // its leading edge and their report is a delta on a note read a moment ago,
  // so there is nothing here to protect them from and everything to lose.

  const person = await fetch(`${base}/api/elements/changes?board=payments&expectVersion=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upserts: [box('theirs', 700)], deletes: [], clientId: 'pane-1-somebody' })
  });
  check('a person\'s change report is never version-refused, even carrying a stale one',
    person.status === 200, String(person.status));
  check('  and is not made to say what it is doing either, which is the same line drawn twice',
    (await person.json())?.success === true);

  // --- 8. the hash still decides ------------------------------------------
  //
  // The one that matters most, because it is the thing this feature could
  // quietly break. A foreign editor carries frontmatter across verbatim, so it
  // leaves the version exactly where archboard left it — and a writer whose
  // expectation therefore *passes* must still be refused. Read the version
  // alone, archboard would conclude nothing had happened and overwrite.

  await api('POST', '/api/boards/new', { board: 'shared' });
  await api('POST', '/api/elements?board=shared', box('eight', 10));
  const sharedFile = join(serverVault, 'shared.excalidraw.md');
  const ours = fs.readFileSync(sharedFile, 'utf-8');
  fs.writeFileSync(sharedFile, `${ours}\n<!-- Obsidian was here -->\n`);
  check('a foreign edit leaves the version exactly where archboard left it',
    versionOfNoteAt(sharedFile) === 1, String(versionOfNoteAt(sharedFile)));

  const overwritten = await api('POST', '/api/elements?board=shared&expectVersion=1', box('nine', 200));
  check('so a write whose expectation passes is refused all the same, by the hash',
    overwritten.status === 409 && overwritten.body?.conflict?.reason === 'changed',
    `${overwritten.status} ${overwritten.body?.conflict?.reason ?? overwritten.body?.code}`);
  check('  and the refusal names the foreign writer, which is what the version added to it',
    overwritten.body?.conflict?.versionMove === 'unchanged' &&
    /does not keep that mark/.test(overwritten.body?.conflict?.message ?? ''),
    overwritten.body?.conflict?.versionMove);
  check('  with their note untouched: nothing was written over it',
    fs.readFileSync(sharedFile, 'utf-8').includes('Obsidian was here'));
} finally {
  server.kill();
  fs.rmSync(vault, { recursive: true, force: true });
  fs.rmSync(serverVault, { recursive: true, force: true });
}

if (failures > 0) {
  console.log(`\nversion: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`\nversion: ${checks} checks. A board says which edit it is, a writer says which one it ` +
  'was editing, and the hash still decides.');

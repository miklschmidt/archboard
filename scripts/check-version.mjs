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

// Before any import: `src/core/config.ts` reads the vault once, at load.
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

const {
  makeIdentity, vaultPathFor, noteVersion, versionNumber, versionMove, versionOfNoteAt
} = await import(src('core/board.ts'));
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
  const first = writeBoardContent(ledger, contentOf(box('aaa', 10)));
  const note = fs.readFileSync(ledger.file, 'utf-8');
  check('the first write archboard makes to a note starts the count at 1', first.version === 1,
    String(first.version));
  check('  written into the frontmatter as a plain key, beside board, variant and level',
    /^version: 1$/m.test(note) && /^board: ledger$/m.test(note) && /^level: service$/m.test(note),
    note.slice(0, note.indexOf('---', 4)).replace(/\n/g, ' | '));
  check('  and read back off the note as the number it is', readNote(ledger.file).version === 1);

  const second = writeBoardContent(ledger, contentOf(box('aaa', 10), box('bbb', 200)));
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
  const again = writeBoardContent(ledger, contentOf(box('aaa', 10), box('bbb', 200)));
  const after = fs.readFileSync(ledger.file);
  check('writing the same board again leaves the note byte-identical', before.equals(after),
    `${before.length} then ${after.length}`);
  check('  so the version does not move, and two saves still produce one document',
    again.version === 2, String(again.version));
}

// ---------------------------------------------------------------------------
// 3. Somebody's own `version` key is not archboard's to take
// ---------------------------------------------------------------------------

{
  const identity = makeIdentity({ board: 'theirs' });
  const { board } = getOrCreateBoard(identity);
  board.file = vaultPathFor(identity);
  writeBoardContent(board, contentOf(box('ccc', 10)));
  // Their key, in their frontmatter, holding something that is not a count.
  const theirs = fs.readFileSync(board.file, 'utf-8').replace(/^version: 1$/m, 'version: second draft');
  fs.writeFileSync(board.file, theirs);
  recordBaseline(board, board.file, hashBoardBytes(fs.readFileSync(board.file)), null);

  const written = writeBoardContent(board, contentOf(box('ccc', 10), box('ddd', 200)));
  const note = fs.readFileSync(board.file, 'utf-8');
  check('a `version` key holding something that is not a count is left exactly as it is',
    /^version: second draft$/m.test(note), note.split('\n').find((l) => l.startsWith('version')));
  check('  so the board is simply unversioned rather than having its frontmatter overwritten',
    written.version === null && noteVersion(note).kind === 'foreign', String(written.version));
  check('  and the write went through, because the hash is what guards a note and still did',
    note.includes('"id": "ddd"'));
}

// ---------------------------------------------------------------------------
// 4. The three diagnoses
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
    writeBoardContent(ledger, contentOf(box('aaa', 10)));
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
// 5. TASK-062's mark says which side is newer, from the same comparison
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
// 6. Over a real canvas: the fingerprint, and the precondition
// ---------------------------------------------------------------------------

const PORT = 39300 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${PORT}`;
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
    stale.body?.conflict?.expected === 2 && stale.body?.conflict?.actual === 3,
    JSON.stringify({ expected: stale.body?.conflict?.expected, actual: stale.body?.conflict?.actual }));
  check('  and saying by how many writes somebody else got there first',
    /1 time\(s\)/.test(stale.body?.error ?? ''), stale.body?.error?.split('\n')[1]);
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
  const mistyped = cli([...shape(10), '--expect-version', 'latest', ...said]);
  check('  and a mistyped one is a usage error rather than a write with no precondition',
    mistyped.status === 2 && /--expect-version takes a whole number/.test(mistyped.stderr ?? ''),
    `${mistyped.status} ${mistyped.stderr?.trim()?.split('\n')[0]}`);

  // --- 7. the hash still decides ------------------------------------------
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

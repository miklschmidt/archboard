#!/usr/bin/env bun

// One writer at a time, per board (ADR 0016, TASK-067).
//
// Four things have to be true and only one of them is about a single process.
//
// A board has a mutex, and asking for it either gets you the board or tells you
// who has it. That is the whole interface, so it is the whole test surface:
// nothing below reaches past `withBoardLock`, `holdBoard` and `releaseHold` to
// poke at a lock file, because a caller cannot either.
//
// It is a lease and not a flag, so a holder that dies costs one lease rather
// than the board. Proved by holding with a lease measured in milliseconds and
// never releasing it.
//
// It lives beside the note rather than in a process, because more than one
// canvas may serve one vault and a lock held in memory does not exist to the
// other one. Proved with two processes, not with two objects — an in-process
// mutex would pass every other test in this file.
//
// And it is a broadcast as well as a guard, so a pane learns a board is held
// before somebody touches it rather than after their write is refused. Proved
// on a real socket against a real canvas. The half of that which lives in the
// browser — a pane going read-only, and a pane that has lost its socket
// assuming the board is held — is in `check-live-session.mjs`, where there is
// a renderer to ask.

import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const src = (p) => join(repoRoot, 'src', p);

let failures = 0;
let checks = 0;
const check = (label, condition, detail = '') => {
  checks += 1;
  if (condition) return true;
  failures += 1;
  console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  return false;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const vault = fs.mkdtempSync(join(os.tmpdir(), 'archboard-lock-'));
process.env.ARCHBOARD_VAULT = vault;

const {
  BoardHeldError, boardLockState, holdBoard, onBoardLockChanged, releaseHold, withBoardLock
} = await import(src('core/board-lock.ts'));
const { LOCK_FREE_LINGER_MS, LOCK_LEASE_MS, LOCK_RENEW_MS, LOCK_WAIT_CAP_MS } =
  await import(src('core/timing.ts'));

const agent = (id) => ({ id, kind: 'agent' });
const person = (id) => ({ id, kind: 'human' });

// The refusal, caught as the thing it is rather than as a message.
const refusal = async (promise) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
};

// ─── 1. Ask to write a board, and either write it or learn who holds it ────

{
  const board = 'one-interface';

  let ran = 0;
  const answer = await withBoardLock({ board, holder: agent('first') }, () => { ran += 1; return 'written'; });
  check('a free board is written', answer === 'written' && ran === 1, `${answer} / ran ${ran}`);
  check('  and the lock is given back afterwards', boardLockState(board) === null,
    JSON.stringify(boardLockState(board)));

  // Somebody standing on it, so the next caller gets the other answer.
  const held = await holdBoard({ board, holder: person('the-wall'), waitMs: 0 });
  check('a hold reports itself as the one that took it', held.created === true && held.holder.id === 'the-wall');

  const denied = await refusal(withBoardLock({ board, holder: agent('second'), waitMs: 120 }, () => { ran += 1; }));
  check('a board somebody else holds is not written',
    denied instanceof BoardHeldError && ran === 1, `${denied?.name} / ran ${ran}`);
  check('  and the refusal says who has it, as data',
    denied?.holder?.id === 'the-wall' && denied?.holder?.kind === 'human',
    JSON.stringify(denied?.holder));
  check('  and since when, in a sentence somebody can say out loud',
    /held by the person at the canvas, since \d\d:\d\d:\d\d \(\d+\.\d s\)/.test(denied?.message ?? ''),
    denied?.message);
  check('  and it waited rather than failing straight away',
    denied.waitedMs >= 100, `${denied?.waitedMs} ms`);

  // The same holder is not somebody else. This is what makes one gesture's hold
  // cover the write that gesture produces.
  const again = await holdBoard({ board, holder: person('the-wall'), waitMs: 0 });
  check('the holder asking again renews rather than blocking', again.created === false);
  check('  and "since" stays when it was taken, not when it was last renewed',
    again.holder.since === held.holder.since, `${held.holder.since} -> ${again.holder.since}`);
  check('  and the lease moved forward', Date.parse(again.holder.until) > Date.parse(held.holder.until));

  await withBoardLock({ board, holder: person('the-wall') }, () => { ran += 1; });
  check('a write by the holder runs, and does not release the hold it joined',
    ran === 2 && boardLockState(board)?.id === 'the-wall', `ran ${ran} / ${boardLockState(board)?.id}`);

  check('releasing is only for the holder', releaseHold(board, 'somebody-else') === false);
  check('  and the board is still theirs', boardLockState(board)?.id === 'the-wall');
  check('the holder can give it back', releaseHold(board, 'the-wall') === true);
  check('  and then it is free', boardLockState(board) === null);
}

// ─── 2. A holder that dies has its lease expire ────────────────────────────

{
  const board = 'a-lease-not-a-flag';
  // Held and never released: the shape a crash leaves behind.
  await holdBoard({ board, holder: agent('the-departed'), leaseMs: 120, waitMs: 0 });
  check('a lease is held while it runs', boardLockState(board)?.id === 'the-departed');

  const early = await refusal(holdBoard({ board, holder: agent('the-next'), waitMs: 0 }));
  check('  and nobody else gets in meanwhile', early instanceof BoardHeldError);

  const took = await holdBoard({ board, holder: agent('the-next'), waitMs: 1000 });
  check('a holder that never came back does not wedge the board',
    took.created === true && took.holder.id === 'the-next', JSON.stringify(took));
  releaseHold(board, 'the-next');

  check('the lease clears the report debounce plus a write, with room',
    LOCK_LEASE_MS >= 400 * 2,
    `LOCK_LEASE_MS ${LOCK_LEASE_MS}`);
  check('an agent waiting on a crashed holder outlasts the lease rather than timing out first',
    LOCK_WAIT_CAP_MS > LOCK_LEASE_MS,
    `wait ${LOCK_WAIT_CAP_MS} vs lease ${LOCK_LEASE_MS}`);
}

// ─── 3. An agent waits, because the expected wait is short ─────────────────

{
  const board = 'waiting';
  await holdBoard({ board, holder: person('a-hand'), leaseMs: 2000, waitMs: 0 });
  setTimeout(() => releaseHold(board, 'a-hand'), 250);

  const started = Date.now();
  const got = await holdBoard({ board, holder: agent('patient'), waitMs: 2000 });
  const waited = Date.now() - started;
  check('an agent waits for a hand rather than failing at it',
    got.created === true && waited >= 200 && waited < 1200, `${waited} ms`);
  releaseHold(board, 'patient');
}

// ─── 4. Nothing that cannot be read holds a board ──────────────────────────

{
  const board = 'unreadable';
  await holdBoard({ board, holder: agent('writer'), waitMs: 0 });
  const file = join(vault, '.archboard', 'locks', 'unreadable.lock');
  check('the lock is a file in the vault, where a second canvas can see it', fs.existsSync(file), file);
  fs.writeFileSync(file, '{ half a rec');

  const after = await holdBoard({ board, holder: agent('later'), waitMs: 0 });
  check('a lock file nothing can read does not wedge the board forever', after.created === true);
  releaseHold(board, 'later');
}

// ─── 5. One board is one lock, however it was spelled ──────────────────────

{
  await holdBoard({ board: 'Payments', holder: agent('upper'), waitMs: 0 });
  const clash = await refusal(holdBoard({ board: 'payments', holder: agent('lower'), waitMs: 0 }));
  check('two spellings of one board are one lock (ADR 0010)', clash instanceof BoardHeldError,
    `${clash?.name}`);
  releaseHold('payments', 'upper');

  await holdBoard({ board: 'systems/payments', holder: agent('nested'), waitMs: 0 });
  check('a nested board name is one lock file rather than a directory to create',
    fs.existsSync(join(vault, '.archboard', 'locks', 'systems%2Fpayments.lock')));
  releaseHold('systems/payments', 'nested');
}

// ─── 6. The lock is a broadcast, not only a guard ──────────────────────────

{
  const news = [];
  onBoardLockChanged((board, holder) => news.push({ board, held: holder !== null, id: holder?.id ?? null }));
  const board = 'broadcast';

  await holdBoard({ board, holder: person('a-pane'), waitMs: 0 });
  check('taking a board is news immediately',
    news.at(-1)?.board === board && news.at(-1)?.held === true && news.at(-1)?.id === 'a-pane',
    JSON.stringify(news.at(-1)));

  const beforeRenew = news.length;
  await holdBoard({ board, holder: person('a-pane'), waitMs: 0 });
  check('  and renewing is not, because nothing a pane acts on changed', news.length === beforeRenew);

  releaseHold(board, 'a-pane');
  check('giving it back is not news straight away', news.at(-1)?.held === true);
  await sleep(LOCK_FREE_LINGER_MS + 150);
  check('  it is news once the board has stayed free', news.at(-1)?.held === false, JSON.stringify(news.at(-1)));

  // A fan-out — one agent action that is still several writes (TASK-083) —
  // must not flick every pane in and out of read-only once per element. Eight
  // writes are eight different holders, so eight of these say "held, by someone
  // else again", which a pane already read-only does nothing with. What must
  // not appear between them is a "free": that is the flicker.
  const before = news.length;
  for (let i = 0; i < 8; i += 1) {
    await withBoardLock({ board, holder: agent(`fan-${i}`) }, () => { });
  }
  await sleep(LOCK_FREE_LINGER_MS + 150);
  const since = news.slice(before);
  const flips = since.filter((item, at) => at > 0 && item.held !== since[at - 1].held).length;
  check('eight writes in a row take a pane out of read-only once, at the end',
    flips === 1 && since.at(-1).held === false,
    `${flips} changes of state across ${since.length} messages`);

  onBoardLockChanged(null);
}

// ─── 7. Two processes over one vault exclude each other ────────────────────
//
// The one thing an in-process mutex could not do. The child below is a second
// archboard reading the same vault; nothing about this process's memory is
// visible to it, so the only thing that can keep them apart is the file.

{
  const board = 'two-canvases';
  const script = join(vault, 'holder.mjs');
  fs.writeFileSync(script, `
    process.env.ARCHBOARD_VAULT = ${JSON.stringify(vault)};
    const { holdBoard, releaseHold } = await import(${JSON.stringify(src('core/board-lock.ts'))});
    const hold = await holdBoard({ board: ${JSON.stringify(board)}, holder: { id: 'other-canvas', kind: 'agent' }, waitMs: 0 });
    console.log(JSON.stringify({ took: hold.created, process: hold.holder.process }));
    setTimeout(() => { releaseHold(${JSON.stringify(board)}, 'other-canvas'); process.exit(0); }, 700);
  `);

  const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'inherit'] });
  const announced = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const line = out.split('\n').find((l) => l.trim().startsWith('{'));
      if (line) resolve(JSON.parse(line));
    });
    child.on('exit', () => reject(new Error(`the second canvas said nothing: ${out}`)));
  });
  check('a second process over the same vault takes the board', announced.took === true);

  const shut = await refusal(holdBoard({ board, holder: agent('this-canvas'), waitMs: 0 }));
  check('and this one is kept out of it', shut instanceof BoardHeldError, shut?.message);
  check('  by a holder it can see is somewhere else',
    shut?.holder?.process === announced.process && shut.holder.process !== `${os.hostname()}:${process.pid}`,
    `${shut?.holder?.process} vs ${os.hostname()}:${process.pid}`);
  check('  and the refusal says so rather than reading as a bug in this one',
    /on another canvas \(/.test(shut?.message ?? ''), shut?.message);

  const eventually = await holdBoard({ board, holder: agent('this-canvas'), waitMs: 3000 });
  check('and gets the board when the other one is done', eventually.created === true);
  releaseHold(board, 'this-canvas');
  child.kill();
}

// ─── 8. Through a canvas: the routes, the refusal and the broadcast ────────

const PORT = 39400 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${PORT}`;

const server = spawn(process.execPath, [src('server.ts')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'inherit']
});

const api = async (method, url, body) => {
  const response = await fetch(`${base}${url}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

/**
 * A hand that has not stopped moving.
 *
 * A pane renews while a gesture runs, which is what carries a hold across a
 * drag longer than the lease. Without it every hold below would simply lapse
 * after LOCK_LEASE_MS and an agent would get the board without anybody having
 * been excluded from anything — a check that renewed nothing would have looked
 * green for the wrong reason, and did, until this was written.
 */
const renewing = (clientId) => {
  const timer = setInterval(() => {
    void api('POST', '/api/boards/hold?board=scratch', { clientId });
  }, LOCK_RENEW_MS);
  return () => clearInterval(timer);
};

const up = async () => {
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(`${base}/health`)).ok) return true;
    } catch { /* not yet */ }
    await sleep(100);
  }
  return false;
};

try {
  if (!check('the canvas comes up', await up())) throw new Error('no canvas');

  const PANE = 'pane-left-abc';
  const heard = [];
  const socket = new WebSocket(`ws://127.0.0.1:${PORT}/?clientId=${PANE}`);
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'board_lock') heard.push(message);
  });
  await new Promise((resolve) => socket.on('open', resolve));
  await sleep(300);

  check('a pane is told where its board stands the moment it connects',
    heard.length === 1 && heard[0].board === 'scratch' && heard[0].held === false,
    JSON.stringify(heard));

  // The message a change report cannot be: the leading edge of a gesture.
  const took = await api('POST', '/api/boards/hold?board=scratch', { clientId: PANE });
  check('a pane can take the board at the first change of a gesture',
    took.status === 200 && took.body?.holder?.kind === 'human', JSON.stringify(took.body));
  await sleep(150);
  check('  and every pane on that board is told, before anybody touches it',
    heard.at(-1)?.held === true && heard.at(-1)?.holder?.id === PANE, JSON.stringify(heard.at(-1)));

  // The write that gesture produces joins the hold rather than fighting it.
  const own = await api('POST', '/api/elements/changes?board=scratch', {
    clientId: PANE,
    upserts: [{ id: 'lk1', type: 'rectangle', x: 10, y: 10, width: 40, height: 40 }],
    deletes: []
  });
  check('the report that gesture produces is not blocked by the gesture\'s own hold',
    own.status === 200, `${own.status} ${JSON.stringify(own.body)?.slice(0, 120)}`);
  check('  and the hold survives it, because the hand may not have stopped',
    (await api('POST', '/api/boards/hold?board=scratch', { clientId: PANE })).body?.created === false);

  // And an agent is kept out for as long as it is willing to wait. The hand
  // keeps moving throughout, because a lease this pane stopped renewing would
  // lapse inside the agent's wait and hand it the board — which is the right
  // behaviour and not the one under test here.
  const stopRenewing = renewing(PANE);
  const started = Date.now();
  const shut = await api('POST', '/api/elements?board=scratch', {
    type: 'rectangle', x: 500, y: 500, width: 50, height: 50
  });
  const waited = Date.now() - started;
  stopRenewing();
  check('an agent writing a board a person is holding is refused, not merged',
    shut.status === 409 && shut.body?.code === 'BOARD_HELD', `${shut.status} ${JSON.stringify(shut.body)?.slice(0, 160)}`);
  check('  after waiting rather than failing at it',
    waited >= LOCK_WAIT_CAP_MS - 200, `${waited} ms against a ${LOCK_WAIT_CAP_MS} ms cap`);
  check('  and it is told who has the board and since when',
    shut.body?.holder?.id === PANE && /held by the person at the canvas, since/.test(shut.body?.error ?? ''),
    shut.body?.error);

  // Reading is never locked, and neither is putting a board on a pane.
  const read = await api('GET', '/api/elements?board=scratch');
  check('reading a held board is not blocked', read.status === 200, `${read.status}`);
  const opened = await api('POST', '/api/boards/open', { board: 'scratch', reload: true });
  check('and neither is opening one, which writes no note', opened.status === 200, `${opened.status}`);

  const gave = await api('POST', '/api/boards/hold/release?board=scratch', { clientId: PANE });
  check('the pane gives the board back once its write has landed', gave.body?.released === true);
  await sleep(LOCK_FREE_LINGER_MS + 300);
  check('  and the panes are told it is free', heard.at(-1)?.held === false, JSON.stringify(heard.at(-1)));

  const now = await api('POST', '/api/elements?board=scratch', {
    type: 'rectangle', x: 500, y: 500, width: 50, height: 50
  });
  check('and then the agent writes it', now.status === 200, `${now.status}`);

  const strangerHeld = await api('POST', '/api/boards/hold?board=scratch', { clientId: 'another-pane' });
  check('a second pane can hold the board when nobody else does', strangerHeld.status === 200);
  const stopStranger = renewing('another-pane');
  const mine = await api('POST', '/api/elements/changes?board=scratch', {
    clientId: PANE,
    upserts: [{ id: 'lk2', type: 'rectangle', x: 90, y: 90, width: 20, height: 20 }],
    deletes: []
  });
  stopStranger();
  check('  and a report from a different pane is refused while it does',
    mine.status === 409 && mine.body?.holder?.id === 'another-pane', `${mine.status}`);
  await api('POST', '/api/boards/hold/release?board=scratch', { clientId: 'another-pane' });

  const unnamed = await api('POST', '/api/boards/hold', { clientId: PANE });
  check('a hold that names no board is refused like every other call (ADR 0009)',
    unnamed.status === 400, `${unnamed.status}`);
  const anonymous = await api('POST', '/api/boards/hold?board=scratch', {});
  check('and so is one that names no holder, because it could never be released',
    anonymous.status === 400, `${anonymous.status}`);

  socket.close();
} finally {
  server.kill();
  await sleep(200);
  fs.rmSync(vault, { recursive: true, force: true });
}

// ─── Report ───────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\nlock: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`lock: ${checks} checks. One writer at a time, across two processes, and the panes are told.`);

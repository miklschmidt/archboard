#!/usr/bin/env bun

// One writer at a time, per board (ADR 0016, TASK-067, TASK-080).
//
// Five things have to be true and only one of them is about a single process.
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
// on a real socket against a real canvas, and on a socket to a *second* canvas
// which nothing sends anything to. The half of that which lives in the
// browser — a pane going read-only, a pane that has lost its socket assuming
// the board is held, and the banner a claim puts up — is in
// `check-live-session.mjs`, where there is a renderer to ask.
//
// And an agent may hold it for longer than one write, without that becoming a
// board nobody else can ever have. Proved by writing twenty times under one
// claim with a rival asking in every gap between them, by letting a claim run
// out, and by taking one back from the canvas the way a person does — which
// leaves every element the agent wrote exactly where it wrote it, because
// revoking is not undoing.

import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { withDoing } from './lib/doing.mjs';

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
  BoardHeldError, boardLockState, claimBoard, claimOn, claimWriterId, holdBoard,
  onBoardLockChanged, releaseClaim, releaseHold, takeClaimRevocation, withBoardLock
} = await import(src('core/board-lock.ts'));
const {
  CLAIM_LEASE_MS, LOCK_FREE_LINGER_MS, LOCK_LEASE_MS, LOCK_RENEW_MS, LOCK_WAIT_CAP_MS, LOCK_WATCH_MS
} = await import(src('core/timing.ts'));

const agent = (id) => ({ id, kind: 'agent' });
const person = (id) => ({ id, kind: 'human' });

/**
 * A take that is meant to succeed.
 *
 * Caught rather than awaited plainly. A lock broken in any of the ways this
 * file exists to notice makes these throw, and a check that dies at the first
 * one reports nothing about the thirty after it — including the two-process
 * section, which is the only thing here an in-process mutex could not pass.
 * Reverting a line and counting what fails needs the count to be honest.
 */
const take = request => holdBoard(request).catch(error => ({ created: false, holder: null, error }));

/**
 * A claim that is meant to succeed, caught for the same reason `take` is.
 *
 * A claim broken in any of the ways this file exists to notice throws, and a
 * check that dies on one reports nothing about the sixty after it — including
 * everything through a canvas and the two-canvas section, which are the only
 * parts of this file an in-process claim register could not pass.
 */
const claiming = request =>
  claimBoard(request).catch(error => ({ created: false, claim: { holder: {} }, error }));
const why = result => (result.error ? result.error.message : JSON.stringify(result));

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
  const held = await take({ board, holder: person('the-wall'), waitMs: 0 });
  check('a hold reports itself as the one that took it',
    held.created === true && held.holder?.id === 'the-wall', why(held));

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
  const again = await take({ board, holder: person('the-wall'), waitMs: 0 });
  check('the holder asking again renews rather than blocking', again.created === false, why(again));
  check('  and "since" stays when it was taken, not when it was last renewed',
    again.holder?.since === held.holder?.since, `${held.holder.since} -> ${again.holder.since}`);
  check('  and the lease moved forward',
    Date.parse(again.holder?.until) > Date.parse(held.holder?.until), why(again));

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
  await take({ board, holder: agent('the-departed'), leaseMs: 120, waitMs: 0 });
  check('a lease is held while it runs', boardLockState(board)?.id === 'the-departed');

  const early = await refusal(holdBoard({ board, holder: agent('the-next'), waitMs: 0 }));
  check('  and nobody else gets in meanwhile', early instanceof BoardHeldError);

  // Caught rather than awaited plainly: a lease that never lapses throws here,
  // and a check that dies at this line reports nothing about the twenty things
  // after it. The failure has to be countable to be a failure.
  const took = await take({ board, holder: agent('the-next'), waitMs: 1000 });
  check('a holder that never came back does not wedge the board',
    took.created === true && took.holder?.id === 'the-next',
    why(took));
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
  await take({ board, holder: person('a-hand'), leaseMs: 2000, waitMs: 0 });
  setTimeout(() => releaseHold(board, 'a-hand'), 250);

  const started = Date.now();
  const got = await take({ board, holder: agent('patient'), waitMs: 2000 });
  const waited = Date.now() - started;
  check('an agent waits for a hand rather than failing at it',
    got.created === true && waited >= 200 && waited < 1200, `${waited} ms, ${why(got)}`);
  releaseHold(board, 'patient');
}

// ─── 4. Nothing that cannot be read holds a board ──────────────────────────

{
  const board = 'unreadable';
  await take({ board, holder: agent('writer'), waitMs: 0 });
  const file = join(vault, '.archboard', 'locks', 'unreadable.lock');
  check('the lock is a file in the vault, where a second canvas can see it', fs.existsSync(file), file);
  // The directory is made rather than assumed, so that a lock which has stopped
  // living in the vault fails the line above and then lets the rest of the file
  // run. It used to throw here and take the two-process section with it, which
  // reported one failure for a change that breaks four things.
  fs.mkdirSync(join(vault, '.archboard', 'locks'), { recursive: true });
  fs.writeFileSync(file, '{ half a rec');

  const after = await take({ board, holder: agent('later'), waitMs: 0 });
  check('a lock file nothing can read does not wedge the board forever',
    after.created === true, why(after));
  releaseHold(board, 'later');
}

// ─── 5. One board is one lock, however it was spelled ──────────────────────

{
  await take({ board: 'Payments', holder: agent('upper'), waitMs: 0 });
  const clash = await refusal(holdBoard({ board: 'payments', holder: agent('lower'), waitMs: 0 }));
  check('two spellings of one board are one lock (ADR 0010)', clash instanceof BoardHeldError,
    `${clash?.name}`);
  releaseHold('payments', 'upper');

  await take({ board: 'systems/payments', holder: agent('nested'), waitMs: 0 });
  check('a nested board name is one lock file rather than a directory to create',
    fs.existsSync(join(vault, '.archboard', 'locks', 'systems%2Fpayments.lock')));
  releaseHold('systems/payments', 'nested');
}

// ─── 6. The lock is a broadcast, not only a guard ──────────────────────────

{
  const news = [];
  onBoardLockChanged((board, holder) => news.push({ board, held: holder !== null, id: holder?.id ?? null }));
  const board = 'broadcast';

  await take({ board, holder: person('a-pane'), waitMs: 0 });
  check('taking a board is news immediately',
    news.at(-1)?.board === board && news.at(-1)?.held === true && news.at(-1)?.id === 'a-pane',
    JSON.stringify(news.at(-1)));

  const beforeRenew = news.length;
  await take({ board, holder: person('a-pane'), waitMs: 0 });
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
    // A real fan-out is eight HTTP requests, so eight trips through the event
    // loop. Without this the eight run as microtasks and every timer in the
    // module fires after the loop rather than between its turns, which would
    // make a linger of nought look exactly like a linger of a second.
    await sleep(5);
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

  const eventually = await take({ board, holder: agent('this-canvas'), waitMs: 3000 });
  check('and gets the board when the other one is done', eventually.created === true, why(eventually));
  releaseHold(board, 'this-canvas');
  child.kill();
}

// ─── 8. A claim: one writer for longer than one write ──────────────────────
//
// The per-write lock fits most of what an agent does and does not fit an agent
// that knows it is about to redraw a board. What has to be true: the claim is
// one hold across every write, it can be extended but not by working, it ends
// on its own, and a person can take it back — but only a claim, because taking
// a board from a write in progress is the two-writers problem arriving through
// the door built to prevent it.

{
  const board = 'a-long-claim';
  const first = await claiming({ board, reason: 'redrawing the payment path', forMs: 30_000 });
  check('an agent can claim a board and say what it is doing',
    first.created === true && first.claim.holder.reason === 'redrawing the payment path',
    JSON.stringify(first.claim));
  check('  and the claim is on the lock itself, not only in this process',
    boardLockState(board)?.claimed === true, JSON.stringify(boardLockState(board)));

  const refused = await refusal(holdBoard({ board, holder: agent('somebody-else'), waitMs: 0 }));
  check('  so a refusal says it is claimed rather than that somebody is mid-write',
    /held by an agent that has claimed it \(redrawing the payment path\)/.test(refused?.message ?? ''),
    refused?.message);

  // The whole point of a claim, and the one thing a per-write lock cannot do.
  // The rival is an agent: a person is *entitled* to take a claimed board, and
  // that is the section below rather than a gap in this one.
  let gaps = 0;
  let reacquired = 0;
  let unwritten = 0;
  for (let i = 0; i < 20; i += 1) {
    const writer = claimWriterId(board);
    if (writer !== first.claim.holder.id) reacquired += 1;
    // Caught, like every other write here: a write that cannot find the claim
    // is refused, and twenty refusals thrown would end this file rather than
    // report a number.
    const wrote = await withBoardLock(
      { board, holder: { id: writer ?? `orphan-${i}`, kind: 'agent' }, waitMs: 0 }, () => true
    ).catch(() => false);
    if (!wrote) unwritten += 1;
    const rival = await refusal(holdBoard({ board, holder: agent(`rival-${i}`), waitMs: 0 }));
    if (!(rival instanceof BoardHeldError)) gaps += 1;
  }
  check('twenty writes under one claim all go through', unwritten === 0, `${unwritten} of 20 refused`);
  check('  and leave no gap another writer could take, in any of the nineteen between them',
    gaps === 0, `${gaps} of 20 gaps`);
  check('  because every one of them is the claim writing, not a new hold',
    reacquired === 0, `${reacquired} writes wrote as somebody else`);
  check('  and the board was never let go and re-taken: one hold, since one moment',
    boardLockState(board)?.since === first.claim.holder.since,
    `${first.claim.holder.since} -> ${boardLockState(board)?.since}`);

  const again = await claiming({ board, reason: 'now the queues', forMs: 40_000 });
  check('claiming again extends rather than starting a second claim',
    again.created === false && again.claim.holder.id === first.claim.holder.id, JSON.stringify(again.claim));
  check('  with the deadline moved and the reason brought up to date',
    Date.parse(again.claim.expires) > Date.parse(first.claim.expires) &&
    boardLockState(board)?.reason === 'now the queues',
    `${first.claim.expires} -> ${again.claim.expires} / ${boardLockState(board)?.reason}`);

  // A person takes it back. Not a refusal to them, and not an undo to the
  // agent: everything it wrote is written, and it finds out at its next act.
  const back = await take({ board, holder: person('a-hand'), waitMs: 0, revokeClaim: true });
  check('a person takes a claimed board back rather than being refused',
    back.created === true && back.holder?.kind === 'human', why(back));
  check('  and the claim is over on this canvas', claimOn(board) === null, JSON.stringify(claimOn(board)));

  const told = takeClaimRevocation(board);
  check('  and the agent is told it lost the board, and by whom',
    told?.by?.id === 'a-hand' && told?.claim?.holder?.reason === 'now the queues', JSON.stringify(told));
  check('  once, because a permanent refusal would wedge the board against it',
    takeClaimRevocation(board) === null);
  releaseHold(board, 'a-hand');
}

{
  // AND IT IS TOLD WHETHER OR NOT THE LEASE HAPPENED TO BE LIVE.
  //
  // A claim runs for ten minutes over a three-second lease the canvas re-takes
  // every second, so the lease not being live for a moment is an ordinary thing
  // under a perfectly live claim: one late renewal on a busy machine does it.
  // Ending the claim used to ride on the same flag that decides whether a
  // person may take a held board, which is rightly a question about the lock
  // record — and with no record to read, the person got the board and the agent
  // was never told. Its next write went through as if nothing had happened,
  // which is the one thing "the agent is told at its next act" may not do
  // sometimes.
  //
  // Both shapes of a lease that is not live, because they reach the taking
  // through different branches: a record whose time has passed, and no record
  // at all where one was tidied away.
  const lockFileFor = (name) => join(vault, '.archboard', 'locks', `${encodeURIComponent(name)}.lock`);

  for (const [how, lapse] of [
    ['a lease whose time has passed', (file) => {
      const stale = JSON.parse(fs.readFileSync(file, 'utf-8'));
      stale.until = new Date(Date.now() - 1000).toISOString();
      fs.writeFileSync(file, JSON.stringify(stale));
    }],
    ['a lease tidied away', (file) => fs.rmSync(file, { force: true })]
  ]) {
    const board = `lapsed-${how.includes('passed') ? 'expired' : 'gone'}`;
    const claim = await claiming({ board, reason: 'redrawing the payment path', forMs: 600_000 });
    check(`a claim over ${how}: the claim is live`, claim.created === true, JSON.stringify(claim.claim));
    lapse(lockFileFor(board));

    const taken = await take({ board, holder: person('a-hand'), waitMs: 0, revokeClaim: true });
    check('  and the person takes the board', taken.created === true && taken.holder?.kind === 'human', why(taken));
    check('  and the claim is over on this canvas', claimOn(board) === null, JSON.stringify(claimOn(board)));
    const told = takeClaimRevocation(board);
    check('  and the agent is still told it lost the board, and by whom',
      told?.by?.id === 'a-hand' && told?.claim?.holder?.reason === 'redrawing the payment path',
      JSON.stringify(told));
    releaseHold(board, 'a-hand');
    releaseClaim(board);
  }
}

{
  // The half that must NOT happen. A person waits out an agent's write — it is
  // twenty milliseconds, and taking the board from a write already running is
  // two writers to one note, which is what the mutex exists instead of.
  const board = 'mid-write';
  const writing = await take({ board, holder: agent('one-write'), waitMs: 0 });
  check('an agent takes the board for one write, unclaimed',
    writing.created === true && !writing.holder?.claimed, why(writing));
  const waited = await refusal(holdBoard({ board, holder: person('a-hand'), waitMs: 120, revokeClaim: true }));
  check('and a person waits that out rather than taking it',
    waited instanceof BoardHeldError && waited.holder?.id === 'one-write', waited?.message);
  check('  and nothing is reported as a lost claim, because there was none',
    takeClaimRevocation(board) === null);
  releaseHold(board, 'one-write');
}

{
  // A claim with nothing happening on it, which is most of a claim: an agent
  // that has just taken a board goes off and reads code before it draws
  // anything. The lease is three seconds and the claim is minutes, so this is
  // the renewal doing the one job the agent cannot do for itself — between two
  // of its commands there is nothing of it left to send a heartbeat.
  const board = 'an-idle-claim';
  const idle = await claiming({ board, reason: 'reading the code first', forMs: 60_000 });
  check('a claim is taken and then nothing at all happens on it', idle.created === true, why(idle));

  // Watched rather than sampled once at the far end. The question is whether
  // the board is held for the whole stretch, and a single look afterwards
  // cannot tell "held throughout" from "lapsed and taken again by something".
  // It also says when it went, which a sample cannot.
  const firstLease = Date.parse(idle.claim.holder.until);
  let lostAt = null;
  let renewals = 0;
  let seenUntil = firstLease;
  while (Date.now() < firstLease + 500) {
    const now = boardLockState(board);
    if (!now || now.id !== idle.claim.holder.id) { lostAt = Date.now(); break; }
    if (Date.parse(now.until) > seenUntil) { renewals += 1; seenUntil = Date.parse(now.until); }
    await sleep(100);
  }
  check('and the board is held for every moment of the lease it was written with',
    lostAt === null,
    lostAt ? `free ${lostAt - Date.parse(idle.claim.holder.since)} ms in, on a ${LOCK_LEASE_MS} ms lease` : '');
  check('  because the canvas kept moving the lease, the agent having done nothing',
    renewals > 0 && boardLockState(board)?.since === idle.claim.holder.since,
    `${renewals} renewals, since ${idle.claim.holder.since} -> ${boardLockState(board)?.since}`);
  const opportunist = await refusal(holdBoard({ board, holder: agent('opportunist'), waitMs: 0 }));
  check('  so nobody was let in while it was quiet', opportunist instanceof BoardHeldError);

  check('and giving it back frees the board',
    releaseClaim(board) !== null && boardLockState(board) === null,
    JSON.stringify(boardLockState(board)));
}

{
  // A claim ends on its own. The lease and its renewal bound a canvas that
  // died; this bounds an agent that walked away, and it is the only bound that
  // does — nothing between two CLI commands is alive to stop renewing.
  const board = 'a-claim-that-ends';
  const brief = await claiming({ board, reason: 'a moment', forMs: CLAIM_LEASE_MS });
  check('a claim is made with a deadline of its own',
    Date.parse(brief.claim.expires) > Date.now(), why(brief));

  const freeAt = Date.now() + CLAIM_LEASE_MS + LOCK_RENEW_MS + 2000;
  while (boardLockState(board) !== null && Date.now() < freeAt) await sleep(100);
  check('and when it runs out the board is free, with nobody having released it',
    boardLockState(board) === null, JSON.stringify(boardLockState(board)));
  check('  and the canvas knows it is no longer holding one', claimOn(board) === null);
  check('  and releasing an expired claim is not an error, it is tidying up late',
    releaseClaim(board) === null);
}

// ─── 9. Through a canvas: the routes, the refusal and the broadcast ────────

const PORT = 39400 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${PORT}`;

const server = spawn(process.execPath, [src('server.ts')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'inherit']
});

const api = async (method, url, body) => {
  // Every write says what it is doing, once for the whole check (TASK-095,
  // scripts/lib/doing.mjs). The refusal itself is proved in check-doing.mjs.
  url = withDoing(url, method, 'checking one writer at a time');
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
  const heldInfo = await api('GET', '/api/boards/info?board=scratch');
  check('  and the refusal carries the document a read returns after the wait',
    Array.isArray(shut.body?.document) &&
    JSON.stringify(shut.body.document) === JSON.stringify(read.body?.elements),
    `${shut.body?.document?.length ?? 'no'} refusal / ${read.body?.elements?.length ?? 'no'} read`);
  check('  with the board version current at that same refusal',
    shut.body?.version === heldInfo.body?.version,
    `${String(shut.body?.version)} / ${String(heldInfo.body?.version)}`);
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

  // ─── The claim, through a canvas ───────────────────────────────────────
  //
  // Section 8 proved the claim against the module. This is the thing an agent
  // actually does: it names a board on an HTTP call, and everything it writes
  // afterwards names the same board and nothing else. Nothing is threaded
  // through, because a CLI agent is a fresh process every command and has
  // nowhere to keep an id.

  const WHY = 'redrawing the payment path';
  const claimed = await api('POST', '/api/boards/claim?board=scratch', { reason: WHY });
  check('an agent claims a board over the API, saying what it is doing',
    claimed.status === 200 && claimed.body?.claim?.holder?.claimed === true &&
    claimed.body?.claim?.holder?.reason === WHY,
    `${claimed.status} ${JSON.stringify(claimed.body)?.slice(0, 160)}`);
  await sleep(200);
  check('  and every pane holding it is told who has it and why, before anybody touches it',
    heard.at(-1)?.held === true && heard.at(-1)?.holder?.claimed === true &&
    heard.at(-1)?.holder?.reason === WHY, JSON.stringify(heard.at(-1)));

  const claimedSince = claimed.body?.claim?.holder?.since;
  // Twenty writes and a rival between every pair of them. The rival is this
  // process, which is a third writer over the same vault and knows nothing
  // about the canvas's claim except what the lock file says — an agent write
  // aimed at the canvas would have *joined* the claim, which is the behaviour
  // under test and would prove nothing about exclusion.
  let gaps = 0;
  let unwritten = 0;
  let slowest = 0;
  for (let i = 0; i < 20; i += 1) {
    const at = Date.now();
    const wrote = await api('POST', '/api/elements?board=scratch', {
      id: `claim-${i}`, type: 'rectangle', x: i * 12, y: 800, width: 10, height: 10
    });
    slowest = Math.max(slowest, Date.now() - at);
    if (wrote.status !== 200) unwritten += 1;
    const rival = await refusal(holdBoard({ board: 'scratch', holder: agent(`rival-${i}`), waitMs: 0 }));
    if (!(rival instanceof BoardHeldError)) gaps += 1;
  }
  check('twenty writes go through under one claim', unwritten === 0, `${unwritten} of 20 refused`);
  // Joining a hold is instant; asking for one somebody else has is the whole
  // wait cap. So this is the difference between a write that recognised the
  // claim as its own and one that queued behind it, which nothing else here
  // can see from outside the canvas.
  check('  and none of them waited for the claim, because each of them was the claim',
    slowest < LOCK_WAIT_CAP_MS / 2, `slowest ${slowest} ms against a ${LOCK_WAIT_CAP_MS} ms wait cap`);
  check('  with no gap another writer could take, in any of the nineteen between them',
    gaps === 0, `${gaps} gaps`);
  check('  and the board was held once throughout, not taken and given back twenty times',
    boardLockState('scratch')?.since === claimedSince,
    `${claimedSince} -> ${boardLockState('scratch')?.since}`);

  // And the person at the canvas takes it back. Their pane sends the same
  // message a gesture sends: taking your board back is starting to use it.
  const tookBack = await api('POST', '/api/boards/hold?board=scratch', { clientId: PANE });
  check('the person at the canvas takes a claimed board back, rather than being refused',
    tookBack.status === 200 && tookBack.body?.holder?.id === PANE,
    `${tookBack.status} ${JSON.stringify(tookBack.body)?.slice(0, 160)}`);
  await api('POST', '/api/boards/hold/release?board=scratch', { clientId: PANE });

  const denied = await api('POST', '/api/boards/claim?board=scratch', { reason: 'carrying on regardless' });
  check('  and the agent cannot claim its way back onto it',
    denied.status === 409 && denied.body?.code === 'CLAIM_REVOKED',
    `${denied.status} ${JSON.stringify(denied.body)?.slice(0, 160)}`);
  check('  and is told nothing was rolled back, because a claim is not a transaction',
    /nothing was undone/.test(denied.body?.error ?? ''), denied.body?.error);
  const revokedRead = await api('GET', '/api/elements?board=scratch');
  const revokedInfo = await api('GET', '/api/boards/info?board=scratch');
  check('  with the current partial document in that told-once refusal',
    Array.isArray(denied.body?.document) &&
    JSON.stringify(denied.body.document) === JSON.stringify(revokedRead.body?.elements),
    `${denied.body?.document?.length ?? 'no'} refusal / ${revokedRead.body?.elements?.length ?? 'no'} read`);
  check('  and the current version beside it',
    denied.body?.version === revokedInfo.body?.version,
    `${String(denied.body?.version)} / ${String(revokedInfo.body?.version)}`);

  const ordinary = await api('POST', '/api/elements?board=scratch', {
    id: 'after-the-claim', type: 'rectangle', x: 10, y: 900, width: 10, height: 10
  });
  check('  told once: what it does after that is an ordinary write on an ordinary board',
    ordinary.status === 200, `${ordinary.status} ${JSON.stringify(ordinary.body)?.slice(0, 120)}`);

  const survived = await api('GET', '/api/elements?board=scratch');
  const written = (survived.body?.elements ?? []).filter(e => /^claim-\d+$/.test(e.id)).length;
  check('  and every element written under the claim is still on the board',
    written === 20, `${written} of 20`);

  const nothingLeft = await api('POST', '/api/boards/claim/release?board=scratch', {});
  check('releasing a claim somebody took back is tidying up late, not an error',
    nothingLeft.status === 200 && nothingLeft.body?.released === false,
    `${nothingLeft.status} ${JSON.stringify(nothingLeft.body)}`);

  const unexplained = await api('POST', '/api/boards/claim?board=scratch', {});
  check('a claim with no reason is refused: it is what the person is shown',
    unexplained.status === 400, `${unexplained.status}`);
  const homeless = await api('POST', '/api/boards/claim', { reason: 'anything' });
  check('and one that names no board like every other call (ADR 0009)',
    homeless.status === 400, `${homeless.status}`);

  // ─── Two canvases, one vault ───────────────────────────────────────────
  //
  // Section 7 showed two processes using the module. This is the thing the
  // decision actually names: two canvas *servers* over one vault, which is the
  // arrangement in which a lock held in memory would not be a lock at all.
  // Neither knows the other exists; the file is the only thing between them.

  const OTHER_PORT = PORT + 1;
  const otherServer = spawn(process.execPath, [src('server.ts')], {
    env: { ...process.env, PORT: String(OTHER_PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
    stdio: ['ignore', 'ignore', 'inherit']
  });
  try {
    let secondUp = false;
    for (let i = 0; i < 120 && !secondUp; i += 1) {
      try {
        secondUp = (await fetch(`http://127.0.0.1:${OTHER_PORT}/health`)).ok;
      } catch { /* not yet */ }
      if (!secondUp) await sleep(100);
    }
    check('a second canvas serves the same vault', secondUp, `port ${OTHER_PORT}`);

    await api('POST', '/api/boards/hold?board=scratch', { clientId: PANE });
    const keepHolding = renewing(PANE);
    const acrossServers = await fetch(`http://127.0.0.1:${OTHER_PORT}/api/elements?board=scratch&doing=writing+from+the+other+canvas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'rectangle', x: 700, y: 700, width: 40, height: 40 })
    });
    const refused = await acrossServers.json().catch(() => null);
    keepHolding();
    check('and a write to it is refused while the first canvas holds the board',
      acrossServers.status === 409 && refused?.code === 'BOARD_HELD',
      `${acrossServers.status} ${JSON.stringify(refused)?.slice(0, 140)}`);
    check('  naming the holder on the other canvas, which it has never heard of',
      refused?.holder?.id === PANE, JSON.stringify(refused?.holder));

    await api('POST', '/api/boards/hold/release?board=scratch', { clientId: PANE });
    const allowed = await fetch(`http://127.0.0.1:${OTHER_PORT}/api/elements?board=scratch&doing=writing+from+the+other+canvas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'rectangle', x: 700, y: 700, width: 40, height: 40 })
    });
    check('  and goes through once it is given back', allowed.status === 200, `${allowed.status}`);

    // ─── And the second canvas's panes hear about a claim ───────────────
    //
    // The gap ADR 0016 left open and named this task as the place to close.
    // Exclusion reaches both canvases because it reads the file; the broadcast
    // reaches one, because a file does not call anybody. So a pane over there
    // was excluded correctly and found out when a write was refused — which
    // for a claim running minutes is minutes of somebody drawing into a board
    // they cannot have. Nothing below sends that canvas anything: it reads.

    const OTHER_PANE = 'pane-other-canvas';
    const overThere = [];
    const otherSocket = new WebSocket(`ws://127.0.0.1:${OTHER_PORT}/?clientId=${OTHER_PANE}`);
    otherSocket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'board_lock') overThere.push(message);
    });
    await new Promise((resolve) => otherSocket.on('open', resolve));
    // Long enough for that canvas to go quiet, and this is load-bearing. It
    // has just written the board itself, which leaves a pending announcement
    // that re-reads the lock file when it fires — and a check that had not
    // waited that out would be handed its news by that timer landing after the
    // claim rather than by the poll. Reverting the poll then failed nothing.
    await sleep(LOCK_FREE_LINGER_MS + 1200);
    check('a pane on the second canvas starts out believing its board is free',
      overThere.at(-1)?.held === false, JSON.stringify(overThere.at(-1)));

    const heardBefore = overThere.length;
    const elsewhere = await api('POST', '/api/boards/claim?board=scratch', { reason: 'restructuring the queues' });
    check('the first canvas claims the board', elsewhere.status === 200, `${elsewhere.status}`);
    await sleep(LOCK_WATCH_MS + 1500);
    const news = overThere.slice(heardBefore).at(-1);
    check('  and the pane on the other canvas is told, with nobody having told it',
      news?.held === true && news?.holder?.claimed === true &&
      news?.holder?.reason === 'restructuring the queues', JSON.stringify(news));
    check('  before the touch rather than at the write: no write was made to find that out',
      news !== undefined && (await api('GET', '/api/elements?board=scratch')).status === 200);

    // And the person standing at *that* canvas takes it back. They are nowhere
    // near the canvas holding the claim, and the agent still has to be told.
    const reclaimed = await fetch(`http://127.0.0.1:${OTHER_PORT}/api/boards/hold?board=scratch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: OTHER_PANE })
    });
    check('  and the person at that canvas can take it back',
      reclaimed.status === 200, `${reclaimed.status}`);
    await fetch(`http://127.0.0.1:${OTHER_PORT}/api/boards/hold/release?board=scratch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: OTHER_PANE })
    });

    // The claiming canvas finds out at its next renewal — the lock is no longer
    // its own, and a renewal may not take a free one back.
    await sleep(LOCK_RENEW_MS + 1500);
    check('  and the claim does not come back, now that the board is free again',
      overThere.at(-1)?.held === false, JSON.stringify(overThere.at(-1)));
    const toldElsewhere = await api('POST', '/api/elements?board=scratch', {
      type: 'rectangle', x: 30, y: 950, width: 10, height: 10
    });
    check('  and the agent on the first canvas is told it lost the board',
      toldElsewhere.status === 409 && toldElsewhere.body?.code === 'CLAIM_REVOKED',
      `${toldElsewhere.status} ${JSON.stringify(toldElsewhere.body)?.slice(0, 200)}`);

    otherSocket.close();
    await api('POST', '/api/boards/claim/release?board=scratch', {});
  } finally {
    otherServer.kill();
  }

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

// ─── Nothing outside the module touches the lock file or the broadcast ─────
//
// The same shape as `check-boards`' assertion that one line in `src/` calls
// `sceneJsonWithEmbeddedImages`, and for the same reason: this repository has
// spent long enough removing invariants that held only while somebody
// remembered them. A second place that builds a lock path is two answers to
// where a board's lock is, and a second sender of `board_lock` is a pane told
// two different things about who has its board.

{
  const sources = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (entry.name.endsWith('.ts')) sources.push(at);
    }
  };
  walk(join(repoRoot, 'src'));

  const builders = sources.filter(file => /['"`]locks['"`]/.test(fs.readFileSync(file, 'utf-8')));
  check('one file in src/ knows where a board\'s lock lives',
    builders.length === 1 && builders[0].endsWith('core/board-lock.ts'),
    builders.map(f => f.replace(repoRoot, '')).join(', ') || 'none');

  // Building the message, not naming it: the message type lives in `types.ts`
  // and the module's own header talks about it, and neither sends one.
  const senders = sources.filter(file => /type:\s*['"`]board_lock['"`]/.test(fs.readFileSync(file, 'utf-8')));
  check('and one file in src/ sends the lock broadcast',
    senders.length === 1 && senders[0].endsWith('server.ts'),
    senders.map(f => f.replace(repoRoot, '')).join(', ') || 'none');

  const sinks = sources.filter(file => /onBoardLockChanged\(/.test(fs.readFileSync(file, 'utf-8'))
    && !file.endsWith('core/board-lock.ts'));
  check('  through the one sink the module hands out, registered in one place',
    sinks.length === 1 && sinks[0].endsWith('server.ts'),
    sinks.map(f => f.replace(repoRoot, '')).join(', ') || 'none');

  const bypass = sources.filter(file => file !== join(repoRoot, 'src', 'core', 'board-lock.ts')
    && /VAULT_STATE_DIR[^\n]*lock/i.test(fs.readFileSync(file, 'utf-8')));
  check('  and nothing else reaches into the lock directory',
    bypass.length === 0, bypass.map(f => f.replace(repoRoot, '')).join(', '));
}

// ─── Report ───────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\nlock: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`lock: ${checks} checks. One writer at a time, across two canvases over one vault, and the panes are told.`);

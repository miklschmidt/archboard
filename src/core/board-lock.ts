// One writer at a time, per board (ADR 0016).
//
// A board is a note, and two writers to one note lose each other's work. An
// agent redrawing a subsystem while a person drags a box are not two edits to
// interleave; they are two people editing one thing, and a tidy merge of them
// is a blend neither asked for. So a board has a mutex, and this is it.
//
// WHAT A CALLER ASKS, AND ALL A CALLER ASKS. Ask to write a board, and either
// write it or learn who holds it:
//
//     await withBoardLock({ board, holder }, () => persistBoard(...))
//
// It either runs the write with the board exclusively yours, or throws a
// `BoardHeldError` naming the holder and how long they have had it. Acquiring,
// waiting, renewing, expiring a holder that died, and telling the panes all sit
// behind that one call. The ADR is explicit about why: "a lock where every
// caller assembles the same steps itself is a lock whose callers drift apart".
//
// The user-edit path is the same lock asked a different question. A user's hold
// spans requests — taken by the first change of an edit, released after the
// report of that edit has landed — so `holdBoard` and `releaseHold` are the two
// halves of `withBoardLock` exposed for the two routes that serve it. Nothing
// else should call them; a write that wants the board wants `withBoardLock`.
//
// THE LOCK LIVES BESIDE THE NOTE, NOT IN THIS PROCESS. The note is the board
// (ADR 0015) and more than one canvas may serve one vault, so a lock held in
// memory does not exist to the other process and would not be a lock. It is a
// small JSON file under `<vault>/.archboard/locks/`, in the hidden directory
// the stencil library and the scratch note already use.
//
// IT IS A LEASE, NOT A FLAG. A holder that dies mid-write would leave a flag
// set forever and a board nobody can write until somebody finds and deletes a
// file they have never heard of. So the record carries an expiry, a live holder
// renews by asking again, and the first crash costs one lease rather than the
// board.
//
// A LOCK FILE THAT CANNOT BE READ IS NOT A HELD BOARD. Missing, truncated, not
// JSON, or JSON without an expiry: all of it reads as nothing holding the
// board. The alternative is a wedged board recoverable only by manually
// deleting the lock file, which is the failure the lease exists to prevent,
// arriving through a corrupt file instead of a dead process.
//
// READS NEVER LOCK, and nothing here should be made to guard one. A write goes
// through a rename (`atomic-write.ts`), so a reader sees the whole old note or
// the whole new one. Locking a read would buy nothing and would put every
// `describe` behind whoever is drawing.
//
// IT IS A BROADCAST AS WELL AS A GUARD. A canvas applies a change as soon as
// the pointer moves, so refusing it when it is finally written would interrupt
// the edit. Panes are told before the edit instead:
// `onBoardLockChanged` is where that news goes, and the server turns it into a
// `board_lock` message. Whether a pane can hear it is the pane's problem and it
// fails closed — see `frontend/src/canvas/useCanvasSession.ts`.
//
// AND AN AGENT MAY CLAIM A BOARD FOR LONGER THAN ONE WRITE. `claimBoard` is
// that, and the section on it below is where the reasoning lives: a claim is a
// hold the canvas keeps renewing, it is bounded at three ends, and a person can
// take it back at any moment. Cross-process *news* is what makes the claim
// visible on a second canvas over one vault — that canvas is excluded correctly
// because exclusion reads the file, and `watchBoardLocks` is what stops its
// panes finding out at the write rather than before the edit (TASK-080).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { VAULT_STATE_DIR, normalizeBoardKey, requireVaultRoot } from './board.js';
import { kept } from './hot.js';
import { forgetRememberedVersion } from './board-version.js';
import {
  CLAIM_DEFAULT_MS,
  CLAIM_LEASE_MS,
  CLAIM_MAX_MS,
  LOCK_FREE_LINGER_MS,
  LOCK_LEASE_MS,
  LOCK_POLL_MS,
  LOCK_RENEW_MS,
  LOCK_STEAL_GUARD_MS,
  LOCK_WAIT_CAP_MS,
  LOCK_WATCH_MS
} from './timing.js';

/** A person at the canvas, or an agent writing to it. */
export type HolderKind = 'human' | 'agent';

/**
 * Who has a board, and until when.
 *
 * `id` is a pane's client id for a person, a per-write id for an agent, and the
 * claim's own id for every write made under a claim. It is what makes the lock
 * reentrant: a holder asking again renews rather than blocks, which is how one
 * user edit's hold covers the write that follows it, and how twenty writes fit
 * inside one claim with no gap between them.
 */
export interface LockHolder {
  id: string;
  kind: HolderKind;
  /** When this holder took it. Not moved by a renewal: "since when" is the question a refusal answers. */
  since: string;
  /** When the lease lapses unless it is renewed. */
  until: string;
  /** Which canvas process, so a refusal can say "another canvas" and mean it. */
  process: string;
  /** What the holder said it was doing. Empty for a per-write hold, and the sentence a claim shows on the pane. */
  reason?: string;
  /**
   * A claim rather than one write: an agent said in advance that it is about to
   * redraw this board, and holds it across every write until it says otherwise.
   *
   * Written down rather than inferred from a long lease or a reason, because
   * three different things ask the question and all three would get it wrong by
   * guessing. A person's hold takes a claimed board and waits out an unclaimed
   * one; a pane puts up a banner naming the holder for a claim and nothing at
   * all for a twenty-millisecond write; and a refusal says "holds" rather than
   * "is writing".
   */
  claimed?: boolean;
}

/** The lease as it sits on disk: a holder plus the token that proves it is ours. */
interface LockRecord extends LockHolder {
  token: string;
}

/**
 * The board is held by somebody else, and here is who.
 *
 * Thrown only after the wait has run out, because an agent waits rather than
 * failing (ADR 0016): the expected wait is an edit and a write, so failing
 * immediately would report a queue that was about to clear. Carries the holder
 * as data so a surface can act on it rather than parse the sentence, and a
 * sentence so a voice session has something to say instead of going silent.
 */
export class BoardHeldError extends Error {
  readonly code = 'BOARD_HELD';
  readonly board: string;
  readonly holder: LockHolder | null;
  readonly waitedMs: number;

  constructor(board: string, holder: LockHolder | null, waitedMs: number) {
    super(describeHold(board, holder, waitedMs));
    this.name = 'BoardHeldError';
    this.board = board;
    this.holder = holder;
    this.waitedMs = waitedMs;
  }
}

/** What `holdBoard` gives back: who holds it, and whether this call is what took it. */
export interface LockHold {
  holder: LockHolder;
  /**
   * Did this call take the lock, or join one the same holder already had?
   *
   * The only reason a caller cares: releasing what you did not take is how a
   * user's edit loses the board to the write in the middle of it.
   */
  created: boolean;
}

export interface LockRequest {
  /** The board key. Normalised here, so two spellings of one board are one lock. */
  board: string;
  holder: { id: string; kind: HolderKind; reason?: string; claimed?: boolean };
  /**
   * How long to wait for somebody else, in ms. Defaults to LOCK_WAIT_CAP_MS,
   * which is what an agent uses: a person's hold tracks one edit interaction,
   * so the expected wait is short and waiting beats failing.
   *
   * A person's own hold passes REPORT_DEBOUNCE_MS instead. An agent's write is
   * about twenty milliseconds and an edit that starts during one has not lost
   * the board, but a person cannot be made to wait five seconds to find out
   * whether their edit was accepted. Zero means ask once.
   */
  waitMs?: number;
  /** How long the lease runs, in ms. Defaults to LOCK_LEASE_MS. */
  leaseMs?: number;
  /**
   * Take a claimed board away from the agent holding it.
   *
   * Only a person's hold ever sets it, and it only ever takes a *claim* — a
   * per-write hold is twenty milliseconds and is waited out, because taking a
   * board from a write in progress is two writers to one note, which is the
   * thing this whole file exists instead of.
   *
   * A claim is different because it may run for minutes, and no agent may make
   * a 75-inch display stop responding to the person standing at it (ADR 0016).
   * The agent is told at its next act; nothing it has already written is
   * touched, because a write is in the note and revoking is not undoing.
   */
  revokeClaim?: boolean;
}

/** Where the news goes: the board, and who holds it now, or null for free. */
export type LockSink = (board: string, holder: LockHolder | null) => void;

// ── The one call ──────────────────────────────────────────────────────────

/**
 * Hold the board for the length of one write.
 *
 * `write` runs with the board exclusively this holder's, and the lock is
 * released the moment it returns or throws — unless the same holder already had
 * the board, in which case their hold outlives this call and is theirs to
 * release.
 *
 * `write` is synchronous on purpose and should stay that way. A note is read,
 * modified and written back inside it (`board-io.ts`), and an `await` in the
 * middle of that would let a second request for the same board interleave its
 * own cycle — which is the thing the whole read-modify-write shape is built to
 * make impossible.
 */
export async function withBoardLock<T>(request: LockRequest, write: () => T): Promise<T> {
  const hold = await holdBoard(request);
  try {
    return write();
  } finally {
    if (hold.created) releaseHold(request.board, request.holder.id);
  }
}

/**
 * Take the board, or renew a hold this holder already has, or wait, or refuse.
 *
 * The user-edit half of the lock, and the renewal too: renewing is asking again,
 * so a live holder keeps the board without anything having to remember to
 * refresh it, and a holder that stops asking lapses on its own. TASK-080's
 * A claim is this call too, with a reason and a deadline the canvas keeps
 * renewing against — see `claimBoard`, which is the only thing that should make
 * one.
 */
export async function holdBoard(request: LockRequest): Promise<LockHold> {
  const board = normalizeBoardKey(request.board);
  const leaseMs = request.leaseMs ?? LOCK_LEASE_MS;
  const waitMs = request.waitMs ?? LOCK_WAIT_CAP_MS;
  const startedAt = Date.now();
  const deadline = startedAt + waitMs;

  let blocker: LockHolder | null = null;
  // Bounded so that a lock moving between holders faster than we can read it ends
  // in a refusal naming somebody rather than in a loop.
  let attemptsPastDeadline = 0;

  for (;;) {
    const result = await attempt(board, request.holder, leaseMs, request.revokeClaim === true);
    if (result.ok) return { holder: result.holder, created: result.created };
    // `null` means the file moved under us rather than that somebody has it:
    // worth another go, and worth not reporting as a holder.
    if (result.holder) blocker = result.holder;

    if (Date.now() >= deadline) {
      if (blocker || attemptsPastDeadline >= 2) break;
      attemptsPastDeadline += 1;
      continue;
    }
    await sleep(Math.min(LOCK_POLL_MS, Math.max(1, deadline - Date.now())));
  }

  throw new BoardHeldError(request.board, blocker, Date.now() - startedAt);
}

/**
 * Give the board back.
 *
 * Only if it is still ours: a lease that lapsed and was taken over belongs to
 * whoever took it, and deleting the file then would let a third writer use a
 * board somebody is editing. Returns whether anything was released, which is
 * how a pane's release tells "I gave it back" from "it had already lapsed".
 */
export function releaseHold(board: string, holderId: string): boolean {
  const key = normalizeBoardKey(board);
  const file = lockPathFor(key);
  const current = readRecord(file);
  if (!current || current.id !== holderId) return false;
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone: released is released */
  }
  announceFreeSoon(key);
  return true;
}

/** Who holds this board right now, or null. A lapsed lease reads as free. */
export function boardLockState(board: string): LockHolder | null {
  return liveHolder(readRecord(lockPathFor(normalizeBoardKey(board))));
}

// ── A claim: one writer for longer than one write ─────────────────────────
//
// The per-write lock fits most of what an agent does and does not fit an agent
// that knows it is about to redraw a board. Taking and releasing a lock twenty
// times leaves nineteen gaps for somebody else to write into, and the board is
// never in one consistent state while it is being built. So an agent claims the
// board and says roughly how long it needs it and what it is doing (ADR 0016).
//
// A CLAIM IS A HOLD WITH A DEADLINE, AND THE CANVAS IS WHAT RENEWS IT. An agent
// here is a fresh process per command, so between two commands there is nothing
// alive to send a heartbeat and nothing that could tell an agent reading code
// for two minutes from an agent that died. The claim therefore lives on the
// canvas, keyed by the board, and the agent carries nothing between requests:
// its writes are recognised because they are writes to a board this canvas
// holds a claim on.
//
// WHICH LEAVES THREE BOUNDS, AND THEY ARE THE ONES THE ADR NAMES. The lease and
// its renewal bound a dead *canvas*: stop renewing and the board is free within
// one lease, which is what keeps a crash from costing the vault a board for as
// long as the claim was for. The claim's own expiry bounds a working agent, and
// with it an agent that walked away — capped, so the board is never unavailable
// for longer than an hour without a person doing anything. And the
// person is the third bound, at any moment, from the pane.

/** An agent's claim on a board: who holds it, why, and when it runs out. */
export interface Claim {
  board: string;
  holder: LockHolder;
  /** When the claim itself ends, whatever the lease says. */
  expires: string;
}

/** A claim that was taken back, and by whom. */
export interface ClaimRevocation {
  claim: Claim;
  by: LockHolder | null;
}

/**
 * Claim a board, or extend a claim this canvas already holds.
 *
 * Extending is claiming again, the same way renewing is holding again: the id
 * is kept, so every write already made under the claim stays under it, and the
 * deadline moves. That is deliberately the only thing that moves a deadline — a
 * write renews the *lease* and not the claim, or the expiry that is supposed to
 * bound a working agent would be pushed forward by the very work it bounds.
 *
 * Waits like any other holder if somebody is mid-edit, and refuses with a
 * `BoardHeldError` if they are still there. Claiming is not a way past the
 * person at the canvas.
 */
export async function claimBoard(request: {
  board: string;
  reason: string;
  forMs?: number;
  waitMs?: number;
}): Promise<{ claim: Claim; created: boolean }> {
  const board = normalizeBoardKey(request.board);
  const forMs = Math.min(Math.max(request.forMs ?? CLAIM_DEFAULT_MS, CLAIM_LEASE_MS), CLAIM_MAX_MS);
  const existing = liveClaim(board);
  const id = existing?.holder.id ?? `claim-${newToken()}`;

  const hold = await holdBoard({
    board,
    holder: { id, kind: 'agent', reason: request.reason, claimed: true },
    leaseMs: CLAIM_LEASE_MS,
    ...(request.waitMs !== undefined ? { waitMs: request.waitMs } : {})
  });

  const entry: ClaimEntry = {
    holder: hold.holder,
    expires: Date.now() + forMs,
    timer: existing?.timer ?? null
  };
  claims().set(board, entry);
  if (!entry.timer) entry.timer = startRenewing(board);
  return { claim: claimOf(board, entry), created: existing === null };
}

/**
 * Give a claimed board back.
 *
 * Returns the claim that ended, or null if there was none — an agent releasing
 * a claim that has already expired or been taken back is not an error, it is an
 * agent doing the right thing a moment late.
 */
export function releaseClaim(board: string): Claim | null {
  const key = normalizeBoardKey(board);
  const entry = claims().get(key);
  if (!entry) return null;
  stopRenewing(entry);
  forgetRememberedVersion(entry.holder.id);
  claims().delete(key);
  releaseHold(key, entry.holder.id);
  return claimOf(key, entry);
}

/** The claim this canvas holds on a board, or null. An expired one reads as none. */
export function claimOn(board: string): Claim | null {
  const key = normalizeBoardKey(board);
  const entry = liveClaim(key);
  return entry ? claimOf(key, entry) : null;
}

/**
 * The holder id an agent's write to this board should use, or null.
 *
 * This is the whole of how a claim survives across requests. An agent sends
 * nothing: the canvas knows which board the call names, and a claim on that
 * board is a holder id every write joins rather than one it has to carry.
 *
 * Only the id, deliberately. A write that finds the lock file no longer holding
 * the claim — a person took it back a moment ago on another canvas — takes an
 * ordinary per-write hold and gives it back, rather than restoring the claim
 * while the person who revoked it is still editing.
 */
export function claimWriterId(board: string): string | null {
  return liveClaim(normalizeBoardKey(board))?.holder.id ?? null;
}

/**
 * Was this board's claim taken back, and by whom? Told once: reading it clears
 * it.
 *
 * Once, because the agent has to be told and then has to be able to carry on
 * once it has understood. A permanent refusal would leave the board wedged
 * against the agent that used to hold it; no refusal at all would let it renew
 * its way back onto a board somebody just took, which is the fighting for it
 * the ADR forbids. So the next thing it does — a write, or a fresh claim —
 * fails once and says what happened, and what it does after that is ordinary.
 */
export function takeClaimRevocation(board: string): ClaimRevocation | null {
  const key = normalizeBoardKey(board);
  const lost = revocations().get(key);
  if (!lost) return null;
  revocations().delete(key);
  return lost;
}

interface ClaimEntry {
  holder: LockHolder;
  /** ms since the epoch, because everything that compares it is a clock read. */
  expires: number;
  timer: ReturnType<typeof setInterval> | null;
}

function claimOf(board: string, entry: ClaimEntry): Claim {
  return { board, holder: entry.holder, expires: stamp(entry.expires) };
}

function liveClaim(board: string): ClaimEntry | null {
  const entry = claims().get(board);
  if (!entry) return null;
  if (Date.now() < entry.expires) return entry;
  // Ran its course. Dropped here rather than only on the renewal tick, so the
  // answer to "is this board claimed" never depends on when a timer last fired.
  stopRenewing(entry);
  forgetRememberedVersion(entry.holder.id);
  claims().delete(board);
  releaseHold(board, entry.holder.id);
  return null;
}

/**
 * Keep the lease alive under a claim.
 *
 * The lease is deliberately too short to cover a claim on its own, so this is
 * what makes a long claim long — and what makes a canvas that died stop holding
 * the board within one lease rather than for the length of the claim.
 *
 * It is also the discovery path for a claim taken back on another canvas: that
 * person's hold wrote over the lock file, so the next renewal finds the lock is
 * somebody else's or gone, and that is how this canvas learns something nobody
 * could tell it.
 */
function startRenewing(board: string): ReturnType<typeof setInterval> {
  const timer = setInterval(() => { renewClaim(board); }, LOCK_RENEW_MS);
  timer.unref?.();
  return timer;
}

function stopRenewing(entry: ClaimEntry): void {
  if (entry.timer) clearInterval(entry.timer);
  entry.timer = null;
}

function renewClaim(board: string): void {
  const entry = liveClaim(board);
  if (!entry) return;
  const renewed = renewRecord(board, entry.holder.id, CLAIM_LEASE_MS);
  if (renewed) {
    entry.holder = renewed;
    return;
  }
  // The lock is not ours any more, and a renewal may not take it back. That
  // distinction is the whole of cross-canvas revocation: a person at another
  // canvas takes the board and lets go of it a second later, and a renewal that
  // took a free lock would restore the claim while the person who revoked it
  // is still editing, with nobody ever told.
  noteClaimRevoked(board, entry.holder, boardLockState(board));
}

/**
 * Refresh a lease we already hold, and refuse to take one we do not.
 *
 * Not `holdBoard`: that takes a free lock, which is right for a writer asking
 * for a board and wrong for a renewal. A renewal is the question "do I still
 * have this", and the only honest answers are yes and no.
 */
function renewRecord(board: string, id: string, leaseMs: number): LockHolder | null {
  const file = lockPathFor(board);
  const live = liveRecord(readRecord(file));
  if (!live || live.id !== id) return null;
  const renewed: LockRecord = { ...live, until: stamp(Date.now() + leaseMs) };
  writeRecord(file, renewed);
  announceHeld(board, holderOf(renewed));
  return holderOf(renewed);
}

/**
 * A claim is over because somebody took the board.
 *
 * Called from both sides of the same event: the person's hold, when the claim
 * was on this canvas, and the refused renewal, when it was on another. Silent
 * about a claim this canvas never held — that canvas records its own.
 */
function noteClaimRevoked(board: string, lost: LockHolder, by: LockHolder | null): void {
  const entry = claims().get(board);
  if (!entry || entry.holder.id !== lost.id) return;
  stopRenewing(entry);
  forgetRememberedVersion(entry.holder.id);
  claims().delete(board);
  revocations().set(board, { claim: claimOf(board, entry), by });
}

// ── Watching a board somebody else may be holding ─────────────────────────

/**
 * Learn about the boards on this screen from the lock files, not only from the
 * one canvas that can talk to us.
 *
 * Taking or releasing a board is news the canvas that did it can send, and a
 * second canvas over the same vault has nothing to tell it, because the lock is
 * a file and a file does not call anybody. Its panes are excluded correctly and
 * find out at the write rather than before the edit, which is the interruption the
 * broadcast exists to prevent, surviving in the one configuration nobody has
 * yet run.
 *
 * For a per-write hold that costs milliseconds and is not worth a timer. For a
 * claim it is a pane that is wrong for minutes, and ADR 0016 named the claim as
 * what makes this earn itself.
 *
 * `boards` is asked, rather than a list being passed in, because which boards
 * are on screen changes with every pane and every board switch, and a stale
 * copy of it is a board watched after it left the screen. Pass null to stop:
 * with nothing rendering there is no pane to be wrong.
 */
export function watchBoardLocks(boards: (() => string[]) | null): void {
  const watch = watcher();
  watch.boards = boards;
  if (!boards) {
    if (watch.timer) clearInterval(watch.timer);
    watch.timer = null;
    return;
  }
  if (watch.timer) return;
  const timer = setInterval(() => { sweepBoardLocks(); }, LOCK_WATCH_MS);
  timer.unref?.();
  watch.timer = timer;
}

function sweepBoardLocks(): void {
  const watch = watcher();
  const boards = watch.boards?.() ?? [];
  for (const board of new Set(boards.map(normalizeBoardKey))) {
    // Whatever else rides on this beat goes first, because the lock's linger
    // below is about the lock and has nothing to say about anybody else's
    // question.
    try {
      sweepHolder().also?.(board);
    } catch (error) {
      // A passenger that throws must not stop the lock from being watched.
      console.warn('A board sweep passenger failed:', error);
    }
    // A board whose release is still lingering is one this canvas is in the
    // middle of telling the panes about. Saying "free" here would undo the
    // linger and put every pane back to flickering through an agent's fan-out.
    if (lingers().has(board)) continue;
    announce(board, boardLockState(board));
  }
}

/**
 * One more thing to do with the boards on screen, on the beat above.
 *
 * The watcher is a timer over the boards a browser is looking at, gated on
 * there being a browser to tell. Noticing that somebody outside archboard has
 * written a note wants exactly that list and exactly that gate (TASK-062), and
 * a second timer over the same boards would be the same poll running twice.
 *
 * So the sweep hands each board to one passenger and stays ignorant of what it
 * does with it: this module knows about locks, and a note is not a lock.
 */
export function onBoardSweep(sink: ((board: string) => void) | null): void {
  sweepHolder().also = sink;
}

/**
 * Where lock news goes. Set once, by the server, to the thing that tells the
 * panes.
 *
 * A sink rather than an import because the module must not know what a pane is,
 * and because a check can watch the news without standing a browser up.
 */
export function onBoardLockChanged(sink: LockSink | null): void {
  sinkHolder().notify = sink;
}

/**
 * Forget every hold and every pending announcement, without modifying the vault.
 *
 * For a check that wants a clean process, and for nothing else. Releasing a
 * board is `releaseHold`; this only drops what *this process* remembers having
 * said.
 */
export function forgetLockAnnouncements(): void {
  for (const timer of lingers().values()) clearTimeout(timer);
  lingers().clear();
  announced().clear();
  for (const entry of claims().values()) {
    stopRenewing(entry);
    forgetRememberedVersion(entry.holder.id);
  }
  claims().clear();
  revocations().clear();
  watchBoardLocks(null);
}

// ── Acquiring ─────────────────────────────────────────────────────────────

type Attempt =
  | { ok: true; holder: LockHolder; created: boolean }
  | { ok: false; holder: LockHolder | null };

/**
 * One go at taking the board.
 *
 * Three shapes, and the third is the only interesting one:
 *
 *   - the same holder already has it: renew, and say we did not create it
 *   - somebody else has a live lease: refuse, and name them
 *   - nothing has it, or a lease has lapsed: take it
 *
 * A person taking a claimed board is the fourth, and it goes down the same path
 * as a lapsed lease: the claim is still live and is being taken anyway, so two
 * people at two canvases could decide to take one claim at the same moment,
 * which is exactly the race the read-back below settles.
 *
 * Taking a lock that is not there is settled by the filesystem: `wx` creates
 * exclusively or fails, and there is no race left to resolve. Taking over a
 * lapsed one is not, because two processes can both decide it lapsed and both
 * write. So that path renames its own record over the file, pauses, and reads
 * back: the last rename wins, and only the process whose token is in the file
 * afterwards believes it has the board.
 */
async function attempt(
  board: string,
  who: { id: string; kind: HolderKind; reason?: string; claimed?: boolean },
  leaseMs: number,
  revoke: boolean
): Promise<Attempt> {
  const file = lockPathFor(board);
  const current = readRecord(file);
  const live = liveRecord(current);
  // A person taking a board an agent claimed. Not "an agent holds it": a write
  // is twenty milliseconds and is waited out, and a claim is the only hold long
  // enough for waiting it out to mean an unresponsive board.
  const revoking = Boolean(live && revoke && who.kind === 'human' && live.claimed && live.id !== who.id);

  // WHETHER THE CLAIM ENDS IS A QUESTION ABOUT THE CLAIM, NOT ABOUT THE LEASE
  // UNDER IT. The line above answers a different one — may this person take a
  // board somebody is holding — and that is rightly about the lock record,
  // because it is the record that says the board is taken. Ending the claim was
  // riding on the same flag, and a claim outlives its lease by design: it runs
  // for ten minutes over a three-second lease the canvas re-takes every second
  // (ADR 0016). Let that renewal be late — a blocked event loop, a busy
  // machine — and the take-back request reaches a lock that is momentarily nobody's. The
  // person got the board either way, and the agent was never told it had lost
  // it: its next write went through as if nothing had happened.
  //
  // So the claim this canvas holds is what is asked, and a lapsed lease under a
  // live claim revokes exactly as a live one does. A claim held on another
  // canvas is not here to end; that one finds out when its own renewal is
  // refused, which is the same discovery a renewal interval later.
  const endsClaimHere = (taker: LockRecord): void => {
    if (!revoke || who.kind !== 'human') return;
    const claimHere = claims().get(board);
    if (!claimHere || claimHere.holder.id === who.id) return;
    noteClaimRevoked(board, claimHere.holder, holderOf(taker));
  };

  if (live && live.id === who.id) {
    // Reentrant, which is also what renewal is. `since` is kept: a refusal
    // saying how long a board has been held must mean since it was taken, not
    // since it was last renewed.
    const renewed: LockRecord = {
      ...live,
      kind: who.kind,
      until: stamp(Date.now() + leaseMs),
      ...(who.reason !== undefined ? { reason: who.reason } : {}),
      ...(who.claimed ? { claimed: true } : {})
    };
    writeRecord(file, renewed);
    // A person who already holds the lock and taps to take a claimed board back
    // arrives here rather than below: their previous hold outlived the claim's
    // lapsed lease. The claim still ends.
    endsClaimHere(renewed);
    announceHeld(board, holderOf(renewed));
    return { ok: true, holder: holderOf(renewed), created: false };
  }

  if (live && !revoking) {
    // Somebody else's, and still theirs. Announce it: this is how a pane in
    // this process learns an agent in this process has the board.
    announceHeld(board, holderOf(live));
    return { ok: false, holder: holderOf(live) };
  }

  const record: LockRecord = {
    id: who.id,
    kind: who.kind,
    since: stamp(Date.now()),
    until: stamp(Date.now() + leaseMs),
    process: processName(),
    ...(who.reason !== undefined ? { reason: who.reason } : {}),
    ...(who.claimed ? { claimed: true } : {}),
    token: newToken()
  };

  if (!current) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      const handle = fs.openSync(file, 'wx');
      try {
        fs.writeFileSync(handle, JSON.stringify(record));
      } finally {
        fs.closeSync(handle);
      }
      // Nothing was holding the board, and a claim on this canvas may still
      // have believed it was: a lease that lapsed and was tidied away leaves no
      // record to read, and the claim above it runs for minutes longer.
      endsClaimHere(record);
      announceHeld(board, holderOf(record));
      return { ok: true, holder: holderOf(record), created: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Somebody created it between our read and our create. Whatever they
      // wrote is the answer, and if it is already lapsed we fall through and
      // take it over the same way any other lapsed lease is taken over.
      const raced = liveRecord(readRecord(file));
      if (raced) {
        announceHeld(board, holderOf(raced));
        return { ok: false, holder: holderOf(raced) };
      }
    }
  }

  // Taking over a lease whose holder is gone, or a claim a person is taking
  // back. The first is only ever reached after a crash, so the guard below is
  // paid by nobody on the ordinary path; the second is paid by one take-back action.
  writeRecord(file, record);
  await sleep(LOCK_STEAL_GUARD_MS);
  const settled = readRecord(file);
  if (!settled || settled.token !== record.token) {
    const rival = liveRecord(settled);
    return { ok: false, holder: rival ? holderOf(rival) : null };
  }
  // Only now, because until the read-back this process did not have the board.
  // A claim held here stops being renewed at this moment; one held on another
  // canvas finds out when its own renewal is refused, which is the same
  // discovery arriving one renewal interval later.
  endsClaimHere(record);
  announceHeld(board, holderOf(record));
  return { ok: true, holder: holderOf(record), created: true };
}

// ── The lease file ────────────────────────────────────────────────────────

/**
 * One lock file per board, under the vault's own hidden directory.
 *
 * Not literally next to the note, because a `payments.excalidraw.md.lock`
 * sitting in somebody's vault is a file they have to be told to ignore. It is
 * beside it in the sense that matters: in the vault, where a second canvas over
 * the same vault finds the same file, rather than in a process where it would
 * be invisible to one.
 *
 * The name is the board key percent-encoded, so a nested name like
 * `systems/payments` is one file rather than a directory somebody has to
 * create, and two boards cannot collide onto one lock.
 */
function lockPathFor(board: string): string {
  return path.join(
    requireVaultRoot(),
    VAULT_STATE_DIR,
    'locks',
    `${encodeURIComponent(normalizeBoardKey(board))}.lock`
  );
}

function readRecord(file: string): LockRecord | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LockRecord>;
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.until !== 'string') return null;
    if (typeof parsed.token !== 'string') return null;
    return parsed as LockRecord;
  } catch {
    // Half-written by an older archboard, or something else entirely. Nothing
    // that cannot be read holds a board (see the header).
    return null;
  }
}

/**
 * Write the lease without an fsync, and by rename.
 *
 * By rename because a reader must see one whole record or the previous one; a
 * torn lock file reads as no lock at all, which would let the board reach a
 * second writer while the first is mid-write. Without the fsync because a lock
 * that does not survive a power cut is a lock nobody needs — the process
 * holding it did not survive either, and the lease would have lapsed.
 *
 * The temp file carries the token rather than the pid, because two acquisitions
 * inside one process are two different attempts at the same path.
 */
function writeRecord(file: string, record: LockRecord): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${record.token}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(record));
    fs.renameSync(tmp, file);
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch { /* never created, or already renamed */ }
    throw error;
  }
}

function liveRecord(record: LockRecord | null): LockRecord | null {
  if (!record) return null;
  const until = Date.parse(record.until);
  return Number.isFinite(until) && until > Date.now() ? record : null;
}

function liveHolder(record: LockRecord | null): LockHolder | null {
  const live = liveRecord(record);
  return live ? holderOf(live) : null;
}

/** The record without the token: what anybody outside this module is told. */
function holderOf(record: LockRecord): LockHolder {
  const { token: _token, ...holder } = record;
  return holder;
}

// ── Telling the panes ─────────────────────────────────────────────────────

/**
 * Say a board is held, if that is news.
 *
 * Compared on holder and start time rather than on the whole record, so a
 * renewal every second is not a broadcast every second — a pane's answer to
 * "may I draw" does not change when a lease is refreshed.
 */
function announceHeld(board: string, holder: LockHolder): void {
  clearLinger(board);
  announce(board, holder);
}

/**
 * Say a board is free, in a moment.
 *
 * The lock itself is already released; this delays only the news. An agent's
 * write is still a fan-out in places (TASK-083), so one action can take and
 * release the board a dozen times in as many milliseconds, and broadcasting
 * each release raw is every pane flicking in and out of read-only while the
 * user edits. A hold taken inside the window cancels the announcement
 * outright.
 *
 * The state is re-read when the timer fires rather than assumed, so a board
 * taken by somebody else during the linger is announced as theirs and not as
 * free.
 */
function announceFreeSoon(board: string): void {
  clearLinger(board);
  const timer = setTimeout(() => {
    lingers().delete(board);
    announce(board, boardLockState(board));
  }, LOCK_FREE_LINGER_MS);
  // Never a reason for a process to stay alive.
  timer.unref?.();
  lingers().set(board, timer);
}

function clearLinger(board: string): void {
  const timer = lingers().get(board);
  if (timer) {
    clearTimeout(timer);
    lingers().delete(board);
  }
}

function announce(board: string, holder: LockHolder | null): void {
  const stampOf = holder
    ? `${holder.id}|${holder.kind}|${holder.since}|${holder.reason ?? ''}|${holder.claimed ? 'claim' : 'write'}`
    : '';
  if (announced().get(board) === stampOf) return;
  announced().set(board, stampOf);
  sinkHolder().notify?.(board, holder);
}

// ── Process-lived state ───────────────────────────────────────────────────
//
// In `kept()` rather than module scope: a hot reload rebuilds module scope, and
// a linger timer left behind by the old copy would fire into a sink the new
// copy has replaced (ADR 0014, `src/core/hot.ts`).

function announced(): Map<string, string> {
  return kept('board-lock-announced', () => new Map<string, string>());
}

function lingers(): Map<string, ReturnType<typeof setTimeout>> {
  return kept('board-lock-lingers', () => new Map<string, ReturnType<typeof setTimeout>>());
}

function sinkHolder(): { notify: LockSink | null } {
  return kept('board-lock-sink', () => ({ notify: null as LockSink | null }));
}

function sweepHolder(): { also: ((board: string) => void) | null } {
  return kept('board-lock-sweep', () => ({ also: null as ((board: string) => void) | null }));
}

// A claim outlives a reload by definition: it is minutes long, and a reload is
// how this canvas's code changes under it. Losing the registry would leave the
// lock file renewed by nobody and the board free in three seconds, mid-redraw.
function claims(): Map<string, ClaimEntry> {
  return kept('board-lock-claims', () => new Map<string, ClaimEntry>());
}

function revocations(): Map<string, ClaimRevocation> {
  return kept('board-lock-revocations', () => new Map<string, ClaimRevocation>());
}

function watcher(): { boards: (() => string[]) | null; timer: ReturnType<typeof setInterval> | null } {
  return kept('board-lock-watch', () => ({
    boards: null as (() => string[]) | null,
    timer: null as ReturnType<typeof setInterval> | null
  }));
}

// ── Small things ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

function stamp(at: number): string {
  return new Date(at).toISOString();
}

function newToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Which canvas this is.
 *
 * Host and pid, because the only question it answers is "is the thing holding
 * this board the canvas I am talking to". A second canvas over one vault is the
 * case the whole file exists for, and a refusal that does not distinguish it
 * reads as a bug in this one.
 */
function processName(): string {
  return `${os.hostname()}:${process.pid}`;
}

function isThisProcess(holder: LockHolder): boolean {
  return holder.process === processName();
}

/** The sentence a refusal carries: who has the board, and since when. */
function describeHold(board: string, holder: LockHolder | null, waitedMs: number): string {
  const waited = `Waited ${seconds(waitedMs)}.`;
  if (!holder) {
    return `Board "${board}" is being written by somebody else and did not come free. ${waited}`;
  }
  const held = seconds(Math.max(0, Date.now() - Date.parse(holder.since)));
  const who = holder.kind === 'human'
    ? 'the person at the canvas'
    : holder.claimed
      ? `an agent that has claimed it${holder.reason ? ` (${holder.reason})` : ''}`
      : holder.reason ? `an agent (${holder.reason})` : 'an agent';
  const where = isThisProcess(holder) ? '' : ` on another canvas (${holder.process})`;
  return `Board "${board}" is held by ${who}${where}, since ${clock(holder.since)} (${held}). ${waited}`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function clock(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toTimeString().slice(0, 8);
}

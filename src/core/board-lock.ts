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
// The gesture path is the same lock asked a different question. A person's hold
// spans requests — taken by the first change of a drag, released after the
// report of that drag has landed — so `holdBoard` and `releaseHold` are the two
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
// board. The alternative is a wedged board recoverable only by hand, which is
// the failure the lease exists to prevent, arriving through a corrupt file
// instead of a dead process.
//
// READS NEVER LOCK, and nothing here should be made to guard one. A write goes
// through a rename (`atomic-write.ts`), so a reader sees the whole old note or
// the whole new one. Locking a read would buy nothing and would put every
// `describe` behind whoever is drawing.
//
// IT IS A BROADCAST AS WELL AS A GUARD. A canvas applies a change the instant a
// finger moves, so refusing that change when it is finally written would take
// the board away mid-gesture. Panes are told before the touch instead:
// `onBoardLockChanged` is where that news goes, and the server turns it into a
// `board_lock` message. Whether a pane can hear it is the pane's problem and it
// fails closed — see `frontend/src/canvas/useCanvasSession.ts`.
//
// WHAT IS NOT HERE. Cross-process *news*: a second canvas over one vault is
// excluded correctly, because exclusion reads the file, but its panes learn a
// board is held when a write is refused rather than before the touch. Nothing
// polls the lock directory. TASK-080's long claim is what makes that gap worth
// paying for, and it is recorded on that task.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { VAULT_STATE_DIR, normalizeBoardKey, requireVaultRoot } from './board.js';
import { kept } from './hot.js';
import {
  LOCK_FREE_LINGER_MS,
  LOCK_LEASE_MS,
  LOCK_POLL_MS,
  LOCK_STEAL_GUARD_MS,
  LOCK_WAIT_CAP_MS
} from './timing.js';

/** A person at the canvas, or an agent writing to it. */
export type HolderKind = 'human' | 'agent';

/**
 * Who has a board, and until when.
 *
 * `id` is a pane's client id for a person and a per-write id for an agent, and
 * it is what makes the lock reentrant: a holder asking again renews rather than
 * blocks, which is how one gesture's claim covers the write that follows it.
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
  /** What the holder said it was doing. Empty for a per-write hold; TASK-080's claim is where this earns its place. */
  reason?: string;
}

/** The lease as it sits on disk: a holder plus the token that proves it is ours. */
interface LockRecord extends LockHolder {
  token: string;
}

/**
 * The board is held by somebody else, and here is who.
 *
 * Thrown only after the wait has run out, because an agent waits rather than
 * failing (ADR 0016): the expected wait is a gesture and a write, so failing
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
   * person's gesture loses the board to the write in the middle of it.
   */
  created: boolean;
}

export interface LockRequest {
  /** The board key. Normalised here, so two spellings of one board are one lock. */
  board: string;
  holder: { id: string; kind: HolderKind; reason?: string };
  /**
   * How long to wait for somebody else, in ms. Defaults to LOCK_WAIT_CAP_MS.
   *
   * Zero means ask once. That is what a person's gesture uses: a pane that
   * cannot have the board must go read-only now, and waiting five seconds
   * before saying so would let a hand keep drawing into a write nobody will
   * accept.
   */
  waitMs?: number;
  /** How long the lease runs, in ms. Defaults to LOCK_LEASE_MS. */
  leaseMs?: number;
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
 * The gesture half of the lock, and the renewal too: renewing is asking again,
 * so a live holder keeps the board without anything having to remember to
 * refresh it, and a holder that stops asking lapses on its own. TASK-080's
 * long claim is this call with a longer `leaseMs` and a `reason`.
 */
export async function holdBoard(request: LockRequest): Promise<LockHold> {
  const board = normalizeBoardKey(request.board);
  const leaseMs = request.leaseMs ?? LOCK_LEASE_MS;
  const waitMs = request.waitMs ?? LOCK_WAIT_CAP_MS;
  const startedAt = Date.now();
  const deadline = startedAt + waitMs;

  let blocker: LockHolder | null = null;
  // Bounded so that a lock being handed round faster than we can read it ends
  // in a refusal naming somebody rather than in a loop.
  let attemptsPastDeadline = 0;

  for (;;) {
    const result = await attempt(board, request.holder, leaseMs);
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
 * whoever took it, and deleting the file then would hand a third writer a board
 * somebody is in the middle of. Returns whether anything was released, which is
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
 * Forget every hold and every pending announcement, without touching the vault.
 *
 * For a check that wants a clean process, and for nothing else. Releasing a
 * board is `releaseHold`; this only drops what *this process* remembers having
 * said.
 */
export function forgetLockAnnouncements(): void {
  for (const timer of lingers().values()) clearTimeout(timer);
  lingers().clear();
  announced().clear();
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
 * Taking a lock that is not there is settled by the filesystem: `wx` creates
 * exclusively or fails, and there is no race left to resolve. Taking over a
 * lapsed one is not, because two processes can both decide it lapsed and both
 * write. So that path renames its own record over the file, pauses, and reads
 * back: the last rename wins, and only the process whose token is in the file
 * afterwards believes it has the board.
 */
async function attempt(
  board: string,
  who: { id: string; kind: HolderKind; reason?: string },
  leaseMs: number
): Promise<Attempt> {
  const file = lockPathFor(board);
  const current = readRecord(file);
  const live = liveRecord(current);

  if (live && live.id === who.id) {
    // Reentrant, which is also what renewal is. `since` is kept: a refusal
    // saying how long a board has been held must mean since it was taken, not
    // since it was last renewed.
    const renewed: LockRecord = {
      ...live,
      kind: who.kind,
      until: stamp(Date.now() + leaseMs),
      ...(who.reason !== undefined ? { reason: who.reason } : {})
    };
    writeRecord(file, renewed);
    announceHeld(board, holderOf(renewed));
    return { ok: true, holder: holderOf(renewed), created: false };
  }

  if (live) {
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

  // Taking over a lease whose holder is gone. Only ever reached after a crash,
  // so the guard below is paid by nobody on the ordinary path.
  writeRecord(file, record);
  await sleep(LOCK_STEAL_GUARD_MS);
  const settled = readRecord(file);
  if (!settled || settled.token !== record.token) {
    const rival = liveRecord(settled);
    return { ok: false, holder: rival ? holderOf(rival) : null };
  }
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
 * torn lock file reads as no lock at all, which would hand the board to a
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
 * each release raw is every pane flicking in and out of read-only under
 * somebody's hand. A hold taken inside the window cancels the announcement
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
  const stampOf = holder ? `${holder.id}|${holder.kind}|${holder.since}|${holder.reason ?? ''}` : '';
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

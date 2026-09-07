// The lease on disk that makes one writer at a time per board true (ADR 0016),
// and the announcements that tell every pane who has the board now.

import fs from "node:fs";
import path from "node:path";

import { LOCK_WATCH_MS } from "@/shared/timing/timing";
import { VAULT_STATE_DIR, normalizeBoardKey, requireVaultRoot } from "@/runtime/engine/board";
import { logger } from "@/runtime/engine/logger";
import type {
	LockHandoff,
	LockHolder,
	LockRecord,
	LockSink,
} from "@/runtime/engine/lib/board-lock-contracts";
import { isRecord, stringAt } from "@/runtime/engine/lib/unknown-record";

const processAnnounced = new Map<string, string>();
const processSink = { notify: null as LockSink | null };
const processSweep = { also: null as ((board: string) => void) | null };
const processWatcher: {
	boards: (() => string[]) | null;
	timer: ReturnType<typeof setInterval> | null;
} = { boards: null, timer: null };

/**
 * A moment as the lease records it.
 * @param at Milliseconds since the epoch.
 * @returns The ISO timestamp.
 */
function stamp(at: number): string {
	return new Date(at).toISOString();
}

/**
 * A fresh acquisition token.
 *
 * Tokens distinguish acquisitions even inside one pid, which a pid alone
 * cannot, and they also name the atomic-write temp file each record is
 * written through.
 * @returns The token.
 */
function newToken(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Where one board's lease lives.
 *
 * One percent-encoded filename per normalized board keeps nested board names
 * from becoming directories and makes this the sole vault lock-path owner.
 * @param board The board key.
 * @returns The lease file's path.
 */
function lockPathFor(board: string): string {
	return path.join(
		requireVaultRoot(),
		VAULT_STATE_DIR,
		"locks",
		`${encodeURIComponent(normalizeBoardKey(board))}.lock`,
	);
}

/**
 * Where a released writer leaves its commit receipt for the next one.
 * @param board The board key.
 * @returns The receipt's path.
 */
function handoffPathFor(board: string): string {
	return `${lockPathFor(board)}.handoff`;
}

/**
 * Read one commit receipt.
 *
 * A malformed receipt proves nothing. Unlike a lease, it is optional evidence
 * about the previous note commit and may safely be discarded.
 * @param file The receipt's path.
 * @returns The receipt, or null when there is none worth trusting.
 */
function readHandoff(file: string): LockHandoff | null {
	const parsed = readJsonRecord(file);
	if (!parsed) {
		return null;
	}
	const fields = textFields(parsed, ["id", "process", "since", "token", "hash"]);
	if (!fields) {
		return null;
	}
	return {
		id: fields["id"]!,
		process: fields["process"]!,
		since: fields["since"]!,
		token: fields["token"]!,
		hash: fields["hash"]!,
	};
}

/**
 * The named fields of a record, when every one of them is text with something
 * in it.
 * @param record The record.
 * @param keys The fields the caller needs.
 * @returns The fields, or null when any is missing or empty.
 */
function textFields(
	record: Record<string, unknown>,
	keys: readonly string[],
): Record<string, string> | null {
	const found: Record<string, string> = {};
	for (const key of keys) {
		const value = stringAt(record, key);
		if (!value) {
			return null;
		}
		found[key] = value;
	}
	return found;
}

/**
 * The JSON one lock file holds, when it holds readable JSON at all.
 * @param file The file's path.
 * @returns The record, or null when the file is missing or unreadable.
 */
function readJsonRecord(file: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Read one lease.
 *
 * Missing, truncated, invalid JSON, or a record without its lease or token
 * reads as free. Treating corruption as held would create the permanent flag
 * the lease design exists to avoid.
 * @param file The lease file's path.
 * @returns The lease, or null when the board is free.
 */
function readRecord(file: string): LockRecord | null {
	const parsed = readJsonRecord(file);
	if (!parsed) {
		return null;
	}
	const id = stringAt(parsed, "id");
	const until = stringAt(parsed, "until");
	const token = stringAt(parsed, "token");
	if (id === undefined || until === undefined || token === undefined) {
		return null;
	}
	// The lease is archboard's own record, written by writeRecord below; what is
	// checked above is that it is one at all.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- archboard's own lease record
	return parsed as unknown as LockRecord;
}

/**
 * Write one JSON record so a reader never sees a torn one.
 *
 * Rename ensures readers see the complete old record or the complete new one,
 * never a torn lease that could admit a second writer. No fsync is required:
 * after power loss the holder process is gone too, so persistence buys no
 * safety. The token, not the pid, distinguishes concurrent attempts.
 * @param file Where to write it.
 * @param record What to write.
 * @param token Names the temp file this is written through.
 * @throws {Error} When the write or the rename fails.
 */
function writeJsonRecord(file: string, record: object, token = newToken()): void {
	const dir = path.dirname(file);
	fs.mkdirSync(dir, { recursive: true });
	const tmp = path.join(dir, `.${path.basename(file)}.${token}.tmp`);
	try {
		fs.writeFileSync(tmp, JSON.stringify(record));
		fs.renameSync(tmp, file);
	} catch (error) {
		try {
			fs.unlinkSync(tmp);
		} catch {
			/* never created, or already renamed */
		}
		throw error;
	}
}

/**
 * Write one lease, through its own acquisition token.
 * @param file The lease file's path.
 * @param record The lease.
 */
function writeRecord(file: string, record: LockRecord): void {
	writeJsonRecord(file, record, record.token);
}

/**
 * Leave the commit receipt a released writer owes its successor.
 *
 * The handoff is written before lease removal. Failure loses optional proof,
 * but must never keep every future writer behind an already committed lease.
 * @param board The board key.
 * @param record The lease being released.
 */
function writeHandoff(board: string, record: LockRecord): void {
	if (!record.committedHash) {
		return;
	}
	writeJsonRecord(handoffPathFor(board), {
		id: record.id,
		process: record.process,
		since: record.since,
		token: record.token,
		hash: record.committedHash,
	});
}

/**
 * Take the commit receipt the previous writer left.
 *
 * Every receipt is consumed, valid or not, so it is one-use. It is trusted
 * only when id, process, original since time and token exactly match the
 * blocker this waiter actually observed; an unobserved or intervening writer
 * proves nothing about the successor's conflict baseline.
 * @param board The board key.
 * @param predecessor The lease this waiter watched, when it saw one.
 * @returns The committed note hash, or undefined when nothing proves one.
 */
function takeHandoff(board: string, predecessor: LockRecord | null): string | undefined {
	const file = handoffPathFor(board);
	const handoff = readHandoff(file);
	try {
		fs.unlinkSync(file);
	} catch {
		/* absent, malformed, or already consumed */
	}
	return matchesPredecessor(handoff, predecessor) ? handoff?.hash : undefined;
}

/**
 * Whether a receipt was left by exactly the lease this waiter watched.
 * @param handoff The receipt.
 * @param predecessor The lease this waiter watched.
 * @returns True when the two are the same acquisition.
 */
function matchesPredecessor(handoff: LockHandoff | null, predecessor: LockRecord | null): boolean {
	if (!handoff || !predecessor) {
		return false;
	}
	return (
		handoff.id === predecessor.id &&
		handoff.process === predecessor.process &&
		handoff.since === predecessor.since &&
		handoff.token === predecessor.token
	);
}

/**
 * The lease, when it has not expired.
 * @param record The lease as read.
 * @returns The lease, or null when it has lapsed or says nothing readable.
 */
function liveRecord(record: LockRecord | null): LockRecord | null {
	if (!record) {
		return null;
	}
	const until = Date.parse(record.until);
	return Number.isFinite(until) && until > Date.now() ? record : null;
}

/**
 * The lease as a caller is told about it: who has the board and until when,
 * without the acquisition token or the committed hash, which are the lease's
 * own bookkeeping.
 * @param record The lease.
 * @returns The holder.
 */
function holderOf(record: LockRecord): LockHolder {
	const { token: _token, committedHash: _committedHash, ...holder } = record;
	return holder;
}

/**
 * Who has one board now.
 * @param board The board key.
 * @returns The holder, or null when the board is free.
 */
function boardLockState(board: string): LockHolder | null {
	const live = liveRecord(readRecord(lockPathFor(normalizeBoardKey(board))));
	return live ? holderOf(live) : null;
}

/**
 * Tell the panes who has a board, unless they have already been told this.
 *
 * Renewal changes `until` but not whether a pane may draw, so expiry is absent
 * from this fingerprint. Holder, start, reason and claim changes remain real
 * news.
 * @param board The board key.
 * @param holder Who has it, or null when it is free.
 */
function announce(board: string, holder: LockHolder | null): void {
	const announced = holder
		? `${holder.id}|${holder.kind}|${holder.since}|${holder.reason ?? ""}|${holder.claimed ? "claim" : "write"}`
		: "";
	if (processAnnounced.get(board) === announced) {
		return;
	}
	processAnnounced.set(board, announced);
	processSink.notify?.(board, holder);
}

/**
 * Tell the panes a board is held.
 * @param board The board key.
 * @param holder Who has it.
 */
function announceHeld(board: string, holder: LockHolder): void {
	announce(board, holder);
}

/**
 * Tell the panes a board has come free.
 *
 * Release news goes out at once (TASK-153): a pane left believing a free board
 * is held is a pane refusing edits for no reason. The lease is re-read rather
 * than assumed, so a board another process has taken meanwhile is announced
 * held, never falsely free from stale release state.
 * @param board The board key.
 */
function announceFree(board: string): void {
	announce(board, boardLockState(board));
}

/**
 * Record which note this lease committed, as proof for its successor.
 *
 * Attached only when the exact enclosing lease still owns the file. This is
 * best-effort proof; persistence has already succeeded.
 * @param board The board key.
 * @param leaseToken The acquisition this commit happened inside.
 * @param hash The note's hash.
 * @returns True when the proof was stamped.
 */
function recordLockCommit(board: string, leaseToken: string, hash: string): boolean {
	let key = board;
	try {
		key = normalizeBoardKey(board);
		const file = lockPathFor(key);
		const current = readRecord(file);
		if (!current || current.token !== leaseToken || hash.length === 0) {
			return false;
		}
		writeRecord(file, { ...current, committedHash: hash });
		return true;
	} catch (error) {
		logger.warn(`Could not stamp the committed-note handoff for "${key}".`, { error });
		return false;
	}
}

/**
 * Give one board back.
 *
 * Released only if the lease is still ours: a lapsed one may already belong to
 * a successor, and unlinking that record would admit a third writer. The
 * ordering is deliberate — optional handoff, immediate unlink, then the news.
 * @param board The board key.
 * @param holderId Who is releasing it.
 * @returns True when this holder had it to release.
 */
function releaseHold(board: string, holderId: string): boolean {
	const key = normalizeBoardKey(board);
	const file = lockPathFor(key);
	const current = readRecord(file);
	if (!current || current.id !== holderId) {
		return false;
	}
	if (current.committedHash) {
		try {
			writeHandoff(key, current);
		} catch (error) {
			logger.warn(`Could not record the released-writer handoff for "${key}".`, { error });
		}
	}
	try {
		fs.unlinkSync(file);
	} catch {
		/* already gone: released is released */
	}
	announceFree(key);
	return true;
}

/**
 * Keep a lease this holder already has.
 *
 * Renewal answers only "do I still have this?" It refuses to acquire a free or
 * rival lease, which is what keeps a remotely revoked claim from resurrecting.
 * @param board The board key.
 * @param id Who is renewing.
 * @param leaseMs How much longer to hold it.
 * @returns The renewed holder, or null when the lease is no longer theirs.
 */
function renewRecord(board: string, id: string, leaseMs: number): LockHolder | null {
	const file = lockPathFor(board);
	const live = liveRecord(readRecord(file));
	if (!live || live.id !== id) {
		return null;
	}
	const renewed: LockRecord = { ...live, until: stamp(Date.now() + leaseMs) };
	writeRecord(file, renewed);
	announceHeld(board, holderOf(renewed));
	return holderOf(renewed);
}

/**
 * Look at every board on screen and announce who has it.
 */
function sweepBoardLocks(): void {
	const boards = processWatcher.boards?.() ?? [];
	for (const board of new Set(boards.map(normalizeBoardKey))) {
		// The note-watch passenger shares this exact board list and cadence. It runs
		// first, but its failure must never stop lock observation.
		try {
			processSweep.also?.(board);
		} catch (error) {
			logger.warn(`Board lock sweep passenger failed for "${board}"; lock watch continues.`, {
				error,
			});
		}
		announce(board, boardLockState(board));
	}
}

/**
 * Watch the boards a browser has on screen.
 *
 * A lock file cannot call another canvas, so the state is polled. Polling runs
 * only while a browser supplies boards that are actually on screen; with no
 * pane, nobody can be misled.
 * @param boards Which boards are on screen, or null to stop watching.
 */
function watchBoardLocks(boards: (() => string[]) | null): void {
	processWatcher.boards = boards;
	if (!boards) {
		if (processWatcher.timer) {
			clearInterval(processWatcher.timer);
		}
		processWatcher.timer = null;
		return;
	}
	if (processWatcher.timer) {
		return;
	}
	const timer = setInterval(() => {
		sweepBoardLocks();
	}, LOCK_WATCH_MS);
	// The poll must not be the reason a process stays alive.
	timer.unref();
	processWatcher.timer = timer;
}

/**
 * Ride along with the lock sweep, which is the one poll that already knows
 * which boards are on screen.
 * @param sink What to run for each board, or null to stop.
 */
function onBoardSweep(sink: ((board: string) => void) | null): void {
	processSweep.also = sink;
}

/**
 * Hear who has a board whenever it changes.
 * @param sink Where to send the news, or null to stop.
 */
function onBoardLockChanged(sink: LockSink | null): void {
	processSink.notify = sink;
}

/**
 * Forget what this process has announced, so the next sweep says it again.
 * Only this process's memory is dropped; the vault records remain
 * authoritative and untouched.
 */
function forgetLockState(): void {
	processAnnounced.clear();
}

export {
	announceHeld,
	boardLockState,
	forgetLockState,
	holderOf,
	liveRecord,
	lockPathFor,
	newToken,
	onBoardLockChanged,
	onBoardSweep,
	readRecord,
	recordLockCommit,
	releaseHold,
	renewRecord,
	stamp,
	takeHandoff,
	watchBoardLocks,
	writeRecord,
};

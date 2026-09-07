import fs from "node:fs";
import path from "node:path";

import { LOCK_WATCH_MS } from "@/shared/timing/timing";
import { VAULT_STATE_DIR, normalizeBoardKey, requireVaultRoot } from "@/runtime/engine/board";
import logger from "@/runtime/engine/logger";
import type { LockHandoff, LockHolder, LockRecord, LockSink } from "@/runtime/engine/lib/board-lock-contracts";

const processAnnounced = new Map<string, string>();
const processSink = { notify: null as LockSink | null };
const processSweep = { also: null as ((board: string) => void) | null };
const processWatcher: {
	boards: (() => string[]) | null;
	timer: ReturnType<typeof setInterval> | null;
} = { boards: null, timer: null };

// Timestamps and tokens belong to the lease record. Tokens distinguish
// acquisitions even inside one pid and also name atomic-write temp files.
/**
 *
 */
function stamp(at: number): string {
	return new Date(at).toISOString();
}

/**
 *
 */
function newToken(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 *
 */
function lockPathFor(board: string): string {
	// One percent-encoded filename per normalized board keeps nested board names
	// from becoming directories and makes this the sole vault lock-path owner.
	return path.join(
		requireVaultRoot(),
		VAULT_STATE_DIR,
		"locks",
		`${encodeURIComponent(normalizeBoardKey(board))}.lock`,
	);
}

/**
 *
 */
function handoffPathFor(board: string): string {
	return `${lockPathFor(board)}.handoff`;
}

/**
 *
 */
function readHandoff(file: string): LockHandoff | null {
	// A malformed receipt proves nothing. Unlike a lease, it is optional evidence
	// about the previous note commit and may safely be discarded.
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<LockHandoff>;
		if (
			typeof parsed.id !== "string" ||
			typeof parsed.process !== "string" ||
			typeof parsed.since !== "string" ||
			typeof parsed.token !== "string" ||
			typeof parsed.hash !== "string" ||
			parsed.hash.length === 0
		) {
			return null;
		}
		return parsed as LockHandoff;
	} catch {
		return null;
	}
}

/**
 *
 */
function readRecord(file: string): LockRecord | null {
	// Missing, truncated, invalid JSON, or a record without its lease/token reads
	// as free. Treating corruption as held would create the permanent flag the
	// lease design exists to avoid.
	let raw: string;
	try {
		raw = fs.readFileSync(file, "utf-8");
	} catch {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<LockRecord>;
		if (!parsed || typeof parsed.id !== "string" || typeof parsed.until !== "string") {
			return null;
		}
		if (typeof parsed.token !== "string") {
			return null;
		}
		return parsed as LockRecord;
	} catch {
		return null;
	}
}

/**
 *
 */
function writeJsonRecord(file: string, record: object, token = newToken()): void {
	// Rename ensures readers see the complete old record or complete new record,
	// never a torn lease that could admit a second writer. No fsync is required:
	// after power loss the holder process is gone too, so persistence buys no
	// safety. The token, not pid, distinguishes concurrent attempts.
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
 *
 */
function writeRecord(file: string, record: LockRecord): void {
	writeJsonRecord(file, record, record.token);
}

/**
 *
 */
function writeHandoff(board: string, record: LockRecord): void {
	// The handoff is written before lease removal. Failure loses optional proof,
	// but must never keep every future writer behind an already committed lease.
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
 *
 */
function takeHandoff(board: string, predecessor: LockRecord | null): string | undefined {
	// Consume every receipt, valid or not, so it is one-use. Trust it only when
	// id, process, original since time, and token exactly match the blocker this
	// waiter actually observed; an unobserved or intervening writer proves none
	// of the successor's conflict baseline.
	const file = handoffPathFor(board);
	const handoff = readHandoff(file);
	try {
		fs.unlinkSync(file);
	} catch {
		/* absent, malformed, or already consumed */
	}
	if (
		!handoff ||
		!predecessor ||
		handoff.id !== predecessor.id ||
		handoff.process !== predecessor.process ||
		handoff.since !== predecessor.since ||
		handoff.token !== predecessor.token
	) {
		return undefined;
	}
	return handoff.hash;
}

/**
 *
 */
function liveRecord(record: LockRecord | null): LockRecord | null {
	if (!record) {
		return null;
	}
	const until = Date.parse(record.until);
	return Number.isFinite(until) && until > Date.now() ? record : null;
}

/**
 *
 */
function holderOf(record: LockRecord): LockHolder {
	const { token: _token, committedHash: _committedHash, ...holder } = record;
	return holder;
}

/**
 *
 */
function boardLockState(board: string): LockHolder | null {
	const live = liveRecord(readRecord(lockPathFor(normalizeBoardKey(board))));
	return live ? holderOf(live) : null;
}

/**
 *
 */
function announce(board: string, holder: LockHolder | null): void {
	// Renewal changes `until` but not whether a pane may draw, so expiry is absent
	// from this fingerprint. Holder/start/reason/claim changes remain real news.
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
 *
 */
function announceHeld(board: string, holder: LockHolder): void {
	announce(board, holder);
}

/**
 *
 */
function announceFree(board: string): void {
	// Release news goes out at once (TASK-153): a pane left believing a free
	// board is held is a pane refusing edits for no reason. Re-read rather than
	// assume, so a board another process has taken meanwhile is announced held,
	// never falsely free from stale release state.
	announce(board, boardLockState(board));
}

/**
 *
 */
function recordLockCommit(board: string, leaseToken: string, hash: string): boolean {
	// Attach the note hash only when the exact enclosing lease still owns the
	// file. This is best-effort proof; persistence has already succeeded.
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
 *
 */
function releaseHold(board: string, holderId: string): boolean {
	// Release only if it is still ours. A lapsed lease may already belong to a
	// successor, and unlinking that record would admit a third writer.
	// Ordering is deliberate: optional handoff, immediate unlink, then the news.
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
 *
 */
function renewRecord(board: string, id: string, leaseMs: number): LockHolder | null {
	// Renewal answers only "do I still have this?" It refuses to acquire a free
	// or rival lease, preventing a remotely revoked claim from resurrecting.
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
 *
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
 *
 */
function watchBoardLocks(boards: (() => string[]) | null): void {
	// A lock file cannot call another canvas. Poll only while a browser supplies
	// boards that are actually on screen; with no pane, nobody can be misled.
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
	timer.unref?.();
	processWatcher.timer = timer;
}

/**
 *
 */
function onBoardSweep(sink: ((board: string) => void) | null): void {
	processSweep.also = sink;
}

/**
 *
 */
function onBoardLockChanged(sink: LockSink | null): void {
	processSink.notify = sink;
}

/**
 *
 */
function forgetLockState(): void {
	// Drop only this process's remembered announcements. Vault records remain
	// authoritative and untouched.
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

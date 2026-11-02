// The lease on disk that makes one writer at a time per model true (ADR 0016),
// and the announcements that tell every pane who has the model now.

import fs from "node:fs";
import path from "node:path";

import { MODEL_LOCK_MS } from "@archboard/timing";
import {
	VAULT_STATE_DIR,
	modelMemoryKey,
	normalizePaneKey,
} from "#runtime/store/legacy-address.ts";
import { logger } from "@archboard/diagnostics/logger";
import type { LockHolder, LockRecord, LockSink } from "#runtime/store/lock/contracts.ts";
import { isRecord, stringAt } from "@archboard/diagnostics/unknown-record";

const processAnnounced = new Map<string, string>();
const processSink = { notify: null as LockSink | null };
const processSweep = { also: null as ((vault: string, model: string) => void) | null };
const processWatcher: {
	watched: WatchedModels | null;
	timer: ReturnType<typeof setInterval> | null;
} = { watched: null, timer: null };

/** One model of one vault. */
interface WatchedModel {
	readonly vault: string;
	readonly model: string;
}

/** The models a browser has on screen, each with the vault it lives in. */
interface WatchedModels {
	readonly models: () => readonly WatchedModel[];
}

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
 * Where one legacy board's lease lives.
 *
 * One percent-encoded filename per normalized legacy board keeps nested legacy board names
 * from becoming directories and makes this the sole vault lock-path owner.
 * @param vault The vault root the legacy board lives in.
 * @param model The legacy board key.
 * @returns The lease file's path.
 */
function lockPathFor(vault: string, model: string): string {
	return path.join(
		vault,
		VAULT_STATE_DIR,
		"locks",
		`${encodeURIComponent(normalizePaneKey(model))}.lock`,
	);
}

/**
 * Read one lease.
 *
 * Missing, truncated, invalid JSON, or a record without its lease or token
 * reads as free. Treating corruption as held would create the permanent flag
 * the lease design exists to avoid.
 * @param file The lease file's path.
 * @returns The lease, or null when the model is free.
 */
function readRecord(file: string): LockRecord | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
	} catch {
		return null;
	}
	if (!isRecord(parsed)) {
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
 * Write one lease so a reader never sees a torn one.
 *
 * Rename ensures readers see the complete old record or the complete new one,
 * never a torn lease that could admit a second writer. No fsync is required:
 * after power loss the holder process is gone too, so persistence buys no
 * safety. The acquisition token, not the pid, distinguishes concurrent
 * attempts and names the temp file this is written through.
 * @param file The lease file's path.
 * @param record The lease.
 * @throws {Error} When the write or the rename fails.
 */
function writeRecord(file: string, record: LockRecord): void {
	const dir = path.dirname(file);
	fs.mkdirSync(dir, { recursive: true });
	const tmp = path.join(dir, `.${path.basename(file)}.${record.token}.tmp`);
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
 * The lease as a caller is told about it: who has the model and until when,
 * without the acquisition token, which is the lease's own bookkeeping.
 * @param record The lease.
 * @returns The holder.
 */
function holderOf(record: LockRecord): LockHolder {
	const { token: _token, ...holder } = record;
	return holder;
}

/**
 * Who has one legacy board now.
 * @param vault The vault root the legacy board lives in.
 * @param model The legacy board key.
 * @returns The holder, or null when the legacy board is free.
 */
function modelLockState(vault: string, model: string): LockHolder | null {
	const live = liveRecord(readRecord(lockPathFor(vault, normalizePaneKey(model))));
	return live ? holderOf(live) : null;
}

/**
 * Identify visible lease changes without treating renewal as new ownership.
 * @param holder The visible model holder, or absence.
 * @returns The visible ownership fingerprint.
 */
function lockFingerprint(holder: LockHolder | null): string {
	return holder
		? `${holder.id}|${holder.kind}|${holder.since}|${holder.reason ?? ""}|${holder.claimed ? "claim" : "write"}`
		: "";
}

/**
 * Tell the panes who has a legacy board, unless they have already been told this.
 *
 * Renewal changes `until` but not whether a pane may draw, so expiry is absent
 * from this fingerprint. Holder, start, reason and claim changes remain real
 * news. What was told is remembered per legacy board of a vault, so a legacy board of one
 * name in two vaults is told twice.
 * @param vault The vault root the legacy board lives in.
 * @param model The legacy board key.
 * @param holder Who has it, or null when it is free.
 */
function announce(vault: string, model: string, holder: LockHolder | null): void {
	// Reserved internal locks are not models. Their public operation owns its news.
	if (model.startsWith("@")) return;
	const announced = lockFingerprint(holder);
	const key = modelMemoryKey(vault, model);
	if (processAnnounced.get(key) === announced) {
		return;
	}
	processAnnounced.set(key, announced);
	processSink.notify?.(vault, normalizePaneKey(model), holder);
}

/**
 * Tell the panes a legacy board is held.
 * @param vault The vault root the legacy board lives in.
 * @param model The legacy board key.
 * @param holder Who has it.
 */
function announceHeld(vault: string, model: string, holder: LockHolder): void {
	announce(vault, model, holder);
}

/**
 * Tell the panes a legacy board has come free.
 *
 * Release news goes out at once (TASK-153): a pane left believing a free legacy board
 * is held is a pane refusing edits for no reason. The lease is re-read rather
 * than assumed, so a legacy board another process has taken meanwhile is announced
 * held, never falsely free from stale release state.
 * @param vault The vault root the legacy board lives in.
 * @param model The legacy board key.
 */
function announceFree(vault: string, model: string): void {
	announce(vault, model, modelLockState(vault, model));
}

/**
 * Give one legacy board back.
 *
 * Released only if the lease is still ours: a lapsed one may already belong to
 * a successor, and unlinking that record would admit a third writer. The
 * ordering is deliberate — immediate unlink, then the news.
 * @param vault The vault root the legacy board lives in.
 * @param model The legacy board key.
 * @param holderId Who is releasing it.
 * @returns True when this holder had it to release.
 */
function releaseHold(vault: string, model: string, holderId: string): boolean {
	const key = normalizePaneKey(model);
	const file = lockPathFor(vault, key);
	const current = readRecord(file);
	if (!current || current.id !== holderId) {
		return false;
	}
	try {
		fs.unlinkSync(file);
	} catch {
		/* already gone: released is released */
	}
	announceFree(vault, key);
	return true;
}

/**
 * Keep a lease this holder already has.
 *
 * Renewal answers only "do I still have this?" It refuses to acquire a free or
 * rival lease, which is what keeps a remotely revoked claim from resurrecting.
 *
 * A lease that lapsed while it still names this holder is still theirs: nobody
 * took it, the renewal was only late. A server busy with one long synchronous
 * piece of work runs no timer until it is done, and that pause must not end
 * every claim it renews (TASK-489). A process that takes the lapsed lease in
 * the meantime writes its own record, and the next renewal is refused.
 * @param vault The vault root the legacy board lives in.
 * @param model The legacy board key.
 * @param id Who is renewing.
 * @param leaseMs How much longer to hold it.
 * @returns The renewed holder, or null when the lease is no longer theirs.
 */
function renewRecord(vault: string, model: string, id: string, leaseMs: number): LockHolder | null {
	const file = lockPathFor(vault, model);
	const current = readRecord(file);
	if (!current || current.id !== id) {
		return null;
	}
	const renewed: LockRecord = { ...current, until: stamp(Date.now() + leaseMs) };
	writeRecord(file, renewed);
	announceHeld(vault, model, holderOf(renewed));
	return holderOf(renewed);
}

/**
 * Look at every model on screen and announce who has it.
 */
function sweepModelLocks(): void {
	if (!processWatcher.watched) {
		return;
	}
	const watched = new Map<string, WatchedModel>();
	for (const { vault, model } of processWatcher.watched.models()) {
		watched.set(modelMemoryKey(vault, model), { vault, model: normalizePaneKey(model) });
	}
	for (const { vault, model } of watched.values()) {
		// The note-watch passenger shares this exact model list and cadence. It runs
		// first, but its failure must never stop lock observation.
		try {
			processSweep.also?.(vault, model);
		} catch (error) {
			logger.warn(`Model lock sweep passenger failed for "${model}"; lock watch continues.`, {
				error,
			});
		}
		announce(vault, model, modelLockState(vault, model));
	}
}

/**
 * Watch the models a browser has on screen.
 *
 * A lock file cannot call another server, so the state is polled. Polling runs
 * only while a browser supplies models that are actually on screen; with no
 * pane, nobody can be misled.
 * @param watched Which models are on screen, each with the vault it lives in, or
 *   null to stop watching.
 */
function watchModelLocks(watched: WatchedModels | null): void {
	processWatcher.watched = watched;
	if (!watched) {
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
		sweepModelLocks();
	}, MODEL_LOCK_MS.watch);
	// The poll must not be the reason a process stays alive.
	timer.unref();
	processWatcher.timer = timer;
}

/**
 * Ride along with the lock sweep, which is the one poll that already knows
 * which models are on screen.
 * @param sink What to run for each model of a vault, or null to stop.
 */
function onBoardSweep(sink: ((vault: string, model: string) => void) | null): void {
	processSweep.also = sink;
}

/**
 * Hear who has a model whenever it changes.
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
	type WatchedModel,
	type WatchedModels,
	announceHeld,
	modelLockState,
	forgetLockState,
	holderOf,
	liveRecord,
	lockPathFor,
	newToken,
	onBoardLockChanged,
	onBoardSweep,
	readRecord,
	releaseHold,
	renewRecord,
	stamp,
	watchModelLocks,
	writeRecord,
};

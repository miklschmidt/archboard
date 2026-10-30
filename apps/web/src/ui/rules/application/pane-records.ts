// What the application has collected from each pane's session: its status,
// who holds its board, and where a take-back stands. Pure: keyed by pane id,
// replaced rather than mutated.

import type { TakeBackState } from "#ui/rules/shell/contracts.ts";
import type { LockHolder, PaneStatus } from "#ui/rules/pane-session/session-types.ts";

/** Everything the application has heard from one pane. */
interface PaneRecord {
	readonly status: PaneStatus;
	readonly holder: LockHolder | null;
	readonly takeBack: TakeBackState;
}

/** Every field a patch may carry; `patchRecord` compares them one by one. */
const RECORD_FIELDS = [
	"status",
	"holder",
	"takeBack",
] as const satisfies readonly (keyof PaneRecord)[];

/** The records by pane id. */
type PaneRecords = Readonly<Record<string, PaneRecord>>;

/**
 * Whether this pane can be addressed by a browser command.
 * @param status What the pane last reported.
 * @returns True after its socket and registration are both accepted.
 */
function paneReady(status: PaneStatus): boolean {
	return status.connected && status.registered && status.clientId !== "";
}

const IDLE_TAKE_BACK: TakeBackState = Object.freeze({ kind: "idle" });

/**
 * The status of a pane nothing has been heard from.
 * @param paneId The pane.
 * @returns A disconnected, boardless status.
 */
function emptyPaneStatus(paneId: string): PaneStatus {
	return {
		paneId,
		clientId: "",
		connected: false,
		registered: false,
		board: null,
		boardKey: null,
		opened: null,
		view: null,
		presenting: false,
		lastChangeAt: null,
		doing: [],
		version: null,
		vault: null,
		repository: null,
	};
}

/**
 * The record of a pane nothing has been heard from.
 * @param paneId The pane.
 * @returns The initial record.
 */
function initialPaneRecord(paneId: string): PaneRecord {
	return Object.freeze({
		status: emptyPaneStatus(paneId),
		holder: null,
		takeBack: IDLE_TAKE_BACK,
	});
}

/**
 * One pane's record, initial when nothing has been heard.
 * @param records The records.
 * @param paneId The pane.
 * @returns The record.
 */
function recordFor(records: PaneRecords, paneId: string): PaneRecord {
	return records[paneId] ?? initialPaneRecord(paneId);
}

/**
 * Replace part of one pane's record.
 * @param records The records.
 * @param paneId The pane.
 * @param patch What changed.
 * @returns The records with that pane updated.
 */
function patchRecord(
	records: PaneRecords,
	paneId: string,
	patch: Partial<PaneRecord>,
): PaneRecords {
	const current = recordFor(records, paneId);
	// A patch that changes no field keeps the records' identity, so a pane
	// re-reporting the same status cannot re-render the application forever.
	const unchanged = RECORD_FIELDS.every(
		(field) => !(field in patch) || Object.is(current[field], patch[field]),
	);
	if (paneId in records && unchanged) {
		return records;
	}
	return { ...records, [paneId]: Object.freeze({ ...current, ...patch }) };
}

/**
 * Forget a pane.
 * @param records The records.
 * @param paneId The pane.
 * @returns The records without it.
 */
function dropRecord(records: PaneRecords, paneId: string): PaneRecords {
	const { [paneId]: dropped, ...rest } = records;
	return dropped === undefined ? records : rest;
}

/** A board one pane holds, and the vault it is a board of. */
interface HeldBoard {
	readonly vault: string;
	readonly key: string;
}

/**
 * The boards the panes hold, deduplicated, in pane order. Two repositories can
 * each have a board of the same name, so a board is held in its vault.
 * @param records The records.
 * @param paneIds The panes, in reading order.
 * @returns The boards.
 */
function heldBoards(records: PaneRecords, paneIds: readonly string[]): readonly HeldBoard[] {
	const held: HeldBoard[] = [];
	for (const paneId of paneIds) {
		const { boardKey: key, vault } = recordFor(records, paneId).status;
		if (key !== null && vault !== null && !held.some((each) => sameHeld(each, { vault, key }))) {
			held.push({ vault, key });
		}
	}
	return held;
}

/**
 * Whether two held boards are one.
 * @param a One.
 * @param b The other.
 * @returns True when both name one board of one vault.
 */
function sameHeld(a: HeldBoard, b: HeldBoard): boolean {
	return a.vault === b.vault && a.key === b.key;
}

/**
 * The boards that were held and are not held any more.
 *
 * Letting go of a board is the moment what the server holds for it matters
 * again: a board no pane is showing may have been written since anybody
 * looked, and nothing announces a change to a board this tab is not on.
 * @param before The boards held at the last check.
 * @param now The boards held now.
 * @returns The released boards, in the order they were held.
 */
function releasedBoards(
	before: readonly HeldBoard[],
	now: readonly HeldBoard[],
): readonly HeldBoard[] {
	return before.filter((held) => !now.some((each) => sameHeld(each, held)));
}

export {
	dropRecord,
	emptyPaneStatus,
	heldBoards,
	initialPaneRecord,
	patchRecord,
	paneReady,
	recordFor,
	releasedBoards,
	type HeldBoard,
	type PaneRecord,
	type PaneRecords,
};

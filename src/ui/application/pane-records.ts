// What the application has collected from each pane's session: its status,
// who holds its board, the take-back state, and the projections the inspector
// reads. Pure: keyed by pane id, replaced rather than mutated.

import type { PathFocusOverlay, PathFocusSnapshot } from "@/ui/path-focus";
import type { SelectionProjection } from "@/ui/selection-inspector";
import type { TakeBackState } from "@/ui/shell";
import type { LockHolder, PaneStatus } from "@/ui/types";

/** Everything the application has heard from one pane. */
interface PaneRecord {
	readonly status: PaneStatus;
	readonly holder: LockHolder | null;
	readonly takeBack: TakeBackState;
	readonly selection: SelectionProjection;
	readonly pathFocus: PathFocusSnapshot;
	readonly overlay: PathFocusOverlay | null;
	/** The board is scratch: a note without a chosen name (ADR 0009). */
	readonly placeholder: boolean;
}

/** Every field a patch may carry; `patchRecord` compares them one by one. */
const RECORD_FIELDS = [
	"status",
	"holder",
	"takeBack",
	"selection",
	"pathFocus",
	"overlay",
	"placeholder",
] as const satisfies readonly (keyof PaneRecord)[];

/** The records by pane id. */
type PaneRecords = Readonly<Record<string, PaneRecord>>;

const IDLE_TAKE_BACK: TakeBackState = Object.freeze({ kind: "idle" });
const EMPTY_SELECTION: SelectionProjection = Object.freeze({ kind: "empty" });
const INACTIVE_FOCUS: PathFocusSnapshot = Object.freeze({ kind: "inactive" });

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
		board: null,
		boardKey: null,
		elementCount: 0,
		lastChangeAt: null,
		hold: null,
		writtenElsewhere: null,
		doing: [],
		noteVersion: null,
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
		selection: EMPTY_SELECTION,
		pathFocus: INACTIVE_FOCUS,
		overlay: null,
		placeholder: false,
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

/**
 * The board keys the panes hold, deduplicated, in pane order.
 * @param records The records.
 * @param paneIds The panes, in reading order.
 * @returns The keys.
 */
function heldBoardKeys(records: PaneRecords, paneIds: readonly string[]): readonly string[] {
	const keys: string[] = [];
	for (const paneId of paneIds) {
		const key = recordFor(records, paneId).status.boardKey;
		if (key !== null && !keys.includes(key)) {
			keys.push(key);
		}
	}
	return keys;
}

export {
	dropRecord,
	emptyPaneStatus,
	heldBoardKeys,
	initialPaneRecord,
	patchRecord,
	recordFor,
	type PaneRecord,
	type PaneRecords,
};

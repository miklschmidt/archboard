// What the application has collected from each pane's session: its status,
// and its reported holder. Pure: keyed by pane id,
// replaced rather than mutated.

import type { LockHolder, PaneStatus } from "#ui/rules/pane-session/session-types.ts";

/** Everything the application has heard from one pane. */
interface PaneRecord {
	readonly status: PaneStatus;
	readonly holder: LockHolder | null;
}

/** Every field a patch may carry; `patchRecord` compares them one by one. */
const RECORD_FIELDS = ["status", "holder"] as const satisfies readonly (keyof PaneRecord)[];

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

export {
	dropRecord,
	emptyPaneStatus,
	initialPaneRecord,
	patchRecord,
	paneReady,
	recordFor,
	type PaneRecord,
	type PaneRecords,
};

// The two note states a pane can be in (ADR 0006, TASK-062), remembered per
// pane so each beginning and ending is reported once, and each state's dialog
// is shown once. Pure state outside React: the pane host observes every
// status and the application reacts at the event, not by diffing renders.

import type { RecoveryKind } from "@/ui/shell";
import type { PaneStatus } from "@/ui/types";

/** A note state transition, as one pane's status crosses it. */
type NoteStateChange = "hold-began" | "hold-ended" | "elsewhere-began" | "elsewhere-ended";

/** A note state whose dialog has not been shown yet. */
interface PendingRecovery {
	readonly paneId: string;
	readonly status: PaneStatus;
	readonly kind: RecoveryKind;
}

/** What one pane's memory holds: the markers seen, and the markers shown. */
interface PaneMemory {
	status: PaneStatus;
	hold: string | null;
	elsewhere: string | null;
	shownHold: string | null;
	shownElsewhere: string | null;
}

/**
 * The hold's marker: a hold is one from the moment it began.
 * @param status The status.
 * @returns The `since`, or null without a hold.
 */
function holdMarker(status: PaneStatus): string | null {
	return status.hold?.since ?? null;
}

/**
 * The written-elsewhere marker: one write is one state.
 * @param status The status.
 * @returns The `writtenAt`, or null when nothing was written elsewhere.
 */
function elsewhereMarker(status: PaneStatus): string | null {
	return status.writtenElsewhere?.writtenAt ?? null;
}

/**
 * The transition one marker made, if any.
 * @param previous The marker last seen.
 * @param next The marker now.
 * @param began The change when the marker is new.
 * @param ended The change when it cleared.
 * @returns The change, or null while the marker stands or stays absent.
 */
function transition(
	previous: string | null,
	next: string | null,
	began: NoteStateChange,
	ended: NoteStateChange,
): NoteStateChange | null {
	if (next === previous) {
		return null;
	}
	return next === null ? ended : began;
}

/**
 * The recovery a pane's status asks for and has not been shown.
 * @param paneId The pane.
 * @param memory Its memory.
 * @returns The pending recovery, or null.
 */
function pendingFor(paneId: string, memory: PaneMemory): PendingRecovery | null {
	const { status } = memory;
	const hold = holdMarker(status);
	if (hold !== null) {
		return memory.shownHold === hold ? null : { paneId, status, kind: "hold" };
	}
	const elsewhere = elsewhereMarker(status);
	if (elsewhere !== null && memory.shownElsewhere !== elsewhere) {
		return { paneId, status, kind: "elsewhere" };
	}
	return null;
}

/**
 * A shown marker outlives its state only while the state stands: a hold that
 * ends and returns with the same marker is shown again.
 * @param marker The state's marker now, or null when the state ended.
 * @param shown The marker shown before, if any.
 * @returns The marker still counted as shown.
 */
function stillShown(marker: string | null, shown: string | null | undefined): string | null {
	return marker === null ? null : (shown ?? null);
}

/**
 * A pane's memory after a status.
 * @param status The status.
 * @param previous The memory before it, if any.
 * @returns The memory now.
 */
function remember(status: PaneStatus, previous: PaneMemory | undefined): PaneMemory {
	const hold = holdMarker(status);
	const elsewhere = elsewhereMarker(status);
	return {
		status,
		hold,
		elsewhere,
		shownHold: stillShown(hold, previous?.shownHold),
		shownElsewhere: stillShown(elsewhere, previous?.shownElsewhere),
	};
}

/**
 * The transitions between two memories, hold first.
 * @param previous The memory before, if any.
 * @param next The memory now.
 * @returns The changes.
 */
function changesBetween(previous: PaneMemory | undefined, next: PaneMemory): NoteStateChange[] {
	return [
		transition(previous?.hold ?? null, next.hold, "hold-began", "hold-ended"),
		transition(previous?.elsewhere ?? null, next.elsewhere, "elsewhere-began", "elsewhere-ended"),
	].filter((change): change is NoteStateChange => change !== null);
}

/** The note states of every pane, as the host has heard them. */
class NoteRecoveryMemory {
	readonly #panes = new Map<string, PaneMemory>();

	/**
	 * A pane published its status.
	 * @param status The status.
	 * @returns The transitions it made since the last status, hold first.
	 */
	observe(status: PaneStatus): readonly NoteStateChange[] {
		const previous = this.#panes.get(status.paneId);
		const next = remember(status, previous);
		this.#panes.set(status.paneId, next);
		return changesBetween(previous, next);
	}

	/**
	 * The first note state whose dialog has not been shown, in the order the
	 * panes first reported. A hold outranks a write elsewhere on the same pane.
	 * @returns The pending recovery, or null when every state has had its dialog.
	 */
	pending(): PendingRecovery | null {
		for (const [paneId, memory] of this.#panes) {
			const pending = pendingFor(paneId, memory);
			if (pending !== null) {
				return pending;
			}
		}
		return null;
	}

	/**
	 * The dialog for a state was shown.
	 * @param paneId The pane.
	 * @param kind Which state.
	 * @param marker The state's marker: the hold's `since` or the write's `writtenAt`.
	 */
	shown(paneId: string, kind: RecoveryKind, marker: string): void {
		const memory = this.#panes.get(paneId);
		if (memory === undefined) {
			return;
		}
		if (kind === "hold") {
			memory.shownHold = marker;
		} else {
			memory.shownElsewhere = marker;
		}
	}

	/**
	 * A pane closed; nothing about it is remembered.
	 * @param paneId The pane.
	 */
	forget(paneId: string): void {
		this.#panes.delete(paneId);
	}
}

/**
 * The marker of a recovery's state.
 * @param status The status.
 * @param kind Which state.
 * @returns The marker, or null when the status no longer has that state.
 */
function recoveryMarker(status: PaneStatus, kind: RecoveryKind): string | null {
	return kind === "hold" ? holdMarker(status) : elsewhereMarker(status);
}

export { NoteRecoveryMemory, recoveryMarker, type NoteStateChange, type PendingRecovery };

// The two note states a pane can be in (ADR 0006, TASK-062), kept visible as
// notices while they last, and each raised once as its dialog when it
// begins. A dismissed dialog stays reachable from the notice.

import { useEffect, useRef } from "react";

import { contextFor } from "@/ui/application/lib/shell-actions";
import { elsewhereNotice, holdNotice } from "@/ui/application/notices";
import { recordFor, type PaneRecord } from "@/ui/application/pane-records";
import type { PaneList } from "@/ui/application/pane-list";
import type { BoardDialogs } from "@/ui/application/lib/use-board-dialogs";
import type { NoticeStack } from "@/ui/application/lib/use-notices";
import type { Panes } from "@/ui/application/lib/use-panes";

/** The moments already raised as dialogs, per pane. */
interface Raised {
	hold: string | null;
	elsewhere: string | null;
}

/** What one pane's reconciliation reads. */
interface Reconciliation {
	readonly list: PaneList;
	readonly record: PaneRecord;
	readonly seen: Raised;
	readonly raise: NoticeStack["raise"];
	readonly dismiss: NoticeStack["dismiss"];
	readonly dialogs: BoardDialogs;
	/** A dialog is already open; a new state waits for the notice's action. */
	readonly dialogOpen: boolean;
}

/**
 * Keep the hold notice current and raise the conflict dialog once per hold.
 * @param paneId The pane.
 * @param inputs What to reconcile.
 */
function reconcileHold(paneId: string, inputs: Reconciliation): void {
	const { record, seen, raise, dismiss, dialogs } = inputs;
	const { hold, boardKey } = record.status;
	if (hold === null) {
		dismiss(`hold:${paneId}`);
		seen.hold = null;
		return;
	}
	raise(holdNotice(paneId, boardKey ?? hold.board, hold.writes));
	if (seen.hold !== hold.since && !inputs.dialogOpen) {
		seen.hold = hold.since;
		dialogs.openConflict(hold.conflict, hold, contextFor(inputs.list, record));
	}
}

/**
 * Keep the written-elsewhere notice current and raise its dialog once per write.
 * @param paneId The pane.
 * @param inputs What to reconcile.
 */
function reconcileElsewhere(paneId: string, inputs: Reconciliation): void {
	const { record, seen, raise, dismiss, dialogs } = inputs;
	const { writtenElsewhere, boardKey, hold } = record.status;
	if (writtenElsewhere === null) {
		dismiss(`elsewhere:${paneId}`);
		seen.elsewhere = null;
		return;
	}
	raise(elsewhereNotice(paneId, boardKey ?? writtenElsewhere.board));
	const fresh = seen.elsewhere !== writtenElsewhere.writtenAt;
	if (fresh && !inputs.dialogOpen && hold === null) {
		seen.elsewhere = writtenElsewhere.writtenAt;
		dialogs.openElsewhere(contextFor(inputs.list, record));
	}
}

/**
 * Keep the note notices current and raise each new state's dialog once.
 * @param panes The panes.
 * @param notices The notice stack.
 * @param dialogs The dialogs.
 */
function useNoteRecovery(panes: Panes, notices: NoticeStack, dialogs: BoardDialogs): void {
	const raised = useRef(new Map<string, Raised>());
	const { list, records } = panes;
	// The two functions are stable; the stack itself changes with every notice.
	const { raise, dismiss } = notices;
	const dialogOpen = dialogs.state.open.kind !== "none";
	useEffect(() => {
		for (const entry of list.panes) {
			const seen = raised.current.get(entry.paneId) ?? { hold: null, elsewhere: null };
			const inputs: Reconciliation = {
				list,
				record: recordFor(records, entry.paneId),
				seen,
				raise,
				dismiss,
				dialogs,
				dialogOpen,
			};
			reconcileHold(entry.paneId, inputs);
			reconcileElsewhere(entry.paneId, inputs);
			raised.current.set(entry.paneId, seen);
		}
	}, [list, records, raise, dismiss, dialogs, dialogOpen]);
}

export { useNoteRecovery };

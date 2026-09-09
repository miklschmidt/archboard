// Whether a pane may lose what it is showing, and what the person is told when
// it may not.
//
// One rule for every way a board leaves a pane: the board picker, a board link,
// closing a pane, and the address bar. A pane whose canvas holds work the note
// has not got is not navigated away from, because a board arriving replaces the
// scene wholesale and that work is in nothing else (ADR 0006, ADR 0022). The
// workspace and the address both stay as they were; the person recovers first —
// the hold's own dialog, or simply the moment it takes an edit to reach the
// server — and then asks again.

import type { BoardCommandContext } from "@/ui/application/board-commands";
import { navigationBlockReason, navigationBlockedNotice } from "@/ui/application/notices";
import { recordFor, type PaneRecords } from "@/ui/application/pane-records";
import type { PaneHandles } from "@/ui/application/lib/pane-handles";
import type { BoardDialogs } from "@/ui/application/hooks/use-board-dialogs";
import type { NoticeStack } from "@/ui/application/hooks/use-notices";
import type { Panes } from "@/ui/application/hooks/use-panes";
import type { DialogError } from "@/ui/dialog-parts";
import type { GuardVerdict, NavigationBlock } from "@/ui/board-routing/contracts";
import type { BoardHold } from "@/ui/types";

const CLEAR: GuardVerdict = Object.freeze({ kind: "clear" });

/** What the guard reads: what each pane reported, and what it is still saving. */
interface GuardedPanes {
	readonly records: PaneRecords;
	readonly pendingEdits: (paneId: string) => boolean;
}

/** Where a refusal is shown. */
interface BlockReportOwners {
	readonly dialogs: BoardDialogs;
	readonly notices: NoticeStack;
}

/** What a surface asking to move a pane acts on. */
interface MoveOwners extends BlockReportOwners {
	readonly panes: Panes;
}

/**
 * The panes as the guard reads them.
 * @param records What each pane reported.
 * @param handles The pane sessions, which know what is still in flight.
 * @returns The guard's view.
 */
function guardedPanes(records: PaneRecords, handles: PaneHandles): GuardedPanes {
	return {
		records,
		/**
		 * Whether a pane holds an edit the server has not taken yet.
		 * @param paneId The pane.
		 * @returns True while anything is pending, scheduled or in flight.
		 */
		pendingEdits: (paneId: string): boolean => handles.session(paneId)?.pendingEdits() === true,
	};
}

/**
 * Whether one pane may lose its board.
 * @param panes The panes.
 * @param paneId The pane.
 * @returns The verdict for that pane.
 */
function guardPane(panes: GuardedPanes, paneId: string): GuardVerdict {
	// The hold first: it is the durable state, it has its own recovery, and a
	// held board is the one whose changes the note will never get by itself.
	if (recordFor(panes.records, paneId).status.hold !== null) {
		return { kind: "hold", paneId };
	}
	if (panes.pendingEdits(paneId)) {
		return { kind: "pending", paneId };
	}
	return CLEAR;
}

/**
 * Whether every pane a navigation would move or close may lose its board.
 * Preflight: nothing is applied until all of them agree.
 * @param panes The panes.
 * @param paneIds The panes at risk, in the order the navigation would touch them.
 * @returns Clear, or the first pane that refuses and why.
 */
function guardNavigation(panes: GuardedPanes, paneIds: readonly string[]): GuardVerdict {
	for (const paneId of paneIds) {
		const verdict = guardPane(panes, paneId);
		if (verdict.kind !== "clear") {
			return verdict;
		}
	}
	return CLEAR;
}

/**
 * Say that a navigation was refused, and offer the recovery it waits on. A
 * held board's own dialog is opened when nothing else is in the way: that
 * choice is what the pane is waiting for before it can go anywhere.
 * @param owners The dialogs and the notices.
 * @param block The pane that refused and why.
 * @param context That pane's command context, for the conflict dialog.
 * @param hold The pane's hold, when it has one.
 */
function reportNavigationBlock(
	owners: BlockReportOwners,
	block: NavigationBlock,
	context: BoardCommandContext,
	hold: BoardHold | null,
): void {
	owners.notices.raise(navigationBlockedNotice(block.paneId, block.kind));
	if (block.kind === "hold" && hold !== null && owners.dialogs.state.open.kind === "none") {
		owners.dialogs.openConflict(hold.conflict, hold, context);
	}
}

/**
 * Whether one pane may be moved by a surface that is already open in front of
 * the person — a board dialog, or a board link — asked of the pane as it is
 * now rather than as it was when they started.
 *
 * The refusal is both said in the shell and handed back, so it reaches the
 * person where they are looking rather than only behind what they are using.
 * @param owners The panes, the dialogs and the notices.
 * @param context The pane the move is for.
 * @returns The refusal to show, or null when the move may go ahead.
 */
function refuseMove(owners: MoveOwners, context: BoardCommandContext): DialogError | null {
	const { panes } = owners;
	const record = recordFor(panes.records, context.paneId);
	const verdict = guardPane(guardedPanes(panes.records, panes.handles), context.paneId);
	if (verdict.kind === "clear") {
		return null;
	}
	reportNavigationBlock(owners, verdict, context, record.status.hold);
	return { title: "Open board", message: navigationBlockReason(context.paneId, verdict.kind) };
}

export {
	guardNavigation,
	guardPane,
	guardedPanes,
	refuseMove,
	reportNavigationBlock,
	type BlockReportOwners,
	type GuardedPanes,
	type MoveOwners,
};

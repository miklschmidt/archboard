import { expect, test } from "bun:test";

import { guardNavigation, guardPane, type GuardedPanes } from "@/ui/application/navigation-guard";
import { emptyPaneStatus, initialPaneRecord, type PaneRecord } from "@/ui/application/pane-records";
import type { BoardHold } from "@/ui/types";

/**
 * A hold on a board, as a pane reports one.
 * @param board The board that stopped saving.
 * @returns The hold.
 */
function holdOn(board: string): BoardHold {
	return {
		board,
		since: "2026-09-09T10:00:00.000Z",
		writes: 3,
		fromScreen: true,
		conflict: {
			board,
			file: `${board}.excalidraw.md`,
			reason: "changed",
			outcomes: { reload: "Reload", overwrite: "Overwrite", saveAs: "Save as" },
			message: "The note changed underneath.",
		},
		message: `${board} has stopped saving.`,
	};
}

/**
 * The panes as the guard reads them.
 * @param holds The panes whose board has stopped saving.
 * @param pending The panes with an edit the server has not taken.
 * @returns The guard's view.
 */
function panesWith(holds: readonly string[], pending: readonly string[]): GuardedPanes {
	const records: Record<string, PaneRecord> = {};
	for (const paneId of ["A", "B"]) {
		const hold = holds.includes(paneId) ? holdOn(`board-${paneId}`) : null;
		records[paneId] = {
			...initialPaneRecord(paneId),
			status: { ...emptyPaneStatus(paneId), boardKey: `board-${paneId}`, hold },
		};
	}
	return {
		records,
		/**
		 * Whether a pane is still saving.
		 * @param paneId The pane.
		 * @returns True when the test said so.
		 */
		pendingEdits: (paneId: string): boolean => pending.includes(paneId),
	};
}

test("a pane with nothing outstanding may lose its board", () => {
	expect(guardPane(panesWith([], []), "A")).toEqual({ kind: "clear" });
	expect(guardNavigation(panesWith([], []), ["A", "B"])).toEqual({ kind: "clear" });
});

test("a pane holding an edit the server has not taken refuses to be navigated away from", () => {
	expect(guardPane(panesWith([], ["A"]), "A")).toEqual({ kind: "pending", paneId: "A" });
});

test("a board that has stopped saving refuses, and says so rather than naming the edit", () => {
	// Both are true of a held board; the hold is the one with a recovery to offer.
	expect(guardPane(panesWith(["A"], ["A"]), "A")).toEqual({ kind: "hold", paneId: "A" });
});

test("preflighting a navigation names the first pane that refuses and stops there", () => {
	expect(guardNavigation(panesWith(["B"], []), ["A", "B"])).toEqual({ kind: "hold", paneId: "B" });
	expect(guardNavigation(panesWith(["B"], []), ["A"])).toEqual({ kind: "clear" });
});

test("a navigation that takes no board away from any pane is never refused", () => {
	expect(guardNavigation(panesWith(["A", "B"], ["A", "B"]), [])).toEqual({ kind: "clear" });
});

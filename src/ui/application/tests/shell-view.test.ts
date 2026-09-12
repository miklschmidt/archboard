import { expect, test } from "bun:test";

import { addPane, initialPaneList } from "@/ui/application/pane-list";
import {
	emptyPaneStatus,
	heldBoardKeys,
	initialPaneRecord,
	patchRecord,
	releasedBoardKeys,
	type PaneRecords,
} from "@/ui/application/pane-records";
import { NO_BOARD, assembleShellView } from "@/ui/application/shell-view";
import { EMPTY_LISTING } from "@/ui/board-catalog/listing";

const CHECKOUT = { board: "Checkout", variant: "current" };

/**
 * Records for two panes: A shows Checkout, B shows nothing yet.
 * @returns The records.
 */
function twoPaneRecords(): PaneRecords {
	const statusA = {
		...emptyPaneStatus("A"),
		clientId: "A-1",
		connected: true,
		board: CHECKOUT,
		boardKey: "Checkout",
		version: 3,
	};
	return patchRecord(patchRecord({}, "A", { status: statusA, holder: null }), "B", {
		...initialPaneRecord("B"),
	});
}

test("the shell view names the active pane's board and carries its mounted panes", () => {
	const list = addPane(initialPaneList());
	const view = assembleShellView({
		theme: "dark",
		list,
		records: twoPaneRecords(),
		panes: { A: "pane-a", B: "pane-b" },
		boards: EMPTY_LISTING,
		boardsError: null,
		boardsLoading: false,
		presentation: null,
		notices: [],
		agentActivity: {},
	});
	// Pane B is focused after being added; it shows no board.
	expect(view.activePaneId).toBe("B");
	expect(view.current).toEqual(NO_BOARD);
	expect(view.panes.map((pane) => [pane.status.paneId, pane.stage])).toEqual([
		["A", "pane-a"],
		["B", "pane-b"],
	]);
	expect(view.selectedBoardKey).toBeNull();
});

test("the focused pane's board key is the selected navigator entry and held keys deduplicate", () => {
	const records = twoPaneRecords();
	const view = assembleShellView({
		theme: "light",
		list: initialPaneList(),
		records,
		panes: {},
		boards: EMPTY_LISTING,
		boardsError: "offline",
		boardsLoading: false,
		presentation: { kind: "live", paneId: "A" },
		notices: [],
		agentActivity: {},
	});
	expect(view.current).toEqual(CHECKOUT);
	expect(view.selectedBoardKey).toBe("Checkout");
	expect(view.boardsError).toBe("offline");
	expect(view.presentation).toEqual({ kind: "live", paneId: "A" });
	expect(view.panes[0]?.stage).toBeNull();
	expect(heldBoardKeys(records, ["A", "B", "A"])).toEqual(["Checkout"]);
});

test("a board stops being shown when the last pane showing it lets it go", () => {
	// Two panes on one board: one of them going is not the board being released.
	expect(releasedBoardKeys(["Checkout"], ["Checkout"])).toEqual([]);
	expect(releasedBoardKeys(["Checkout", "Billing"], ["Checkout"])).toEqual(["Billing"]);
	// A pane switching board releases the one it was showing and holds another.
	expect(releasedBoardKeys(["Checkout"], ["Billing"])).toEqual(["Checkout"]);
	expect(releasedBoardKeys([], ["Checkout"])).toEqual([]);
	expect(releasedBoardKeys(["Checkout"], [])).toEqual(["Checkout"]);
});

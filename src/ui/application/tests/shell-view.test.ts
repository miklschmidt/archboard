import { expect, test } from "bun:test";

import { addPane, initialPaneList } from "@/ui/application/pane-list";
import {
	emptyPaneStatus,
	heldBoardKeys,
	initialPaneRecord,
	patchRecord,
	type PaneRecords,
} from "@/ui/application/pane-records";
import { EMPTY_LISTING, NO_BOARD, assembleShellView } from "@/ui/application/shell-view";

const CHECKOUT = { board: "Checkout", variant: "current" };

/**
 * Records for two panes: A holds Checkout, B holds nothing yet.
 * @returns The records.
 */
function twoPaneRecords(): PaneRecords {
	const statusA = {
		...emptyPaneStatus("A"),
		clientId: "A-1",
		connected: true,
		board: CHECKOUT,
		boardKey: "Checkout",
		elementCount: 3,
	};
	return patchRecord(patchRecord({}, "A", { status: statusA, holder: null }), "B", {
		...initialPaneRecord("B"),
		selection: { kind: "multiple", count: 2 },
	});
}

test("the shell view names the active pane's board and carries its projections", () => {
	const list = addPane(initialPaneList());
	const records = twoPaneRecords();
	const view = assembleShellView({
		theme: "dark",
		list,
		records,
		canvases: { A: "canvas-a", B: "canvas-b" },
		boards: EMPTY_LISTING,
		boardsError: null,
		previews: {},
		presentation: null,
		notices: [],
	});
	// Pane B is focused after being added; it holds no board.
	expect(view.activePaneId).toBe("B");
	expect(view.current).toEqual(NO_BOARD);
	expect(view.selection).toEqual({ kind: "multiple", count: 2 });
	expect(view.panes.map((pane) => [pane.status.paneId, pane.canvas])).toEqual([
		["A", "canvas-a"],
		["B", "canvas-b"],
	]);
	expect(view.selectedBoardKey).toBeNull();
});

test("the focused pane's board key is the selected navigator entry and held keys deduplicate", () => {
	const list = initialPaneList();
	const records = twoPaneRecords();
	const view = assembleShellView({
		theme: "light",
		list,
		records,
		canvases: {},
		boards: EMPTY_LISTING,
		boardsError: "offline",
		previews: {},
		presentation: { kind: "live", paneId: "A" },
		notices: [],
	});
	expect(view.current).toEqual(CHECKOUT);
	expect(view.selectedBoardKey).toBe("Checkout");
	expect(view.boardsError).toBe("offline");
	expect(view.presentation).toEqual({ kind: "live", paneId: "A" });
	expect(view.panes[0]?.canvas).toBeNull();
	expect(heldBoardKeys(records, ["A", "B", "A"])).toEqual(["Checkout"]);
});

test("scratch boards are the placeholder boards the panes hold, once each", () => {
	const list = addPane(initialPaneList());
	const scratchStatus = {
		...emptyPaneStatus("A"),
		board: { board: "scratch-7f3k", variant: "current" },
		boardKey: "scratch-7f3k",
	};
	const records = patchRecord(
		patchRecord({}, "A", { status: scratchStatus, placeholder: true }),
		"B",
		{ status: { ...scratchStatus, paneId: "B" }, placeholder: true },
	);
	const view = assembleShellView({
		theme: "light",
		list,
		records,
		canvases: {},
		boards: EMPTY_LISTING,
		boardsError: null,
		previews: {},
		presentation: null,
		notices: [],
	});
	expect(view.scratch).toEqual([
		{
			key: "scratch-7f3k",
			identity: { board: "scratch-7f3k", variant: "current" },
			placeholder: true,
		},
	]);
});

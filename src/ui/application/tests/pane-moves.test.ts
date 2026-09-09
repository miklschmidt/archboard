import { expect, test } from "bun:test";

import { initialPaneList, type PaneList } from "@/ui/application/pane-list";
import { createPaneMoves } from "@/ui/application/pane-moves";

/**
 * The moves over a fresh workspace, and every list they produced.
 * @param initial The list to start from.
 * @returns The moves and what they published.
 */
function moving(initial: PaneList = initialPaneList()) {
	const published: PaneList[] = [];
	return { moves: createPaneMoves(initial, (list) => published.push(list)), published };
}

test("a move made once acts on the workspace as it is when it is called", () => {
	// The pane host is built from these once and keeps them: the server asks it
	// to close panes opened long after, so a move must not read the list it was
	// made with.
	const { moves, published } = moving();
	const close = moves.close;
	expect(moves.add()).toBe(true);
	expect(moves.list().panes.map((pane) => pane.paneId)).toEqual(["A", "B"]);
	expect(close("B")).toBe(true);
	expect(moves.list().panes.map((pane) => pane.paneId)).toEqual(["A"]);
	expect(published).toHaveLength(2);
});

test("a close the list refuses changes nothing and says so", () => {
	const { moves, published } = moving();
	// The last pane cannot be closed, and a pane that is not open is not there
	// to close: neither may take a live pane's state with it.
	expect(moves.close("A")).toBe(false);
	expect(moves.close("B")).toBe(false);
	expect(published).toEqual([]);
	expect(moves.list()).toEqual(initialPaneList());
});

test("closing the pane that was there first leaves the other one open", () => {
	const { moves } = moving();
	moves.add();
	expect(moves.close("A")).toBe(true);
	expect(moves.list().panes.map((pane) => pane.paneId)).toEqual(["B"]);
	expect(moves.list().activePaneId).toBe("B");
	// And B is now the last pane, so it stays.
	expect(moves.close("B")).toBe(false);
});

test("a second pane can only be opened once, and focusing the focused pane moves nothing", () => {
	const { moves } = moving();
	expect(moves.add()).toBe(true);
	expect(moves.add()).toBe(false);
	expect(moves.select("B")).toBe(false);
	expect(moves.select("A")).toBe(true);
	expect(moves.select("Z")).toBe(false);
});

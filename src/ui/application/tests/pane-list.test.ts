import { expect, test } from "bun:test";

import {
	addPane,
	canClosePane,
	closePane,
	initialPaneList,
	paneListOf,
	primaryPaneId,
	selectPane,
} from "@/ui/application/pane-list";

test("the application starts with pane A focused and adds pane B at most once", () => {
	const one = initialPaneList();
	expect(one.panes.map((pane) => pane.label)).toEqual(["Pane A"]);
	expect(one.activePaneId).toBe("A");
	const two = addPane(one);
	expect(two.panes.map((pane) => pane.paneId)).toEqual(["A", "B"]);
	expect(two.activePaneId).toBe("B");
	expect(addPane(two)).toBe(two);
	expect(primaryPaneId(two)).toBe("A");
});

test("closing the focused pane moves focus to the pane that remains; the last pane stays", () => {
	const two = addPane(initialPaneList());
	const afterClose = closePane(two, "B");
	expect(afterClose.panes.map((pane) => pane.paneId)).toEqual(["A"]);
	expect(afterClose.activePaneId).toBe("A");
	expect(closePane(afterClose, "A")).toBe(afterClose);
	expect(closePane(two, "C")).toBe(two);
});

test("selecting a pane focuses it and an unknown pane changes nothing", () => {
	const two = addPane(initialPaneList());
	expect(selectPane(two, "A").activePaneId).toBe("A");
	expect(selectPane(two, "Z")).toBe(two);
	expect(selectPane(two, "B")).toBe(two);
});

test("a close the list refuses is refused before it is applied, not after", () => {
	const one = initialPaneList();
	// The last pane and an unknown pane: both are closes that change nothing, and
	// a caller acting on one would otherwise drop the live pane's state with it.
	expect(canClosePane(one, "A")).toBe(false);
	expect(canClosePane(one, "B")).toBe(false);
	const two = addPane(one);
	expect(canClosePane(two, "A")).toBe(true);
	expect(canClosePane(two, "B")).toBe(true);
	expect(canClosePane(two, "C")).toBe(false);
});

test("the panes a workspace address names become the list, ignoring ids this shell has not got", () => {
	expect(paneListOf(["B"], null)).toEqual({
		panes: [{ paneId: "B", label: "Pane B" }],
		activePaneId: "B",
	});
	expect(paneListOf(["B", "A"], "B").panes.map((pane) => pane.paneId)).toEqual(["A", "B"]);
	expect(paneListOf(["B", "A"], "B").activePaneId).toBe("B");
	// An address naming nobody, or a pane that cannot exist, still opens a shell.
	expect(paneListOf([], null)).toEqual(initialPaneList());
	expect(paneListOf(["Z"], "Z")).toEqual(initialPaneList());
	// A focus on a pane the address did not open falls back to the first.
	expect(paneListOf(["A"], "B").activePaneId).toBe("A");
});

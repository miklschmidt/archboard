import { expect, test } from "bun:test";

import {
	addPane,
	closePane,
	initialPaneList,
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

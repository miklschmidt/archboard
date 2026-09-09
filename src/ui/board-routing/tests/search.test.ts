import { expect, test } from "bun:test";

import {
	addressFromSearch,
	searchFromAddress,
	validateWorkspaceSearch,
} from "@/ui/board-routing/search";

test("the search keeps only the parameters the workspace owns, as trimmed strings", () => {
	expect(
		validateWorkspaceSearch({
			paneA: " payments ",
			paneB: "billing",
			pane: "B",
			token: "secret",
			paneC: 7,
			paneD: "",
		}),
	).toEqual({ paneA: "payments", paneB: "billing", pane: "B" });
});

test("an address reads the panes in reading order whichever order the search was written in", () => {
	const address = addressFromSearch(
		validateWorkspaceSearch({ paneB: "billing", paneA: "payments" }),
	);
	expect(address.panes).toEqual([
		{ paneId: "A", boardKey: "payments" },
		{ paneId: "B", boardKey: "billing" },
	]);
	expect(address.activePaneId).toBe("A");
});

test("board keys keep their variant and their path, because the server parses the key", () => {
	const address = addressFromSearch(
		validateWorkspaceSearch({ paneA: "billing/ledger@option-a", pane: "A" }),
	);
	expect(address.panes[0]?.boardKey).toBe("billing/ledger@option-a");
});

test("one pane on one board writes one parameter; the active pane is written only when it is not the first", () => {
	expect(
		searchFromAddress({ panes: [{ paneId: "A", boardKey: "payments" }], activePaneId: "A" }),
	).toEqual({
		paneA: "payments",
	});
	expect(
		searchFromAddress({
			panes: [
				{ paneId: "A", boardKey: "payments" },
				{ paneId: "B", boardKey: "billing" },
			],
			activePaneId: "B",
		}),
	).toEqual({ paneA: "payments", paneB: "billing", pane: "B" });
});

test("a pane that has not said what it holds is left out of the search", () => {
	expect(
		searchFromAddress({
			panes: [
				{ paneId: "A", boardKey: "payments" },
				{ paneId: "B", boardKey: null },
			],
			activePaneId: "A",
		}),
	).toEqual({ paneA: "payments" });
});

test("a search naming no pane is an address with no panes, which asks for nothing", () => {
	const address = addressFromSearch(validateWorkspaceSearch({}));
	expect(address.panes).toEqual([]);
	expect(address.activePaneId).toBeNull();
});

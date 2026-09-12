import { expect, test } from "bun:test";

import { settledAddress, type WorkspaceAddress } from "@/ui/board-routing/address";
import {
	addressFromSearch,
	parseWorkspaceSearchString,
	searchFromAddress,
	stringifyWorkspaceSearch,
	validateWorkspaceSearch,
} from "@/ui/board-routing/search";

/**
 * An address, written the way a test reads.
 * @param panes The panes, as pane id to board key.
 * @returns The address.
 */
function addressOf(panes: readonly (readonly [string, string])[]): WorkspaceAddress {
	return settledAddress({
		panes: panes.map(([paneId, boardKey]) => ({ paneId, boardKey, view: null })),
		activePaneId: null,
	});
}

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
		{ paneId: "A", boardKey: "payments", view: null },
		{ paneId: "B", boardKey: "billing", view: null },
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
		searchFromAddress({
			panes: [{ paneId: "A", boardKey: "payments", view: null }],
			activePaneId: "A",
		}),
	).toEqual({
		paneA: "payments",
	});
	expect(
		searchFromAddress({
			panes: [
				{ paneId: "A", boardKey: "payments", view: null },
				{ paneId: "B", boardKey: "billing", view: null },
			],
			activePaneId: "B",
		}),
	).toEqual({ paneA: "payments", paneB: "billing", pane: "B" });
});

test("a pane that has not said what it holds is left out of the search", () => {
	expect(
		searchFromAddress({
			panes: [
				{ paneId: "A", boardKey: "payments", view: null },
				{ paneId: "B", boardKey: null, view: null },
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

test("a board key that reads as JSON is still a board key through the installed parser", () => {
	// The router's default parser would take these for a number, a boolean and
	// nothing at all; each of them is a name a board is allowed to have.
	const parsed = parseWorkspaceSearchString("?paneA=2026&paneB=true&pane=A");
	expect(parsed).toEqual({ paneA: "2026", paneB: "true", pane: "A" });
	const address = addressFromSearch(validateWorkspaceSearch(parsed));
	expect(address.panes).toEqual([
		{ paneId: "A", boardKey: "2026", view: null },
		{ paneId: "B", boardKey: "true", view: null },
	]);
});

test("a board key survives being written and read back by the router's own pair", () => {
	for (const boardKey of ["2026", "true", "null", "1.5", "-ledger", "billing/ledger@option-a"]) {
		const written = stringifyWorkspaceSearch(searchFromAddress(addressOf([["A", boardKey]])));
		const read = addressFromSearch(validateWorkspaceSearch(parseWorkspaceSearchString(written)));
		expect(read.panes[0]?.boardKey).toBe(boardKey);
	}
});

test("the view a pane reads a semantic board through survives the address bar", () => {
	const search = searchFromAddress({
		panes: [{ paneId: "A", boardKey: "semantic:pipeline", view: "k3f9" }],
		activePaneId: "A",
	});
	expect(search).toEqual({ paneA: "semantic:pipeline", viewA: "k3f9" });
	// And a reload reads it back as the same reading of the same board.
	const back = addressFromSearch(validateWorkspaceSearch(search));
	expect(back.panes).toEqual([{ paneId: "A", boardKey: "semantic:pipeline", view: "k3f9" }]);
});

test("the whole variant is the absence of a view, not a view called nothing", () => {
	expect(
		searchFromAddress({
			panes: [{ paneId: "A", boardKey: "semantic:pipeline", view: null }],
			activePaneId: "A",
		}),
	).toEqual({ paneA: "semantic:pipeline" });
	expect(
		addressFromSearch(validateWorkspaceSearch({ paneA: "semantic:pipeline", viewA: "" })).panes[0]
			?.view,
	).toBeNull();
});

test("a view named for a pane that is not open names nothing", () => {
	const address = addressFromSearch(validateWorkspaceSearch({ paneA: "payments", viewB: "k3f9" }));
	expect(address.panes).toEqual([{ paneId: "A", boardKey: "payments", view: null }]);
});

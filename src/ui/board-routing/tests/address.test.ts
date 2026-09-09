import { expect, test } from "bun:test";

import {
	panesAtRisk,
	planFor,
	planIsEmpty,
	sameAddress,
	settledAddress,
	type WorkspaceAddress,
} from "@/ui/board-routing/address";
import {
	addressFromSearch,
	searchFromAddress,
	validateWorkspaceSearch,
} from "@/ui/board-routing/search";

/** The panes this shell can have. */
const PANES = ["A", "B"] as const;

/**
 * An address, written the way a test reads.
 * @param panes The panes, as pane id to board key.
 * @param activePaneId The active pane, or null.
 * @returns The address.
 */
function address(
	panes: readonly (readonly [string, string | null])[],
	activePaneId: string | null = null,
): WorkspaceAddress {
	return settledAddress({
		panes: panes.map(([paneId, boardKey]) => ({ paneId, boardKey })),
		activePaneId,
	});
}

test("an address with no active pane takes the first, and one naming a closed pane falls back", () => {
	expect(address([["A", "payments"]]).activePaneId).toBe("A");
	expect(
		address(
			[
				["A", "payments"],
				["B", "billing"],
			],
			"B",
		).activePaneId,
	).toBe("B");
	expect(address([["A", "payments"]], "B").activePaneId).toBe("A");
	expect(address([], "A").activePaneId).toBeNull();
});

test("two addresses are the same only when the panes, their boards and the focus all match", () => {
	const one = address([
		["A", "payments"],
		["B", "billing"],
	]);
	expect(
		sameAddress(
			one,
			address([
				["A", "payments"],
				["B", "billing"],
			]),
		),
	).toBe(true);
	expect(
		sameAddress(
			one,
			address(
				[
					["A", "payments"],
					["B", "billing"],
				],
				"B",
			),
		),
	).toBe(false);
	expect(sameAddress(one, address([["A", "payments"]]))).toBe(false);
	expect(
		sameAddress(
			one,
			address([
				["A", "payments"],
				["B", "payments"],
			]),
		),
	).toBe(false);
});

test("a plan opens the boards that differ, adds and closes panes, and moves the focus", () => {
	const plan = planFor(
		address([["A", "payments"]]),
		address(
			[
				["A", "billing"],
				["B", "payments@proposed"],
			],
			"B",
		),
		PANES,
	);
	expect(plan.opens).toEqual([{ paneId: "A", boardKey: "billing" }]);
	expect(plan.adds).toBe(1);
	expect(plan.closes).toEqual([]);
	// Pane B is not open yet, so there is nothing to focus until it is.
	expect(plan.focus).toBeNull();
	expect(planIsEmpty(plan)).toBe(false);
});

test("an address that matches what is displayed asks for nothing", () => {
	const displayed = address([
		["A", "payments"],
		["B", "billing"],
	]);
	expect(planIsEmpty(planFor(displayed, displayed, PANES))).toBe(true);
	// A wanted pane naming no board is a pane that should be open, nothing more.
	expect(
		planIsEmpty(
			planFor(
				displayed,
				address([
					["A", null],
					["B", null],
				]),
				PANES,
			),
		),
	).toBe(true);
});

test("the panes at risk are the ones a plan closes or points at another board", () => {
	const plan = planFor(
		address([
			["A", "payments"],
			["B", "billing"],
		]),
		address([["A", "ledger"]]),
		PANES,
	);
	expect(plan.closes).toEqual(["B"]);
	expect(panesAtRisk(plan)).toEqual(["B", "A"]);
});

test("a workspace survives a round trip through the address bar's search parameters", () => {
	const displayed = address(
		[
			["A", "billing/ledger@option-a"],
			["B", "payments"],
		],
		"B",
	);
	const search = searchFromAddress(displayed);
	expect(search).toEqual({ paneA: "billing/ledger@option-a", paneB: "payments", pane: "B" });
	expect(sameAddress(addressFromSearch(validateWorkspaceSearch(search)), displayed)).toBe(true);
});

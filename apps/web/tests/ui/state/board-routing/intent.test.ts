import { expect, test } from "bun:test";

import { settledAddress, type WorkspaceAddress } from "#ui/rules/board-routing/address.ts";
import { createDeliberateNavigation } from "#ui/state/board-routing/intent.ts";

/**
 * An address, written the way a test reads.
 * @param panes The panes, as pane id to board key.
 * @returns The address.
 */
function address(panes: readonly (readonly [string, string])[]): WorkspaceAddress {
	return settledAddress({
		panes: panes.map(([paneId, boardKey]) => ({ paneId, boardKey, repository: null, view: null })),
		activePaneId: null,
	});
}

test("a change nobody asked for is not deliberate", () => {
	const navigation = createDeliberateNavigation();
	expect(navigation.settle(address([["A", "billing"]]))).toBe(false);
});

test("the pane a user asked to move having moved is the deliberate change", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "board", paneId: "A", from: "payments", repository: null });
	expect(navigation.settle(address([["A", "billing"]]))).toBe(true);
});

test("a pane that has not moved yet is not the change that was asked for", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "board", paneId: "A", from: "payments", repository: null });
	expect(navigation.settle(address([["A", "payments"]]))).toBe(false);
});

test("asking for a comparison is met by the number of panes the user asked for", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "panes", count: 2 });
	expect(
		navigation.settle(
			address([
				["A", "payments"],
				["B", "billing"],
			]),
		),
	).toBe(true);
});

test("a failed gesture leaves nothing behind for a later change to be mistaken for", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "board", paneId: "A", from: "payments", repository: null });
	navigation.clear();
	expect(navigation.settle(address([["A", "billing"]]))).toBe(false);
});

test("an expectation lives no longer than the next change, met or not", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "board", paneId: "A", from: "payments", repository: null });
	expect(navigation.settle(address([["A", "payments"]]))).toBe(false);
	// An agent moving the same pane afterwards is not the user's move.
	expect(navigation.settle(address([["A", "billing"]]))).toBe(false);
});

/**
 * A pane reading one semantic board through one view.
 * @param view The view, or null for the whole variant.
 * @returns The address.
 */
function reading(view: string | null): WorkspaceAddress {
	return settledAddress({
		panes: [{ paneId: "A", boardKey: "semantic:pipeline", repository: null, view }],
		activePaneId: "A",
	});
}

test("choosing another way of reading a board is a move the user made", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "view", panes: [{ paneId: "A", from: null }] });
	expect(navigation.settle(reading("k3f9"))).toBe(true);
	// And the expectation is spent: the next change is not theirs as well.
	expect(navigation.settle(reading("q1x2"))).toBe(false);
});

test("a view that changed in another pane is not the move this user asked for", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "view", panes: [{ paneId: "B", from: null }] });
	expect(navigation.settle(twoReading("k3f9", null))).toBe(false);
});

test("a view chosen in two linked panes is the move whichever pane draws it first", () => {
	const navigation = createDeliberateNavigation();
	const both = [
		{ paneId: "A", from: null },
		{ paneId: "B", from: null },
	];
	navigation.expect({ kind: "view", panes: both });
	expect(navigation.settle(twoReading(null, "k3f9"))).toBe(true);
	// The other pane drawing it a moment later replaces that entry.
	expect(navigation.settle(twoReading("k3f9", "k3f9"))).toBe(false);
});

/**
 * Two panes reading one semantic board.
 * @param a The view pane A reads, or null for the whole variant.
 * @param b The view pane B reads.
 * @returns The address.
 */
function twoReading(a: string | null, b: string | null): WorkspaceAddress {
	return settledAddress({
		panes: [
			{ paneId: "A", boardKey: "semantic:pipeline", repository: null, view: a },
			{ paneId: "B", boardKey: "semantic:pipeline", repository: null, view: b },
		],
		activePaneId: "A",
	});
}

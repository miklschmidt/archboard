import { expect, test } from "bun:test";

import { settledAddress, type WorkspaceAddress } from "@/ui/board-routing/address";
import { createDeliberateNavigation } from "@/ui/board-routing/intent";

/**
 * An address, written the way a test reads.
 * @param panes The panes, as pane id to board key.
 * @returns The address.
 */
function address(panes: readonly (readonly [string, string])[]): WorkspaceAddress {
	return settledAddress({
		panes: panes.map(([paneId, boardKey]) => ({ paneId, boardKey, view: null })),
		activePaneId: null,
	});
}

test("a change nobody asked for is not deliberate", () => {
	const navigation = createDeliberateNavigation();
	expect(navigation.settle(address([["A", "billing"]]))).toBe(false);
});

test("the pane a person asked to move having moved is the deliberate change", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "board", paneId: "A", from: "payments" });
	expect(navigation.settle(address([["A", "billing"]]))).toBe(true);
});

test("a pane that has not moved yet is not the change that was asked for", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "board", paneId: "A", from: "payments" });
	expect(navigation.settle(address([["A", "payments"]]))).toBe(false);
});

test("asking for a comparison is met by the number of panes the person asked for", () => {
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
	navigation.expect({ kind: "board", paneId: "A", from: "payments" });
	navigation.clear();
	expect(navigation.settle(address([["A", "billing"]]))).toBe(false);
});

test("an expectation lives no longer than the next change, met or not", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "board", paneId: "A", from: "payments" });
	expect(navigation.settle(address([["A", "payments"]]))).toBe(false);
	// An agent moving the same pane afterwards is not the person's move.
	expect(navigation.settle(address([["A", "billing"]]))).toBe(false);
});

/**
 * A pane reading one semantic board through one view.
 * @param view The view, or null for the whole variant.
 * @returns The address.
 */
function reading(view: string | null): WorkspaceAddress {
	return settledAddress({
		panes: [{ paneId: "A", boardKey: "semantic:pipeline", view }],
		activePaneId: "A",
	});
}

test("choosing another way of reading a board is a move the person made", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "view", paneId: "A", from: null });
	expect(navigation.settle(reading("k3f9"))).toBe(true);
	// And the expectation is spent: the next change is not theirs as well.
	expect(navigation.settle(reading("q1x2"))).toBe(false);
});

test("a view that changed in another pane is not the move this person asked for", () => {
	const navigation = createDeliberateNavigation();
	navigation.expect({ kind: "view", paneId: "B", from: null });
	expect(
		navigation.settle(
			settledAddress({
				panes: [
					{ paneId: "A", boardKey: "semantic:pipeline", view: "k3f9" },
					{ paneId: "B", boardKey: "semantic:pipeline", view: null },
				],
				activePaneId: "A",
			}),
		),
	).toBe(false);
});

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
		panes: panes.map(([paneId, boardKey]) => ({ paneId, boardKey })),
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

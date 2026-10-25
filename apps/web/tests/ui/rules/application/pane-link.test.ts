// Which panes are linked (TASK-538.02): two panes on one board of one vault,
// whatever variant each shows, while neither presents a walkthrough.
//
// What these catch: panes linked across vaults or boards, a presenting pane
// linked, and a partner told the wrong variant.

import { expect, test } from "bun:test";

import { paneLinks } from "#ui/rules/application/pane-link.ts";
import { emptyPaneStatus } from "#ui/rules/application/pane-records.ts";
import type { PaneStatus } from "#ui/rules/pane-session/session-types.ts";

/**
 * One pane showing a board.
 * @param paneId The pane.
 * @param boardKey The board on screen, as its key.
 * @param over What else differs from a pane in the shop's vault.
 * @returns Its status.
 */
function showing(paneId: string, boardKey: string, over: Partial<PaneStatus> = {}): PaneStatus {
	return { ...emptyPaneStatus(paneId), boardKey, vault: "/shop/.archboard/vault", ...over };
}

test("two panes on one board are linked, each told the variant the other shows", () => {
	expect(paneLinks([showing("A", "checkout"), showing("B", "Checkout@v2")])).toEqual({
		A: { paneId: "B", variant: "v2" },
		B: { paneId: "A", variant: null },
	});
});

test("another board, another vault, a walkthrough or one pane links nothing", () => {
	const a = showing("A", "checkout");
	expect(paneLinks([a, showing("B", "orders")])).toEqual({});
	expect(paneLinks([a, showing("B", "checkout", { vault: "/billing/.archboard/vault" })])).toEqual(
		{},
	);
	expect(paneLinks([a, showing("B", "checkout", { presenting: true })])).toEqual({});
	expect(paneLinks([a])).toEqual({});
});

// What the catalog marks stale when boards of one vault changed, matched
// against the keys the canvas caches its readings under.
//
// What this catches: a released pane's board key that names a variant
// invalidating nothing, because the canvas caches a board by its name alone,
// and news of one vault's board reading a board of the same name in another.

import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { catalogCommandsFor } from "#ui/hooks/board-catalog/use-board-catalog.ts";
import { semanticBoardKeys } from "#ui/clients/semantic-board-canvas/reads/queries.ts";

const SHOP = "/work/shop/.archboard/vault";
const BILLING = "/work/billing/.archboard/vault";

test("a changed board of one vault, named with a variant, reads that board's document and pictures again there only", async () => {
	const client = new QueryClient();
	const shop = {
		document: semanticBoardKeys.document(SHOP, "payments"),
		render: semanticBoardKeys.render({ vault: SHOP, board: "payments", variant: "proposed" }),
		boards: semanticBoardKeys.boards(SHOP),
	};
	const billing = {
		document: semanticBoardKeys.document(BILLING, "payments"),
		render: semanticBoardKeys.render({ vault: BILLING, board: "payments" }),
		boards: semanticBoardKeys.boards(BILLING),
	};
	for (const key of [...Object.values(shop), ...Object.values(billing)]) {
		client.setQueryData(key, { version: 1 });
	}

	// The pane let go of the proposal it was showing.
	catalogCommandsFor(client).boardsChanged(SHOP, ["payments@proposed"]);
	// Each sweep cancels whatever is in flight before it marks, so the marking
	// lands a turn later.
	await new Promise((settle) => setTimeout(settle, 0));

	/**
	 * Whether the cache reads each of these again before it shows it.
	 * @param keys The cache keys, by name.
	 * @returns One answer for each name.
	 */
	const readAgain = (keys: Record<string, readonly unknown[]>): Record<string, boolean> =>
		Object.fromEntries(
			Object.entries(keys).map(([name, key]) => [
				name,
				client.getQueryState(key)?.isInvalidated === true,
			]),
		);
	expect({ shop: readAgain(shop), billing: readAgain(billing) }).toEqual({
		shop: { document: true, render: true, boards: true },
		billing: { document: false, render: false, boards: false },
	});
	client.clear();
});

import { expect, test } from "bun:test";

import { EMPTY_LISTING, composeListing, listingError } from "@/ui/board-catalog/listing";
import type { SemanticBoardEntry } from "@/ui/semantic-board-canvas";
import type { BrowserPaneListing } from "@/ui/types";

const VAULT: readonly SemanticBoardEntry[] = [
	{ name: "Checkout", key: "checkout" },
	{ name: "Payments", key: "payments" },
];

const PANES: BrowserPaneListing = {
	panes: [
		{
			paneId: "A",
			place: "left",
			board: "checkout",
			identity: { board: "Checkout", variant: "current" },
		},
		{
			paneId: "B",
			place: "right",
			board: "checkout",
			identity: { board: "Checkout", variant: "current" },
		},
	],
};

test("the vault and the live panes are listed independently of each other", () => {
	const both = composeListing(VAULT, PANES);
	expect(both.boards.map((board) => board.key)).toEqual(["checkout", "payments"]);
	// Every pane still on screen, whether or not two of them share a board.
	expect(both.onScreen.map((pane) => pane.paneId)).toEqual(["A", "B"]);

	const vaultOnly = composeListing(VAULT, undefined);
	expect(vaultOnly.boards).toHaveLength(2);
	expect(vaultOnly.onScreen).toEqual([]);

	const panesOnly = composeListing(undefined, PANES);
	expect(panesOnly.boards).toEqual([]);
	expect(panesOnly.onScreen.map((pane) => pane.board)).toEqual(["checkout", "checkout"]);

	// An unread vault is not an empty one: nothing has been asked for yet.
	expect(composeListing(undefined, undefined)).toBe(EMPTY_LISTING);
});

test("a failed pane read does not report the listing as unreadable", () => {
	const paneFailure = new Error("panes offline");
	expect(listingError(null, paneFailure, true)).toBeNull();
	expect(listingError(null, paneFailure, false)).toBe(
		"The open boards could not be read: panes offline",
	);
	expect(listingError(new Error("vault offline"), null, true)).toBe(
		"The board listing could not be read: vault offline",
	);
	// The vault's failure is the one that decides, whatever the panes did.
	expect(listingError(new Error("vault offline"), paneFailure, false)).toBe(
		"The board listing could not be read: vault offline",
	);
	expect(listingError(null, null, true)).toBeNull();
});

test("reloading reads every cached board resource again, documents included", async () => {
	const { QueryClient } = await import("@tanstack/react-query");
	const { semanticBoardKeys } = await import("@/ui/semantic-board-canvas");
	const { boardCatalogKeys } = await import("@/ui/board-catalog");
	const { catalogCommandsFor } = await import("@/ui/board-catalog");
	const client = new QueryClient();
	/**
	 * Put one answered query in the cache.
	 * @param key The cache key.
	 */
	const seed = async (key: readonly unknown[]): Promise<void> => {
		await client.fetchQuery({
			queryKey: key,
			/**
			 * Answer the seeded query with something.
			 * @returns The key, as its own answer.
			 */
			queryFn: () => Promise.resolve(JSON.stringify(key)),
		});
	};
	/**
	 * Whether the cache will read a resource again before showing it.
	 * @param key The cache key.
	 * @returns True when it has been marked for a fresh read.
	 */
	const willReadAgain = (key: readonly unknown[]): boolean =>
		client.getQueryState(key)?.isInvalidated === true;
	const render = semanticBoardKeys.render({ board: "payments", theme: "light" });
	const document = semanticBoardKeys.document("payments");
	await seed(render);
	await seed(document);
	await seed(semanticBoardKeys.boards);
	await seed(boardCatalogKeys.panes);

	// Reload is the one control a person has when what the shell is showing has
	// gone wrong, and a board's document is the half that is easy to forget: it
	// is what the inspector and the variant controls are built from, and it is
	// cached for as long as the tab is open. A board written while this tab was
	// not being told would otherwise come back with a fresh picture beside an
	// inspector describing the board as it used to be.
	catalogCommandsFor(client).reload();
	// Each sweep cancels whatever is in flight before it marks the resource, so
	// the marking lands a turn later.
	await new Promise((settle) => setTimeout(settle, 0));
	expect({
		document: willReadAgain(document),
		render: willReadAgain(render),
		boards: willReadAgain(semanticBoardKeys.boards),
		panes: willReadAgain(boardCatalogKeys.panes),
	}).toEqual({ document: true, render: true, boards: true, panes: true });
	client.clear();
});

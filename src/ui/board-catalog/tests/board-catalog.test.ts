import { expect, test } from "bun:test";

import {
	EMPTY_LISTING,
	composeListing,
	listingError,
	listedBoardKey,
} from "@/ui/board-catalog/listing";
import type { SemanticBoardEntry } from "@/ui/semantic-board-canvas";
import type { BrowserPaneListing } from "@/ui/types";

const VAULT: readonly SemanticBoardEntry[] = [
	{
		name: "Checkout",
		key: "checkout",
		variants: [{ id: "v1", name: "Initial", lifecycle: "current", parentId: null }],
	},
	{
		name: "Payments",
		key: "payments",
		variants: [{ id: "v2", name: "Initial", lifecycle: "current", parentId: null }],
	},
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

test("named variants retain their addresses and every current spelling selects the designated row", () => {
	const variants: SemanticBoardEntry["variants"] = [
		{ id: "old", name: "Initial", lifecycle: "historical", parentId: null },
		{ id: "now", name: "Queued ingest", lifecycle: "current", parentId: null },
		{ id: "next", name: "Queue @ edge", lifecycle: "draft", parentId: "now" },
	];
	const listing = composeListing(
		[{ name: "Checkout", key: "checkout", level: "service", variants }],
		undefined,
	);
	expect(listing.boards.map((board) => board.level)).toEqual(["service", "service", "service"]);
	expect(
		listing.boards.map(({ key, identity, variant }) => [key, identity.variant, variant?.lifecycle]),
	).toEqual([
		["checkout@old", "Initial", "historical"],
		["checkout", "Queued ingest", "current"],
		["checkout@next", "Queue @ edge", "draft"],
	]);
	for (const address of [
		"checkout",
		"Checkout@current",
		"checkout@now",
		"checkout@Queued ingest",
	]) {
		expect(listedBoardKey(listing, address)).toBe("checkout");
	}
	expect(listedBoardKey(listing, "Checkout@Queue @ edge")).toBe("checkout@next");
	expect(listedBoardKey(listing, "checkout@Initial")).toBe("checkout@old");
	expect(listedBoardKey(listing, "checkout@unknown")).toBe("checkout@unknown");
	expect(listedBoardKey(listing, null)).toBeNull();
});

test("an unreadable board remains openable without hiding healthy variants", () => {
	const listing = composeListing(
		[...VAULT, { name: "Broken", key: "broken", variants: [], error: "invalid board" }],
		undefined,
	);
	expect(listing.boards).toHaveLength(3);
	expect(listing.boards.at(-1)).toEqual({
		key: "broken",
		identity: { board: "Broken", variant: "Unavailable" },
		error: "invalid board",
	});
});

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

import { expect, test } from "bun:test";

import {
	EMPTY_LISTING,
	composeListing,
	listingError,
	listedBoardKey,
	nothingBuiltOn,
	vaultHalf,
} from "#ui/rules/board-catalog/listing.ts";
import type { SemanticBoardEntry } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { BrowserPaneListing } from "#ui/rules/pane-session/session-types.ts";

/**
 * The vault's half of the listing of these boards, with the dogfood levels.
 * @param boards The boards.
 * @returns The half.
 */
function vault(boards: readonly SemanticBoardEntry[]): ReturnType<typeof vaultHalf> {
	return vaultHalf({ levels: ["system", "service", "module"], boards: [...boards] });
}

const VAULT: readonly SemanticBoardEntry[] = [
	{
		name: "Checkout",
		key: "checkout",
		opens: "v1",
		links: [],
		description: null,
		variants: [{ id: "v1", name: "Initial", lifecycle: "current", parentId: null }],
	},
	{
		name: "Payments",
		key: "payments",
		opens: "v2",
		links: [],
		description: null,
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
		vault([
			{
				name: "Checkout",
				key: "checkout",
				level: "service",
				opens: "now",
				variants,
				links: [],
				description: null,
			},
		]),
		undefined,
	);
	expect(listing.levels).toEqual(["system", "service", "module"]);
	expect(listing.boards.flatMap((board) => board.variants.map((variant) => variant.key))).toEqual([
		"checkout@old",
		"checkout",
		"checkout@next",
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

test("on a board nothing is built, the bare name lists the draft it opens and current finds no row", () => {
	const variants: SemanticBoardEntry["variants"] = [
		{ id: "plan", name: "Queued ingest", lifecycle: "draft", parentId: null },
		{ id: "alt", name: "Batch ingest", lifecycle: "draft", parentId: "plan" },
	];
	const listing = composeListing(
		vault([
			{ name: "Ingest", key: "ingest", opens: "plan", variants, links: [], description: null },
		]),
		undefined,
	);
	expect(listing.boards.flatMap((board) => board.variants.map((variant) => variant.key))).toEqual([
		"ingest",
		"ingest@alt",
	]);
	expect(listedBoardKey(listing, "ingest")).toBe("ingest");
	expect(listedBoardKey(listing, "ingest@alt")).toBe("ingest@alt");
	expect(listedBoardKey(listing, "ingest@current")).toBe("ingest@current");
	// The board says nothing is built; a board with a current variant, an unreadable one and
	// one nobody listed say nothing of the kind.
	expect(nothingBuiltOn(listing, "Ingest")).toBe(true);
	const others = composeListing(
		vault([
			...VAULT,
			{
				name: "Broken",
				key: "broken",
				opens: null,
				variants: [],
				links: [],
				description: null,
				error: "invalid",
			},
		]),
		undefined,
	);
	expect(["Checkout", "Broken", "Unlisted"].map((board) => nothingBuiltOn(others, board))).toEqual([
		false,
		false,
		false,
	]);
});

test("an unreadable board stays listed with its error beside the healthy ones", () => {
	const listing = composeListing(
		vault([
			...VAULT,
			{
				name: "Broken",
				key: "broken",
				opens: null,
				variants: [],
				links: [],
				description: null,
				error: "invalid board",
			},
		]),
		undefined,
	);
	expect(listing.boards.map((board) => [board.key, board.error ?? null])).toEqual([
		["checkout", null],
		["payments", null],
		["broken", "invalid board"],
	]);
});

test("the vault and the live panes are listed independently of each other", () => {
	const both = composeListing(vault(VAULT), PANES);
	expect(both.boards.map((board) => board.key)).toEqual(["checkout", "payments"]);
	// Every pane still on screen, whether or not two of them share a board.
	expect(both.onScreen.map((pane) => pane.paneId)).toEqual(["A", "B"]);

	const vaultOnly = composeListing(vault(VAULT), undefined);
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

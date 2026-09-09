import { expect, test } from "bun:test";

import { EMPTY_LISTING, composeListing, listingError } from "@/ui/board-catalog/listing";
import { previewSourceFor } from "@/ui/board-catalog/preview-source";
import type { MountedPreviewSnapshot, PreviewSource } from "@/ui/board-preview";
import type { BrowserPaneListing, PersistedBoardListing } from "@/ui/types";

const CHECKOUT = { board: "Checkout", variant: "current" };
const SCRATCH = { board: "scratch-7f3k", variant: "current" };

const VAULT: PersistedBoardListing = {
	vault: "/vault",
	boards: [{ key: "Checkout", identity: CHECKOUT }],
};

const PANES: BrowserPaneListing = {
	panes: [
		{ paneId: "A", place: "left", board: "scratch-7f3k", identity: SCRATCH, elementCount: 2 },
		{ paneId: "B", place: "right", board: "scratch-7f3k", identity: SCRATCH, elementCount: 2 },
	],
};

/**
 * A mounted scene for one board.
 * @param board The board key.
 * @returns The snapshot.
 */
function mountedScene(board: string): MountedPreviewSnapshot {
	return { kind: "mounted", board, fingerprint: "mounted", elements: [], files: {} };
}

/**
 * A server snapshot for one board.
 * @param board The board key.
 * @returns The snapshot.
 */
function serverScene(board: string): PreviewSource {
	return { board, fingerprint: "server", elements: [], files: {} };
}

test("the vault and the live panes are listed independently of each other", () => {
	const both = composeListing(VAULT, PANES);
	expect(both.boards.map((board) => board.key)).toEqual(["Checkout"]);
	// Two panes on one board is one open board, and every pane still on screen.
	expect(both.open.map((board) => board.key)).toEqual(["scratch-7f3k"]);
	expect(both.onScreen.map((pane) => pane.paneId)).toEqual(["A", "B"]);

	const vaultOnly = composeListing(VAULT, undefined);
	expect(vaultOnly.boards).toHaveLength(1);
	expect(vaultOnly.open).toEqual([]);

	const panesOnly = composeListing(undefined, PANES);
	expect(panesOnly.boards).toEqual([]);
	expect(panesOnly.open.map((board) => board.key)).toEqual(["scratch-7f3k"]);
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

test("a pane's own scene outranks the server snapshot of the board it holds", () => {
	const mounted = mountedScene("Checkout");
	const cached = serverScene("Checkout");
	expect(previewSourceFor({ mounted, cached, held: true })).toBe(mounted);
	// A snapshot that arrives after a pane took the board cannot displace it.
	expect(previewSourceFor({ mounted, cached: serverScene("Checkout"), held: true })).toBe(mounted);
	// Before the pane's first frame the snapshot already in hand still shows.
	expect(previewSourceFor({ mounted: null, cached, held: true })).toBe(cached);
	// A board no pane holds is the server's to depict, even with a stale scene.
	expect(previewSourceFor({ mounted, cached, held: false })).toBe(cached);
	expect(previewSourceFor({ mounted, cached: undefined, held: false })).toBeNull();
});

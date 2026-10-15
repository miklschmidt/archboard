// The address `semantic record` opens its page at, as the browser reads it
// (TASK-472.06, ADR 0050). The recorder writes the address and the browser's
// workspace address reads it, so this owner holds the two sides together: the
// page shows the recorded board in pane A, in the repository of the vault the
// command found, and with no repository named it opens where a page opens.

import { expect, test } from "bun:test";
import { recordingPageUrl } from "@/runtime/walkthrough-recorder";
import { addressFromSearch, parseWorkspaceSearchString } from "@/ui/board-routing/search";

/**
 * The panes the browser opens for a recording page's address.
 * @param repository The repository the command found its vault in, or null.
 * @param variant The variant asked for, or null for the current one.
 * @returns The panes, as the browser reads them.
 */
function panesOpenedFor(repository: string | null, variant: string | null) {
	const url = new URL(
		recordingPageUrl({
			serverUrl: "http://127.0.0.1:3000",
			board: { name: "Checkout" },
			variant,
			repository,
			walkthrough: { id: "w1" },
			language: "en",
		}),
	);
	return addressFromSearch(parseWorkspaceSearchString(url.search)).panes;
}

test("the recording page shows the board in pane A, in the repository of the vault the command found", () => {
	expect(panesOpenedFor("github.com/acme/shop", null)).toMatchObject([
		{ paneId: "A", boardKey: "Checkout", repository: "github.com/acme/shop" },
	]);
	expect(panesOpenedFor(null, "v2")).toMatchObject([
		{ paneId: "A", boardKey: "Checkout@v2", repository: null },
	]);
});

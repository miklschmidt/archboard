// The address `semantic record` opens its page at, as the browser reads it
// (TASK-472.06, ADR 0050). The recorder writes the address and the browser's
// workspace address reads it, so this owner holds the two sides together: the
// page shows the recorded board in pane A, in the repository of the vault the
// command found, and with no repository named it opens where a page opens.

import { expect, test } from "bun:test";
import { recordingPageUrl } from "@archboard/walkthrough/recorder";
import { recordingAskedOf } from "@archboard/walkthrough/recording";
import { addressFromSearch, parseWorkspaceSearchString } from "#ui/rules/board-routing/search.ts";

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
			against: null,
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

/**
 * The search string of the recording page's address.
 * @param against The variant the recording is read against, or null.
 * @returns The search string.
 */
function addressSearch(against: string | null): string {
	return new URL(
		recordingPageUrl({
			serverUrl: "http://127.0.0.1:3000",
			board: { name: "Checkout" },
			variant: "v3",
			repository: null,
			walkthrough: { id: "w1" },
			language: "da",
			against,
		}),
	).search;
}

test("the recording page is asked for the variant the recording is read against, when there is one", () => {
	expect(recordingAskedOf(addressSearch("v2"))).toEqual({
		walkthrough: "w1",
		language: "da",
		against: "v2",
	});
	expect(recordingAskedOf(addressSearch(null))?.against).toBeNull();
});

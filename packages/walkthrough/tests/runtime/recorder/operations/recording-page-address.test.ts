// The address `semantic record` opens its page at (TASK-472.06, ADR 0050). The recorder writes
// it and the browser reads it. The browser's side is the workspace address of apps/web, which
// apps/web/tests/contracts/recording-page-address.test.ts holds to these same addresses: a change
// to either side changes both owners.

import { expect, test } from "bun:test";

import { recordingAskedOf } from "#shared/protocol/recording-page.ts";
import { recordingPageUrl } from "#runtime/recorder/operations/record-walkthrough.ts";

/**
 * The search string of the recording page's address.
 * @param address What differs between the recordings: the repository, the variant, the language and the variant read against.
 * @param address.repository The repository the command found its vault in, or null.
 * @param address.variant The variant asked for, or null for the current one.
 * @param address.language The language the voice narrates in.
 * @param address.against The variant the recording is read against, or null.
 * @returns The search string.
 */
function addressSearch(address: {
	repository: string | null;
	variant: string | null;
	language: string;
	against: string | null;
}): string {
	return new URL(
		recordingPageUrl({
			...address,
			serverUrl: "http://127.0.0.1:3000",
			document: { name: "Checkout" },
			walkthrough: { id: "w1" },
		}),
	).search;
}

test("the recording page's address names the model in pane A, in the repository of the vault the command found", () => {
	expect(
		addressSearch({
			repository: "github.com/acme/shop",
			variant: null,
			language: "en",
			against: null,
		}),
	).toBe("?paneA=Checkout&repoA=github.com%2Facme%2Fshop&record=w1&language=en");
	expect(addressSearch({ repository: null, variant: "v2", language: "en", against: null })).toBe(
		"?paneA=Checkout%40v2&record=w1&language=en",
	);
});

test("the recording page is asked for the variant the recording is read against, when there is one", () => {
	const against = (variant: string | null) =>
		addressSearch({ repository: null, variant: "v3", language: "da", against: variant });
	expect(recordingAskedOf(against("v2"))).toEqual({
		walkthrough: "w1",
		language: "da",
		against: "v2",
	});
	expect(recordingAskedOf(against(null))?.against).toBeNull();
});

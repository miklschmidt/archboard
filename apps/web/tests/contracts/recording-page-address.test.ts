// The address `semantic record` opens its page at, as the browser reads it
// (TASK-472.06, ADR 0050). The recorder writes the address and the browser's
// workspace address reads it. The recorder's side is held to these same
// addresses by packages/walkthrough/tests/runtime/recorder/operations/recording-page-address.test.ts,
// so a change to either side changes both owners: the page shows the recorded
// model in pane A, in the repository of the vault the command found, and with
// no repository named it opens where a page opens.

import { expect, test } from "bun:test";
import {
	addressFromSearch,
	parseWorkspaceSearchString,
} from "#ui/panes/reading-routing/rules/search.ts";

/**
 * The panes the browser opens for a recording page's address.
 * @param search The search string the recorder writes.
 * @returns The panes, as the browser reads them.
 */
function panesOpenedFor(search: string) {
	return addressFromSearch(parseWorkspaceSearchString(search)).panes;
}

test("the recording page shows the model in pane A, in the repository of the vault the command found", () => {
	expect(
		panesOpenedFor("?paneA=Checkout&repoA=github.com%2Facme%2Fshop&record=w1&language=en"),
	).toMatchObject([{ paneId: "A", paneKey: "Checkout", repository: "github.com/acme/shop" }]);
	expect(panesOpenedFor("?paneA=Checkout%40v2&record=w1&language=en")).toMatchObject([
		{ paneId: "A", paneKey: "Checkout@v2", repository: null },
	]);
});

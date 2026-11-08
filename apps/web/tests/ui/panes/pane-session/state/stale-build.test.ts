import { expect, test } from "bun:test";

import { createStaleBuildNotice } from "#ui/panes/pane-session/state/stale-build.ts";
import type { PaneReply } from "#ui/panes/pane-session/clients/pane-requests.ts";

/**
 * Answer a request from an old tab.
 * @param current The served build.
 * @returns The stale-build part shared by both routes.
 */
function answer(current: string): Pick<PaneReply, "staleFrontend"> {
	return {
		staleFrontend: { loaded: "/assets/old.js", current, message: current },
	};
}

test("a late reply cannot repeat a build that the tab already announced", () => {
	const told: string[] = [];
	const note = createStaleBuildNotice((message) => told.push(message));
	// A reading answers before a pane report that crossed a rebuild.
	note(answer("/assets/reordered-new.js"));
	note(answer("/assets/reordered-old.js"));
	note(answer("/assets/reordered-new.js"));

	expect(told).toEqual(["/assets/reordered-new.js", "/assets/reordered-old.js"]);
});

test("another pane cannot repeat a build that this tab already announced", () => {
	const told: string[] = [];
	const firstPane = createStaleBuildNotice((message) => told.push(message));
	firstPane(answer("/assets/shared-new.js"));

	// The person dismisses the notice and opens or selects another pane.
	const secondPane = createStaleBuildNotice((message) => told.push(message));
	secondPane(answer("/assets/shared-new.js"));
	secondPane(answer("/assets/shared-newer.js"));
	firstPane(answer("/assets/shared-newer.js"));

	expect(told).toEqual(["/assets/shared-new.js", "/assets/shared-newer.js"]);
});

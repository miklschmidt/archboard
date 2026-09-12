// Which report about a pane may be believed, and when.
//
// Two failures this guards, both of which hand an agent something true-looking
// and wrong. A pane moving from one board to another registers on the new one
// before its first report about it arrives, so for a moment the registry says B
// and the pane's last report still says A — and A's ids resolved against B's
// document may well resolve, meaning something else entirely. And two reports
// from one pane can be in flight at once, so arrival order lets the older land
// last and stand for good while the person looks at something else (TASK-179).

import { afterEach, describe, expect, test } from "bun:test";
import {
	forgetSemanticPaneContexts,
	recordSemanticPaneContext,
	semanticPaneContextFor,
} from "@/server/canvas/index";
import type { SemanticPaneContext } from "@/shared/semantic-pane-context/index";

/**
 * One report from the same pane.
 * @param sequence Which report it is.
 * @param board The board it says it is reading.
 * @param selection The ids it says are picked out.
 * @returns The report.
 */
function report(
	sequence: number,
	board: string,
	selection: readonly string[] = [],
): SemanticPaneContext {
	return {
		paneId: "pane-a",
		clientId: "client-a",
		board: { name: board, key: board.toLowerCase() },
		variant: null,
		view: null,
		selection: selection.map((id) => ({ id })),
		version: 1,
		at: new Date(1_700_000_000_000 + sequence).toISOString(),
		sequence,
	};
}

afterEach(() => {
	forgetSemanticPaneContexts();
});

describe("a pane's reports", () => {
	test("keep the latest the pane sent, not the last one that arrived", () => {
		expect(recordSemanticPaneContext(report(1, "pipeline", ["early"]))).toBe(true);
		expect(recordSemanticPaneContext(report(2, "pipeline", ["current"]))).toBe(true);

		// The first request finally lands, overtaken by its own successor, and is
		// refused. Re-offering either of them proves the pane is still held at 2
		// rather than having been wound back to 1 by the late arrival.
		expect(recordSemanticPaneContext(report(1, "pipeline", ["early"]))).toBe(false);
		expect(recordSemanticPaneContext(report(2, "pipeline", ["current"]))).toBe(false);
		expect(recordSemanticPaneContext(report(3, "pipeline", ["later"]))).toBe(true);
	});

	test("ignore a repeat of the report they already hold", () => {
		expect(recordSemanticPaneContext(report(4, "pipeline", ["one"]))).toBe(true);
		expect(recordSemanticPaneContext(report(4, "pipeline", ["two"]))).toBe(false);
	});

	test("start from nothing, so a pane's first report is kept whatever it counts from", () => {
		expect(recordSemanticPaneContext(report(0, "pipeline", ["first"]))).toBe(true);
		expect(recordSemanticPaneContext(report(0, "pipeline", ["again"]))).toBe(false);
	});

	test("are not readable for a pane that is not on screen", () => {
		recordSemanticPaneContext(report(1, "pipeline", ["gone"]));

		// Nothing registered this client as a pane, so the report belongs to a
		// socket that is not there and a reader is told nothing rather than
		// something a person cannot see.
		expect(semanticPaneContextFor("client-a")).toBeNull();
	});
});

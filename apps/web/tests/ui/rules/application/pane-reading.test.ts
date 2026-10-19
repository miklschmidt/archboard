import { expect, test } from "bun:test";

import { readingOf } from "#ui/rules/application/pane-reading.ts";
import { NOTHING_READ } from "#ui/state/pane-session/pane-reading.ts";
import type { SemanticPaneReading } from "#ui/rules/semantic-board-canvas/board/address.ts";

test("loading a variant does not report its board as the current variant before the drawing resolves", () => {
	const pending: SemanticPaneReading = {
		board: "pipeline",
		variant: null,
		view: "v2",
		selection: null,
		drawn: null,
		presentation: null,
	};
	// A loading stage knows no resolved drawing identity. Reporting a bare
	// board here would replace the requested variant before routing can restore
	// its view. The pane session retains its server-adopted address instead.
	expect(readingOf(pending, null)).toEqual(NOTHING_READ);

	const variant = { id: "draft", name: "Proposal", lifecycle: "draft" } as const;
	const view = { id: "v2", name: "Integration", grammar: "architecture" } as const;
	expect(
		readingOf({ ...pending, variant: variant.id, drawn: { variant, view, version: 3 } }, null),
	).toEqual({
		board: { name: "pipeline", key: "pipeline@draft" },
		variant,
		view,
		version: 3,
		selection: [],
		presentation: null,
	});
});

// A pane draws a picture's marks itself (`shared/rules/render/marks.ts`): its
// key's line samples, a comparison's pins and a code finding's warnings. The
// renderer core draws the same marks in the picture (ADR 0059).
//
// What this catches: a key, a pin or a warning a pane draws differently from
// the picture beside it, once the core and the pane's copy of a rule drift.

import { expect, test } from "bun:test";

import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import {
	cornerWarning,
	HEAD_LENGTH,
	lineInk,
	lineWidth,
	pulseInk,
	standingMark,
} from "#shared/rules/render/marks.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

/** An added card, a card nobody has decided, and a sky line with traffic between them. */
const CONTENT = orderedFixture({
	nodes: [
		{ id: "a", name: "Alpha", kind: "service" },
		{ id: "b", name: "Beta", kind: "service" },
	],
	edges: [{ id: "ab", from: "a", to: "b", kind: "http", emphasis: "normal", traffic: {} }],
});

/** The colour the default policy gives an HTTP relationship. */
const SKY = "sky";

/**
 * Markup with every placement taken out, so a mark drawn at the origin reads
 * as the same mark drawn where the picture put it.
 * @param markup The markup.
 * @returns It, without its translations.
 */
function unplaced(markup: string): string {
	return markup.replaceAll(/ transform="translate\([^)]*\)"/gu, "");
}

test("a pane draws the pins, warnings, inks and heads the picture draws", async () => {
	const drawn = await renderArchitecture({
		content: CONTENT,
		policy: DEFAULT_SEMANTIC_POLICY,
		standing: { a: "added", b: "unchanged", ab: "unchanged" },
		unsettled: ["b"],
	});
	const picture = unplaced(drawn.svg);
	expect(picture).toContain(unplaced(standingMark("added")));
	expect(picture).toContain(unplaced(cornerWarning(drawn.atlas.nodes["b"]!)));

	const line = drawn.svg.split('data-semantic-id="ab"')[1]!;
	expect(line).toContain(`stroke:${lineInk(SKY)}`);
	expect(line).toContain(`stroke-width="${lineWidth("normal")}"`);
	expect(drawn.svg).toContain(pulseInk(SKY));

	const head = /marker-end="url\(#([^)]+)\)"/u.exec(line)![1]!;
	const marker = new RegExp(`<marker id="${head}"[^>]*>`, "u").exec(drawn.svg)![0];
	const width = Number(/markerWidth="([\d.]+)"/u.exec(marker)![1]);
	expect(width * lineWidth("normal")).toBeCloseTo(HEAD_LENGTH, 1);
});

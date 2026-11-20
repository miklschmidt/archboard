// A pane shows a picture's marks itself, finished by the renderer
// (`shared/render/rules/marks.ts`): its key's samples, a comparison's pins and a
// code finding's warnings. The renderer core draws the same marks in the
// picture (ADR 0059).
//
// What this catches: a sample, a pin or a warning a pane shows differently from
// the picture beside it, once the core and the pane's markup drift.

import { expect, test } from "bun:test";

import { defaultSemanticPolicy } from "@archboard/model-contract";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { markSample, warningMark } from "#shared/render/rules/marks.ts";
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
 * What a sample draws inside its frame.
 * @param sample The sample's markup.
 * @returns Its strokes.
 */
function inside(sample: string): string {
	return /^<svg[^>]*>([\s\S]*)<\/svg>$/u.exec(sample)![1]!;
}

/**
 * The one value of an attribute or a style property a piece of markup states.
 * @param markup The markup.
 * @param pattern What finds the value, in its one group.
 * @returns The value.
 */
function stated(markup: string, pattern: RegExp): string {
	return pattern.exec(markup)![1]!;
}

/**
 * Markup with every placement taken out, so a mark drawn at the origin reads
 * as the same mark drawn where the picture put it.
 * @param markup The markup.
 * @returns It, without its translations.
 */
function unplaced(markup: string): string {
	return markup.replaceAll(/ transform="translate\([^)]*\)"/gu, "");
}

test("a pane shows the pins, warnings and line samples the picture draws", async () => {
	const drawn = await renderArchitecture({
		content: CONTENT,
		policy: defaultSemanticPolicy(),
		standing: { a: "added", b: "unchanged", ab: "unchanged" },
		unsettled: ["b"],
	});
	const picture = unplaced(drawn.svg);
	expect(picture).toContain(unplaced(inside(markSample({ kind: "standing", standing: "added" }))));
	expect(picture).toContain(unplaced(warningMark(drawn.atlas.nodes["b"]!)));

	// The key's sample of the sky line: its ink, its strength and its head.
	const sample = markSample({ kind: "line", color: SKY, dash: "solid", arrowhead: "filled" });
	const line = drawn.svg.split('data-semantic-id="ab"')[1]!;
	expect(line).toContain(`stroke:${stated(sample, /style="color:([^"]+)"/u)}`);
	const strength = stated(sample, /<path d="M1 [^"]*"[^>]*stroke-width="([\d.]+)"/u);
	expect(line).toContain(`stroke-width="${strength}"`);
	const head = /marker-end="url\(#([^)]+)\)"/u.exec(line)![1]!;
	const marker = new RegExp(`<marker id="${head}"[^>]*>`, "u").exec(drawn.svg)![0];
	const width = Number(/markerWidth="([\d.]+)"/u.exec(marker)![1]);
	const sampled = Number(stated(sample, /<svg x="[^"]*" y="[^"]*" width="([\d.]+)"/u));
	expect(width * Number(strength)).toBeCloseTo(sampled, 1);
});

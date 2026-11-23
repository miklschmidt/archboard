import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
// Relationships may share ports and trunks, and those between the same two cards draw as the
// strands of one cable. Their identities, words, and semantic endpoints must remain legible even
// when their geometry coincides.

import { expect, test } from "bun:test";
import type { VariantContent } from "@archboard/model/content";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { covering, detached, masking, overlaps } from "#tests/runtime/support/drawn-labels.ts";
import { routesThroughCards } from "#tests/runtime/support/drawn-ink.ts";
import { distanceToFrame, routeLabels, routePoints } from "#tests/runtime/support/drawn-routes.ts";
import { drawnTexts } from "#tests/runtime/support/drawn-text.ts";
import { defaultSemanticPolicy } from "@archboard/model/policy";

/**
 * Each relationship starts and ends at the frame of the subject it names, and each cable wears
 * one plate, on its first relationship.
 */
async function expectReadableRoutes(
	content: VariantContent,
): Promise<{ paths: ReturnType<typeof routePoints> }> {
	const drawing = await renderArchitecture({
		policy: defaultSemanticPolicy(),
		content,
		theme: "light",
	});
	const paths = routePoints(drawing.svg);
	const labels = routeLabels(drawing.svg);
	const words = drawnTexts(drawing.svg);
	for (const edge of content.edges) {
		const path = paths.get(edge.id);
		expect(path?.length, `${edge.id} is drawn`).toBeGreaterThan(1);
		// Blocks offsets contacts 0.02 beyond painted faces; allow one SVG rounding unit.
		expect(distanceToFrame(path![0]!, drawing.atlas.nodes[edge.from]!)).toBeLessThan(0.03);
		expect(distanceToFrame(path!.at(-1)!, drawing.atlas.nodes[edge.to]!)).toBeLessThan(0.03);
		const first = content.edges.find(({ from, to }) => from === edge.from && to === edge.to);
		if (first?.id !== edge.id) {
			expect(labels.has(edge.id), `${edge.id} wears its cable's plate`).toBe(false);
		} else if (edge.label) {
			expect(labels.has(edge.id), `${edge.id} keeps its label`).toBe(true);
			expect(
				words
					.filter(({ subject }) => subject.kind === "edge" && subject.id === edge.id)
					.map(({ text }) => text)
					.join(" "),
			).toContain(edge.label);
		}
	}
	expect(routesThroughCards(drawing, content)).toEqual([]);
	expect(detached(drawing)).toEqual([]);
	expect(covering(drawing)).toEqual([]);
	expect(masking(drawing)).toEqual([]);
	expect(overlaps(drawing, content)).toEqual([]);
	return { paths };
}

for (const framed of [false, true]) {
	test(`parallel relationships keep both identities and one plate ${framed ? "across a frame" : "between cards"}`, async () => {
		const content = orderedFixture({
			nodes: [
				...(framed ? [{ id: "frame", name: "Frame", kind: "service" }] : []),
				{ id: "source", name: "Source", kind: "module", ...(framed ? { parent: "frame" } : {}) },
				{ id: "target", name: "Target", kind: "module" },
			],
			edges: [
				{ id: "request", from: "source", to: "target", kind: "call", label: "request" },
				{ id: "signal", from: "source", to: "target", kind: "signal", label: "signal" },
			],
		});
		const { paths } = await expectReadableRoutes(content);
		expect([...paths.keys()].toSorted()).toEqual(["request", "signal"]);
	});
}

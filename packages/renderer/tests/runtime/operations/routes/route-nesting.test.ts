import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
// Relationships may share ports and trunks. Their identities, words, and
// semantic endpoints must remain legible even when their geometry coincides.

import { expect, test } from "bun:test";
import type { VariantContent } from "@archboard/board/content";
import type { LayoutEngineName } from "@archboard/board/render-reply";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { covering, detached, masking, overlaps } from "#tests/runtime/support/drawn-labels.ts";
import { routesThroughCards } from "#tests/runtime/support/drawn-ink.ts";
import { distanceToFrame, routeLabels, routePoints } from "#tests/runtime/support/drawn-routes.ts";
import { drawnTexts } from "#tests/runtime/support/drawn-text.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** Each relationship starts and ends at the frame of the subject it names. */
async function expectReadableRoutes(
	content: VariantContent,
	layout?: LayoutEngineName,
): Promise<{ drawing: RenderedDiagram; paths: ReturnType<typeof routePoints> }> {
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		layout,
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
		if (edge.label) {
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
	return { drawing, paths };
}

test("a Track fan shares a centered port where departures use the same card face", async () => {
	const content = orderedFixture({
		nodes: ["hub", "one", "two", "three", "four", "five"].map((id) => ({
			id,
			name: id,
			kind: "module",
		})),
		edges: ["one", "two", "three", "four", "five"].map((to, index) => ({
			id: `e${index}`,
			from: "hub",
			to,
			kind: "call",
			label: `message ${index}`,
		})),
	});
	const { drawing, paths } = await expectReadableRoutes(content, "track");
	const starts = content.edges.map(({ id }) => paths.get(id)![0]!);
	const hub = drawing.atlas.nodes["hub"]!;
	const faceCenters = [
		{ x: hub.x + hub.width / 2, y: hub.y },
		{ x: hub.x + hub.width / 2, y: hub.y + hub.height },
		{ x: hub.x, y: hub.y + hub.height / 2 },
		{ x: hub.x + hub.width, y: hub.y + hub.height / 2 },
	];
	for (const start of starts) {
		expect(
			Math.min(...faceCenters.map(({ x, y }) => Math.hypot(start.x - x, start.y - y))),
		).toBeLessThan(0.02);
	}
	const unique = new Set(starts.map(({ x, y }) => `${x},${y}`));
	expect(unique.size).toBeLessThanOrEqual(4);
});

for (const framed of [false, true]) {
	test(`parallel relationships keep both identities and labels ${framed ? "across a frame" : "between cards"}`, async () => {
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

import { expect, test } from "bun:test";
import {
	VariantContentSchema,
	type DiagramBox,
	type VariantContent,
} from "@/shared/semantic-board/index";
import { fitIn } from "@/shared/shell-geometry/index";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import { labelsOffRuns, routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";
import { covering, overlaps } from "@/runtime/semantic-renderer/tests/drawn-labels";
import {
	bodyShift,
	boxesOverlap,
	distanceToFrame,
	routeCrosses,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { scorecardOf } from "@/runtime/semantic-renderer/tests/drawn-scorecard";
import { groupOf } from "@/runtime/semantic-renderer/tests/drawn-subjects";
import phone from "../../../../docs/design/wide-board-layout-fixtures/phone-ownership.content.json";
import publicApi from "../../../../docs/design/wide-board-layout-fixtures/public-api-independent.content.json";

/**
 * Whether a whole card fits inside its actual parent, including rounded SVG precision.
 * @param child The contained card.
 * @param parent Its frame.
 * @returns True when the frame encloses the card.
 */
function contains(parent: DiagramBox, child: DiagramBox): boolean {
	return (
		child.x >= parent.x - 0.02 &&
		child.y >= parent.y - 0.02 &&
		child.x + child.width <= parent.x + parent.width + 0.02 &&
		child.y + child.height <= parent.y + parent.height + 0.02
	);
}

/**
 * Whether an outside card shares vertical room beside a frame.
 * @param card An outside card.
 * @param frame The connected container.
 * @returns True when the card uses the frame's vertical span without entering it.
 */
function alongside(card: DiagramBox, frame: DiagramBox): boolean {
	return (
		!boxesOverlap(card, frame) &&
		Math.min(card.y + card.height, frame.y + frame.height) - Math.max(card.y, frame.y) > 1
	);
}

/**
 * Preserve the visible meaning and clearance while allowing a new layout.
 * @param drawing The public renderer's result.
 * @param content The canonical architecture.
 */
function expectIntact(drawing: RenderedDiagram, content: VariantContent) {
	const routes = routePoints(drawing.svg);
	const labels = routeLabels(drawing.svg);
	const edgeIds = content.edges.map(({ id }) => id).toSorted();
	expect(Object.keys(drawing.atlas.nodes).toSorted()).toEqual(
		content.nodes.map(({ id }) => id).toSorted(),
	);
	expect(Object.keys(drawing.atlas.edges).toSorted()).toEqual(edgeIds);
	expect([...routes.keys()].toSorted()).toEqual(edgeIds);
	expect([...labels.keys()].toSorted()).toEqual(
		content.edges
			.filter(({ label }) => label !== undefined)
			.map(({ id }) => id)
			.toSorted(),
	);
	expect(routesThroughCards(drawing, content)).toEqual([]);
	expect(labelsOffRuns(drawing)).toEqual([]);
	expect(overlaps(drawing, content)).toEqual([]);
	expect(covering(drawing)).toEqual([]);

	for (const node of content.nodes) {
		if (node.parent === undefined) continue;
		expect(
			contains(drawing.atlas.nodes[node.parent]!, drawing.atlas.nodes[node.id]!),
			`${node.id} stays inside ${node.parent}`,
		).toBe(true);
	}
	for (const edge of content.edges) {
		const points = routes.get(edge.id)!;
		for (const [point, id] of [
			[points[0]!, edge.from],
			[points.at(-1)!, edge.to],
		] as const) {
			const box = drawing.atlas.nodes[id]!;
			expect(contains(box, { ...point, width: 0, height: 0 }), `${edge.id} endpoint ${id}`).toBe(
				true,
			);
			expect(distanceToFrame(point, box), `${edge.id} touches ${id}`).toBeLessThan(0.02);
		}
	}

	const shift = bodyShift(drawing.svg);
	for (const [id, frame] of Object.entries(drawing.atlas.regions)) {
		// Read the complete title band from its visible separator, rather than
		// importing the engine's private header dimensions or checking text alone.
		const rule = /<line[^>]*\sy1="([\d.-]+)"/.exec(groupOf(drawing.svg, "region", id)!.markup);
		expect(rule, `${id} has a visible header boundary`).not.toBeNull();
		const header = { ...frame, height: Number(rule![1]) + shift.y - frame.y };
		expect(header.height).toBeGreaterThan(0);
		for (const [edgeId, points] of routes) {
			expect(routeCrosses(points, header), `${edgeId} clears ${id}'s header`).toBe(false);
			const edge = content.edges.find((candidate) => candidate.id === edgeId)!;
			const touches = [edge.from, edge.to].some(
				(endpoint) =>
					endpoint === id ||
					content.nodes.some((node) => node.id === endpoint && node.parent === id),
			);
			if (!touches)
				expect(routeCrosses(points, frame), `${edgeId} clears unrelated ${id}`).toBe(false);
		}
		for (const [edgeId, label] of labels) {
			expect(boxesOverlap(label, header), `${edgeId}'s label clears ${id}'s header`).toBe(false);
		}
	}
}

for (const fixture of [
	{
		name: "Phone ownership",
		content: phone,
		width: 953,
		height: 1192,
		length: 1630,
		crossings: 0,
		sharedRows: false,
	},
	{
		name: "Public API independent",
		content: publicApi,
		width: 2243,
		height: 3194,
		length: 22481,
		crossings: 21,
		sharedRows: true,
	},
]) {
	test(`${fixture.name}: connected containers retain clearer, shorter wiring`, async () => {
		const content = VariantContentSchema.parse(fixture.content);
		const drawing = await renderArchitecture({ content, theme: "dark" });
		expectIntact(drawing, content);
		// The baseline sizes and route totals are measured in shared-container-rows.md.
		// Improvement must exceed the corpus's two-percent size tolerance, not pin
		// either engine's chosen coordinates or trade height for unusable width.
		expect(fitIn(drawing)).toBeGreaterThan(fitIn(fixture) * 1.02);
		const measures = new Map(scorecardOf(drawing, content).map(({ name, value }) => [name, value]));
		expect(measures.get("route length")).toBeLessThan(fixture.length);
		expect(measures.get("crossings")).toBeLessThanOrEqual(fixture.crossings);
		// Forced label waypoints produced 3.52 bends per route on Public API;
		// natural runs must retain the ordinary corpus's three-bend allowance.
		expect(measures.get("bends per route")).toBeLessThanOrEqual(3);
		// The user preferred Phone's compact one-column reading over a marginal
		// fit gain. Its shape is owned by automatic-columns.test.ts; Public API
		// still proves outside cards can use a connected frame's vertical span.
		if (!fixture.sharedRows) return;
		const sharesRows = content.edges.some((edge) =>
			[
				[edge.from, edge.to],
				[edge.to, edge.from],
			].some(([outsideId, insideId]) => {
				const outside = content.nodes.find(({ id }) => id === outsideId)!;
				const inside = content.nodes.find(({ id }) => id === insideId)!;
				return (
					outside.parent === undefined &&
					inside.parent !== undefined &&
					!(outside.id in drawing.atlas.regions) &&
					alongside(drawing.atlas.nodes[outside.id]!, drawing.atlas.nodes[inside.parent]!)
				);
			}),
		);
		expect(sharesRows).toBe(true);
	});
}

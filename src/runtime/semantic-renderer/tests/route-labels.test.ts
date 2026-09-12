// A label belongs to one line, visibly: the pill sits on the run it names and
// does not lie across the neighbour's run. Either alone leaves a reader
// guessing, which is what a photographed pair of opposed labelled arrows did.
// Measured on a rendered page, because the gap, the ports and the settling
// together decide where a pill lands.

import { describe, expect, test } from "bun:test";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import {
	boxesOverlap,
	distanceToRoute,
	routeCrosses,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

/** The reported shape: a pane and its routes, wired both ways and labelled both ways. */
const PAIRED: VariantContent = VariantContentSchema.parse({
	nodes: [
		{ id: "pane", name: "Pane", kind: "external", responsibility: "Shows a board" },
		{ id: "routes", name: "Routes", kind: "module" },
		{
			id: "store",
			name: "Store",
			kind: "module",
			responsibility: "The one place a board is written",
		},
	],
	edges: [
		{ id: "asks", from: "pane", to: "routes", kind: "http", label: "asks", emphasis: "hero" },
		{ id: "reads", from: "routes", to: "store", kind: "call", label: "reads" },
		{ id: "drawing", from: "routes", to: "pane", kind: "data", label: "the drawing" },
		{ id: "dep", from: "store", to: "routes", kind: "dependency" },
	],
});

/** Three labelled crossings of one gap, which is more than any pair of cards. */
const THREE_WAYS: VariantContent = VariantContentSchema.parse({
	nodes: [
		{ id: "boundary", name: "Write boundary", kind: "service" },
		{ id: "write", name: "Board write", kind: "module" },
	],
	edges: [
		{ id: "lease", from: "boundary", to: "write", kind: "call", label: "under lease" },
		{ id: "settled", from: "write", to: "boundary", kind: "event", label: "settled" },
		{ id: "delta", from: "boundary", to: "write", kind: "data", label: "the delta" },
	],
});

/** An architecture whose corridors carry labelled traffic in both directions. */
const CROWDED: VariantContent = VariantContentSchema.parse({
	nodes: [
		{ id: "edge", name: "Edge", kind: "service", responsibility: "Public entry points" },
		{ id: "gw", name: "API Gateway", kind: "route", parent: "edge" },
		{ id: "web", name: "Operator Console", kind: "ui", parent: "edge" },
		{ id: "core", name: "Board Runtime", kind: "service", responsibility: "Owns every write" },
		{ id: "io", name: "board-io", kind: "module", parent: "core" },
		{ id: "queue", name: "Edit Queue", kind: "queue", parent: "core" },
		{ id: "store", name: "Vault", kind: "datastore" },
	],
	edges: [
		{ id: "e1", from: "web", to: "gw", kind: "http", label: "REST" },
		{ id: "e2", from: "gw", to: "io", kind: "call", label: "read board", emphasis: "hero" },
		{ id: "e3", from: "io", to: "gw", kind: "event", label: "settled" },
		{ id: "e4", from: "gw", to: "queue", kind: "event", label: "enqueue" },
		{ id: "e5", from: "queue", to: "io", kind: "call", label: "drain" },
		{ id: "e6", from: "io", to: "store", kind: "data", label: "writes" },
		{ id: "e7", from: "store", to: "io", kind: "data", label: "the board" },
		{ id: "e8", from: "store", to: "web", kind: "data", label: "the picture" },
	],
});

/**
 * How far each pill sits from the route it names.
 * @param drawn The rendered picture.
 * @returns One "id: distance" per pill.
 */
function detached(drawn: RenderedDiagram): string[] {
	const routes = routePoints(drawn.svg);
	return [...routeLabels(drawn.svg)].flatMap(([id, pill]) => {
		const points = routes.get(id);
		if (points === undefined) {
			return [];
		}
		const away = distanceToRoute(pill, points);
		return away > 0 ? [`${id} sits ${away.toFixed(1)} off its line`] : [];
	});
}

/**
 * Every pill lying across a route other than the one it names.
 * @param drawn The rendered picture.
 * @returns One "pill over route" per covering.
 */
function covering(drawn: RenderedDiagram): string[] {
	const routes = [...routePoints(drawn.svg)];
	return [...routeLabels(drawn.svg)].flatMap(([id, pill]) =>
		routes
			.filter(([other, points]) => other !== id && routeCrosses(points, pill))
			.map(([other]) => `${id} over ${other}`),
	);
}

/**
 * Every pill drawn over the arrowhead of the route it names.
 *
 * The head covers `HEAD_REACH` of the line back from the tip, so the zone is
 * sampled along the route's own last segment from each end.
 * @param drawn The rendered picture.
 * @returns One id per pill standing on its own head.
 */
function masking(drawn: RenderedDiagram): string[] {
	const routes = routePoints(drawn.svg);
	return [...routeLabels(drawn.svg)].flatMap(([id, pill]) => {
		const points = routes.get(id) ?? [];
		const ends = [
			[points[0], points[1]],
			[points[points.length - 1], points[points.length - 2]],
		] as const;
		const onHead = ends.some(([tip, back]) => {
			if (tip === undefined || back === undefined) {
				return false;
			}
			const length = Math.hypot(back.x - tip.x, back.y - tip.y) || 1;
			return [2, 4, 6, 7.5].some((step) => {
				const at = {
					x: tip.x + ((back.x - tip.x) / length) * step,
					y: tip.y + ((back.y - tip.y) / length) * step,
				};
				return (
					at.x >= pill.x &&
					at.x <= pill.x + pill.width &&
					at.y >= pill.y &&
					at.y <= pill.y + pill.height
				);
			});
		});
		return onHead ? [id] : [];
	});
}

/**
 * Every pill overlapping another pill or a card. A card holding other cards is
 * a frame: a pill standing in that room covers nothing.
 * @param drawn The rendered picture.
 * @param content What was drawn.
 * @returns One "pill over thing" per overlap.
 */
function overlaps(drawn: RenderedDiagram, content: VariantContent): string[] {
	const frames = new Set(content.nodes.map((node) => node.parent));
	const pills = [...routeLabels(drawn.svg)];
	const cards = Object.entries(drawn.atlas.nodes).filter(([id]) => !frames.has(id));
	const found: string[] = [];
	pills.forEach(([id, pill], index) => {
		for (const [other, box] of pills.slice(index + 1)) {
			if (boxesOverlap(pill, box)) {
				found.push(`${id} over ${other}`);
			}
		}
		for (const [card, box] of cards) {
			if (boxesOverlap(pill, box)) {
				found.push(`${id} over the ${card} card`);
			}
		}
	});
	return found;
}

describe("a label belongs to one line", () => {
	for (const [what, content] of [
		["the reported pair", PAIRED],
		["three crossings of one gap", THREE_WAYS],
		["a crowded architecture", CROWDED],
	] as const) {
		test(`every pill of ${what} is drawn on its own route`, () => {
			for (const theme of ["light", "dark"] as const) {
				const drawn = renderArchitecture({ content, theme });
				expect(routeLabels(drawn.svg).size).toBeGreaterThan(1);
				expect(detached(drawn)).toEqual([]);
			}
		});

		test(`no pill of ${what} covers another pill or a card`, () => {
			expect(overlaps(renderArchitecture({ content, theme: "light" }), content)).toEqual([]);
		});
	}

	for (const [what, content] of [
		["the reported pair", PAIRED],
		["three crossings of one gap", THREE_WAYS],
	] as const) {
		test(`no pill of ${what} lies across a line it does not name`, () => {
			// Sitting on its own line is not enough: a pill wide enough to cover the
			// neighbour's line names both of them as far as a reader can tell.
			for (const theme of ["light", "dark"] as const) {
				expect(covering(renderArchitecture({ content, theme }))).toEqual([]);
			}
		});
	}

	test("no pill of the reported pair sits on its own arrowhead", () => {
		// A head hidden under the words stops saying which way the line runs.
		for (const theme of ["light", "dark"] as const) {
			expect(masking(renderArchitecture({ content: PAIRED, theme }))).toEqual([]);
		}
	});

	test("the ports of a labelled pair stand as far apart as their words are wide", () => {
		const drawn = renderArchitecture({ content: PAIRED, theme: "light" });
		const up = routePoints(drawn.svg).get("drawing") ?? [];
		const down = routePoints(drawn.svg).get("asks") ?? [];
		expect(up.length).toBeGreaterThan(1);
		expect(down.length).toBeGreaterThan(1);
		// Both cross the gap dead straight, on their own port.
		expect(up.every((point) => point.x === up[0]?.x)).toBe(true);
		expect(down.every((point) => point.x === down[0]?.x)).toBe(true);
		// Far enough that a pill centred on either line stops short of the other,
		// measured from the pills as they were drawn.
		const pills = routeLabels(drawn.svg);
		const widest = Math.max(pills.get("drawing")?.width ?? 0, pills.get("asks")?.width ?? 0);
		expect(widest).toBeGreaterThan(0);
		expect(Math.abs((up[0]?.x ?? 0) - (down[0]?.x ?? 0))).toBeGreaterThanOrEqual(widest / 2);
	});
});

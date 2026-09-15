// The three Flask module maps of docs/design/wide-board-layout.md, held to
// what a reader needs from a wide board rather than to any face or lane: no
// route through a card, no card fanning skips down the margin, a bounded
// share of route ink in margin corridors, a bounded page, and no snaking.
// The numbers are the measured result of docs/design/layout-rules.md with a
// little room, so a rule change that spends them is seen.

import { describe, expect, test } from "bun:test";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import { corridorPoints, routeCrosses } from "@/runtime/semantic-renderer/tests/drawn-routes";
import first from "../../../../docs/design/wide-board-layout-fixtures/flask-map-1.content.json";
import second from "../../../../docs/design/wide-board-layout-fixtures/flask-map-2.content.json";
import third from "../../../../docs/design/wide-board-layout-fixtures/flask-map-3.content.json";

/** What each fixture may cost, measured on 2026-09-15 plus room. */
const BOUNDS = [
	{ name: "flask-map-1", content: first, megapixels: 6.0, corridor: 0.25, bends: 8.5 },
	{ name: "flask-map-2", content: second, megapixels: 6.8, corridor: 0.15, bends: 8.0 },
	{ name: "flask-map-3", content: third, megapixels: 5.5, corridor: 0.15, bends: 9.5 },
] as const;

/**
 * The share of route ink in vertical runs beside no card: a lane down a
 * margin rather than a route between rows.
 * @param drawing The rendered board.
 * @returns Corridor ink over all ink, and bends per route.
 */
function inkOf(drawing: RenderedDiagram): { readonly corridor: number; readonly bends: number } {
	const cards = Object.values(drawing.atlas.nodes);
	let total = 0,
		corridor = 0,
		bends = 0,
		routes = 0;
	for (const points of corridorPoints(drawing.svg).values()) {
		routes += 1;
		for (let index = 1; index < points.length; index += 1) {
			const start = points[index - 1]!,
				end = points[index]!;
			const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
			total += length;
			const vertical = start.x === end.x && start.y !== end.y;
			if (vertical && !cards.some((box) => box.x <= start.x && start.x <= box.x + box.width))
				corridor += length;
			if (index >= 2) {
				const before = points[index - 2]!;
				if ((before.x === start.x) !== (start.x === end.x)) bends += 1;
			}
		}
	}
	return { corridor: total === 0 ? 0 : corridor / total, bends: routes === 0 ? 0 : bends / routes };
}

/**
 * How many routes leave each card by its west face.
 * @param drawing The rendered board.
 * @param content The board.
 * @returns The largest count over the cards.
 */
function westExitsOf(drawing: RenderedDiagram, content: VariantContent): number {
	const counts = new Map<string, number>();
	for (const [id, points] of corridorPoints(drawing.svg)) {
		const edge = content.edges.find((candidate) => candidate.id === id);
		const from = edge === undefined ? undefined : drawing.atlas.nodes[edge.from];
		if (edge === undefined || from === undefined) continue;
		if (Math.abs(points[0]!.x - from.x) < 1)
			counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
	}
	return Math.max(0, ...counts.values());
}

describe("a wide board reads as its cards and their wiring", () => {
	for (const bound of BOUNDS) {
		test(`${bound.name}: no route through a card, no fan of skips, bounded corridors, page and bends`, async () => {
			const content = VariantContentSchema.parse(bound.content);
			const drawing = await renderArchitecture({ content, theme: "light" });
			const routes = corridorPoints(drawing.svg);
			for (const edge of content.edges) {
				const route = routes.get(edge.id)!;
				for (const [id, box] of Object.entries(drawing.atlas.nodes)) {
					if (id === edge.from || id === edge.to) continue;
					expect(routeCrosses(route, box), `${edge.id} through ${id}`).toBe(false);
				}
			}
			expect(
				westExitsOf(drawing, content),
				"skips fanning down one card's flank",
			).toBeLessThanOrEqual(1);
			const ink = inkOf(drawing);
			expect(ink.corridor, "route ink in margin corridors").toBeLessThanOrEqual(bound.corridor);
			expect(ink.bends, "bends per route").toBeLessThanOrEqual(bound.bends);
			expect((drawing.width * drawing.height) / 1e6, "page in megapixels").toBeLessThanOrEqual(
				bound.megapixels,
			);
		});
	}
});

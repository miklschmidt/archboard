// Measuring badge attachment, occlusion and whitespace on actual rendered routes.

import type { VariantContent } from "@/shared/semantic-board/index";
import type { RenderedDiagram } from "@/runtime/semantic-renderer/index";
import {
	boxesOverlap,
	distanceToRoute,
	routeCrosses,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

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
 * @param cardAir Minimum whitespace the pill must retain beside a card.
 * @returns One "pill over thing" per overlap.
 */
function overlaps(drawn: RenderedDiagram, content: VariantContent, cardAir: number = 0): string[] {
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
			if (
				boxesOverlap(pill, {
					x: box.x - cardAir,
					y: box.y - cardAir,
					width: box.width + cardAir * 2,
					height: box.height + cardAir * 2,
				})
			) {
				found.push(`${id} over the ${card} card`);
			}
		}
	});
	return found;
}

export { detached, covering, overlaps, masking };

// Corpus checks on a drawn board, shared by the wide-board corpus and the
// focused owners of the regressions it found: a run under another line's
// label, lines closer than a lane, a line along a container's wall, a label
// across a container's edge, and a route on a slant.

import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import {
	type DrawnPoint,
	bodyShift,
	corridorPoints,
	routeLabels,
	routePoints,
	routeCrosses,
} from "#tests/runtime/support/drawn-routes.ts";

/**
 * Every straight run of one route through another relationship's label, where
 * a reader would take the route to end at the label it vanishes under.
 * @param drawing The rendered board.
 * @returns Each such route and label, named.
 */
function runsUnderLabels(drawing: RenderedDiagram): string[] {
	const routes = [...corridorPoints(drawing.svg)];
	const inside = 3;
	return [...routeLabels(drawing.svg)].flatMap(([id, pill]) =>
		routes
			.filter(([other]) => other !== id)
			.filter(([, points]) =>
				points.slice(1).some((end, index) => {
					const start = points[index]!;
					const [low, high] = [pill.x + inside, pill.x + pill.width - inside];
					const [top, bottom] = [pill.y + inside, pill.y + pill.height - inside];
					if (start.x === end.x)
						return (
							start.x > low &&
							start.x < high &&
							Math.max(start.y, end.y) > top &&
							Math.min(start.y, end.y) < bottom
						);
					if (start.y === end.y)
						return (
							start.y > top &&
							start.y < bottom &&
							Math.max(start.x, end.x) > low &&
							Math.min(start.x, end.x) < high
						);
					return false;
				}),
			)
			.map(([other]) => `${other} under ${id}`),
	);
}

/** The least distance the track engine keeps between two lines that do not share a trunk. */
const TRACK_LANE = 16;

/** One straight run of a drawn route. */
interface Run {
	readonly edge: string;
	readonly vertical: boolean;
	/** Where it stands across its direction. */
	readonly at: number;
	readonly from: number;
	readonly to: number;
}

/**
 * Every straight run of every route longer than a bend.
 * @param routes Each route's points, by relationship id.
 * @returns The runs.
 */
function runsOf(routes: ReadonlyMap<string, readonly DrawnPoint[]>): Run[] {
	return [...routes].flatMap(([edge, points]) =>
		points.slice(1).flatMap((point, index) => {
			const previous = points[index]!;
			const vertical = Math.abs(point.x - previous.x) < 0.01;
			const horizontal = Math.abs(point.y - previous.y) < 0.01;
			if (vertical === horizontal) return [];
			const [one, other] = vertical ? [previous.y, point.y] : [previous.x, point.x];
			if (Math.abs(other - one) < 2 * TRACK_LANE) return [];
			return [
				{
					edge,
					vertical,
					at: vertical ? point.x : point.y,
					from: Math.min(one, other),
					to: Math.max(one, other),
				},
			];
		}),
	);
}

/**
 * Pairs of lines that run side by side closer than a lane without sharing a
 * trunk: the near-coincident lanes the track engine exists to prevent. Lanes
 * are read without crossing hops: a trunk's drawer rises over a crossing
 * alone, a hop's radius off the ink its trunk mates share and do not show.
 * @param drawing The rendered board.
 * @returns The pairs, by relationship ids and their distance.
 */
function nearLanes(drawing: RenderedDiagram): string[] {
	const runs = runsOf(corridorPoints(drawing.svg));
	return runs.flatMap((run, index) =>
		runs.slice(index + 1).flatMap((other) => {
			const gap = Math.abs(run.at - other.at);
			const overlap = Math.min(run.to, other.to) - Math.max(run.from, other.from);
			return run.edge !== other.edge &&
				run.vertical === other.vertical &&
				overlap > TRACK_LANE &&
				gap > 0.5 &&
				gap < TRACK_LANE - 0.5
				? [`${run.edge}/${other.edge} ${gap.toFixed(1)}`]
				: [];
		}),
	);
}

/**
 * Upright runs within half a lane of a frame's or group region's side wall,
 * where a line reads as part of the container's border.
 * @param drawing The rendered board.
 * @returns Each such run's relationship id and the wall's x.
 */
function wallHugs(drawing: RenderedDiagram): string[] {
	const boxes =
		/<g data-semantic-kind="(?:region"[^>]*data-depiction="container|group-region)"[^>]*>\s*(?:<rect class="ab-halo"[^>]*>\s*)?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/gu;
	// Routes are read on the page, so the walls are moved onto it with them.
	const shift = bodyShift(drawing.svg);
	const walls = [...drawing.svg.matchAll(boxes)].flatMap(([, x, y, width, height]) =>
		[Number(x), Number(x) + Number(width)].map((at) => ({
			at: at + shift.x,
			from: Number(y) + shift.y,
			to: Number(y) + Number(height) + shift.y,
		})),
	);
	return runsOf(routePoints(drawing.svg))
		.filter(({ vertical }) => vertical)
		.flatMap((run) =>
			walls
				.filter((wall) => {
					const gap = Math.abs(run.at - wall.at);
					const along = Math.min(run.to, wall.to) - Math.max(run.from, wall.from);
					return gap > 0.5 && gap < TRACK_LANE / 2 && along > 2 * TRACK_LANE;
				})
				.map((wall) => `${run.edge} ${wall.at}`),
		);
}

/**
 * The label boxes that stand across a container's edge: over part of a frame
 * or group region without standing wholly inside it, below its top edge.
 * @param drawing The rendered board.
 * @returns Each such label's relationship id and the container's corner.
 */
function labelsAcrossWalls(drawing: RenderedDiagram): string[] {
	const boxes =
		/<g data-semantic-kind="(?:region"[^>]*data-depiction="container|group-region)"[^>]*>\s*(?:<rect class="ab-halo"[^>]*>\s*)?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/gu;
	// Labels are read on the page, so the containers are moved onto it with them.
	const shift = bodyShift(drawing.svg);
	const containers = [...drawing.svg.matchAll(boxes)].map(([, x, y, width, height]) => ({
		x: Number(x) + shift.x,
		y: Number(y) + shift.y,
		width: Number(width),
		height: Number(height),
	}));
	return [...routeLabels(drawing.svg)].flatMap(([id, label]) =>
		containers
			.filter((box) => {
				const overlaps =
					label.x < box.x + box.width &&
					box.x < label.x + label.width &&
					label.y < box.y + box.height &&
					box.y < label.y + label.height;
				const inside =
					label.x >= box.x &&
					label.x + label.width <= box.x + box.width &&
					label.y > box.y &&
					label.y + label.height <= box.y + box.height;
				return overlaps && !inside;
			})
			.map((box) => `${id} across ${box.x},${box.y}`),
	);
}

/**
 * The routes that run on a slant anywhere longer than a rounded corner: a
 * route is drawn across and down, and a slant is a route that lost its way.
 * @param drawing The rendered board.
 * @returns The slanted routes' relationship ids.
 */
function slants(drawing: RenderedDiagram): string[] {
	return [...routePoints(drawing.svg)].flatMap(([edge, points]) =>
		points.slice(1).some((point, index) => {
			const previous = points[index]!;
			const across = Math.abs(point.x - previous.x);
			const down = Math.abs(point.y - previous.y);
			return across > 0.5 && down > 0.5 && Math.hypot(across, down) > 3 * TRACK_LANE;
		})
			? [edge]
			: [],
	);
}

/**
 * Routes through the painted background of a group's caption.
 * @param drawing The rendered architecture.
 * @returns Each relationship and the group header that it crosses.
 */
function routesThroughGroupHeaders(drawing: RenderedDiagram): string[] {
	const shift = bodyShift(drawing.svg);
	const routes = routePoints(drawing.svg);
	return drawing.svg.split(/(?=<g data-semantic-kind=)/u).flatMap((chunk) => {
		if (!chunk.startsWith('<g data-semantic-kind="group-region"')) return [];
		const group = /data-group="([^"]+)"/u.exec(chunk)?.[1];
		// Both zoom layers paint a caption tab. The far tab can be wider.
		const boxes = [
			...chunk.matchAll(
				/<g class="ab-(?:near|far)">\s*<path d="M(-?[\d.]+),(-?[\d.]+) V[\d.]+ A[\d., ]+ [01] [01] [01] (-?[\d.]+),(-?[\d.]+) H(-?[\d.]+)/gu,
			),
		].map((tab) => ({
			x: Math.min(Number(tab[1]), Number(tab[5])) + shift.x,
			y: Number(tab[4]) + shift.y,
			width: Math.abs(Number(tab[1]) - Number(tab[5])),
			height: Number(tab[2]) - Number(tab[4]),
		}));
		return [...routes]
			.filter(([, points]) => boxes.some((box) => routeCrosses(points, box)))
			.map(([id]) => `${id} through ${group} header`);
	});
}

export {
	TRACK_LANE,
	labelsAcrossWalls,
	nearLanes,
	routesThroughGroupHeaders,
	runsUnderLabels,
	slants,
	wallHugs,
};

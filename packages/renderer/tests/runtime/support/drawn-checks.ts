// Corpus checks on a drawn document, shared by the wide-picture corpus and the
// focused owners of the regressions it found: a run under another line's
// label, a label across a container's edge, and a route on a slant.

import type { DiagramBox } from "@archboard/model/render-reply";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import { cablesOf } from "#tests/runtime/support/drawn-cables.ts";
import {
	type DrawnPoint,
	bodyShift,
	corridorPoints,
	routeLabels,
	routePoints,
} from "#tests/runtime/support/drawn-routes.ts";

/** How far inside a label a run must reach to pass under it. */
const UNDER_LABEL = 3;

/**
 * Whether a straight run passes under a label.
 * @param pill The label.
 * @param start Where the run starts.
 * @param end Where it ends.
 * @returns True when it does.
 */
function passesUnder(pill: DiagramBox, start: DrawnPoint, end: DrawnPoint): boolean {
	const [low, high] = [pill.x + UNDER_LABEL, pill.x + pill.width - UNDER_LABEL];
	const [top, bottom] = [pill.y + UNDER_LABEL, pill.y + pill.height - UNDER_LABEL];
	if (start.x === end.x)
		return (
			start.x > low &&
			start.x < high &&
			Math.max(start.y, end.y) > top &&
			Math.min(start.y, end.y) < bottom
		);
	return (
		start.y === end.y &&
		start.y > top &&
		start.y < bottom &&
		Math.max(start.x, end.x) > low &&
		Math.min(start.x, end.x) < high
	);
}

/**
 * How many straight runs of a route pass under a label.
 * @param pill The label.
 * @param points The route.
 * @returns The count.
 */
function runsUnder(pill: DiagramBox, points: readonly DrawnPoint[]): number {
	return points.slice(1).filter((end, index) => passesUnder(pill, points[index]!, end)).length;
}

/**
 * Every straight run of one route through another cable's label, where a
 * reader would take the route to end at the label it vanishes under. A
 * cable's strands run under its own plate.
 * @param drawing The rendered document.
 * @returns Each such route and label, named.
 */
function runsUnderLabels(drawing: RenderedDiagram): string[] {
	const routes = [...corridorPoints(drawing.svg)];
	const cables = cablesOf(drawing);
	return [...routeLabels(drawing.svg)].flatMap(([id, pill]) =>
		routes
			.filter(
				([other, points]) =>
					!(cables.get(id) ?? [id]).includes(other) && runsUnder(pill, points) > 0,
			)
			.map(([other]) => `${other} under ${id}`),
	);
}

/**
 * Every label with more than one stretch of its own route under it.
 * @param drawing The rendered document.
 * @returns Each such relationship, named.
 */
function labelsOverOwnLine(drawing: RenderedDiagram): string[] {
	const routes = new Map(corridorPoints(drawing.svg));
	return [...routeLabels(drawing.svg)].flatMap(([id, pill]) =>
		runsUnder(pill, routes.get(id) ?? []) > 1 ? [id] : [],
	);
}

/** A lane: the width a drawn line may be off a straight one before a bend is worth drawing. */
const LANE = 16;

/**
 * The label boxes that stand across a container's edge: over part of a frame
 * without standing wholly inside it, below its top edge.
 * @param drawing The rendered document.
 * @returns Each such label's relationship id and the container's corner.
 */
function labelsAcrossWalls(drawing: RenderedDiagram): string[] {
	const boxes =
		/<g data-semantic-kind="region"[^>]*data-depiction="container"[^>]*>\s*(?:<rect class="ab-halo"[^>]*>\s*)?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/gu;
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
 * @param drawing The rendered document.
 * @returns The slanted routes' relationship ids.
 */
function slants(drawing: RenderedDiagram): string[] {
	return [...routePoints(drawing.svg)].flatMap(([edge, points]) =>
		points.slice(1).some((point, index) => {
			const previous = points[index]!;
			const across = Math.abs(point.x - previous.x);
			const down = Math.abs(point.y - previous.y);
			return across > 0.5 && down > 0.5 && Math.hypot(across, down) > 3 * LANE;
		})
			? [edge]
			: [],
	);
}

export { labelsAcrossWalls, labelsOverOwnLine, runsUnderLabels, slants };

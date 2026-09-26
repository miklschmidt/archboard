// The side walls of the frames and group regions a track scene draws, fitted
// once every line is routed. Graphviz sizes a cluster to hold each label box
// where Graphviz stood it; the router then slides some labels onto their
// lines, and the strip kept for a label's old place stayed empty beside the
// container's members. Each wall is pulled in to one inset from the outermost
// thing its container holds.
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import {
	ARCHITECTURE_HEADER_PADDING,
	CONTAINER_INSET,
} from "@/transformers/semantic-renderer/config";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { LANE, REGION_CLEARANCE } from "@/transformers/semantic-renderer/lib/track/chains";
import {
	frameShapes,
	regionShapes,
	type FrameShape,
	type RegionShape,
} from "@/transformers/semantic-renderer/lib/track/containers";
import { REGION_CAPTION_INSET, type Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/**
 * Room a group region keeps beside its members; beside a line it holds it
 * keeps the clearance a lane keeps from its wall.
 */
const REGION_INSET = 14;

/** One container whose side walls are fitted. */
interface Fitting {
	/** Its box; replaced once fitted. */
	box: Box;
	/** The room it keeps beside what it holds. */
	readonly inset: number;
	/** The room it keeps beside a line it holds. */
	readonly clearance: number;
	/** The narrowest it may be: its heading's width. */
	readonly narrowest: number;
	/** Its title row or caption. */
	readonly heading: Box;
	/** How far in from its left wall its heading's words end. */
	readonly words: number;
}

/**
 * Whether two boxes share some area.
 * @param one A box.
 * @param other Another.
 * @returns True when they do.
 */
function overlaps(one: Box, other: Box): boolean {
	return (
		one.x < other.x + other.width &&
		other.x < one.x + one.width &&
		one.y < other.y + other.height &&
		other.y < one.y + one.height
	);
}

/**
 * Whether one line point, or the upright run from it to the next, stands in a box.
 * @param point The point.
 * @param next The line's next point, if any.
 * @param box The box.
 * @returns True when it does.
 */
function standsIn(point: Point, next: Point | undefined, box: Box): boolean {
	if (point.x <= box.x || point.x >= box.x + box.width) return false;
	const upright = next !== undefined && Math.abs(next.x - point.x) < 0.5;
	const [top, bottom] = upright
		? [Math.min(point.y, next.y), Math.max(point.y, next.y)]
		: [point.y, point.y];
	return top < box.y + box.height && bottom > box.y;
}

/**
 * The x of every point of a line inside a box, and of every upright run
 * that passes through it.
 * @param lines Every line's points.
 * @param box The box.
 * @returns The x's.
 */
function uprightsIn(lines: readonly (readonly Point[])[], box: Box): number[] {
	return lines.flatMap((points) =>
		points.flatMap((point, index) => (standsIn(point, points[index + 1], box) ? [point.x] : [])),
	);
}

/**
 * Pull a container's side walls in to one inset from the outermost thing it
 * holds: its cards and labels, the containers inside it and the lines
 * through it, a group region's wall a lane and a half from a line. A wall never moves out, never leaves the container narrower
 * than its heading, and never carries the heading's words onto a line that
 * crosses the heading's row, which the router set one lane past the words.
 * @param fitting The container; its box is replaced.
 * @param items Every card and label box.
 * @param inner The containers inside it, already fitted.
 * @param lines Every line's points.
 */
function fitSide(
	fitting: Fitting,
	items: readonly Box[],
	inner: readonly Fitting[],
	lines: readonly (readonly Point[])[],
): void {
	const { box, inset, clearance, narrowest, heading, words } = fitting;
	const held = [...items.filter((one) => overlaps(one, box)), ...inner.map((one) => one.box)];
	const uprights = uprightsIn(lines, box);
	if (held.length + uprights.length === 0) return;
	const lows = [...held.map(({ x }) => x - inset), ...uprights.map((x) => x - clearance)];
	const highs = [
		...held.map(({ x, width }) => x + width + inset),
		...uprights.map((x) => x + clearance),
	];
	const crossing = uprightsIn(lines, { ...heading, x: box.x, width: box.width });
	const right = box.x + box.width;
	let low = Math.max(box.x, Math.min(...lows, ...crossing.map((x) => x - LANE - words)));
	let high = Math.min(right, Math.max(...highs));
	if (high - low < narrowest) {
		high = Math.min(right, low + narrowest);
		low = Math.max(box.x, high - narrowest);
	}
	fitting.box = { ...box, x: low, width: high - low };
}

/**
 * Whether one container stands wholly inside another.
 * @param outer The outer container.
 * @param inner The inner one.
 * @returns True when it does.
 */
function around(outer: Fitting, inner: Fitting): boolean {
	return (
		inner !== outer &&
		outer.box.x <= inner.box.x &&
		inner.box.x + inner.box.width <= outer.box.x + outer.box.width &&
		outer.box.y <= inner.box.y &&
		inner.box.y + inner.box.height <= outer.box.y + outer.box.height
	);
}

/**
 * How much of the page a container covers.
 * @param fitting The container.
 * @returns Its area.
 */
function area(fitting: Fitting): number {
	return fitting.box.width * fitting.box.height;
}

/**
 * Fit every container's side walls, innermost first, so an outer container
 * fits around the inner ones as fitted.
 * @param fittings Every container; their boxes are replaced.
 * @param items Every card and label box.
 * @param lines Every line's points.
 */
function fitAll(
	fittings: readonly Fitting[],
	items: readonly Box[],
	lines: readonly (readonly Point[])[],
): void {
	const inside = new Map(
		fittings.map((one) => [one, fittings.filter((other) => around(one, other))]),
	);
	for (const one of fittings.toSorted((a, b) => area(a) - area(b)))
		fitSide(one, items, inside.get(one)!, lines);
}

/**
 * Every frame and group region of a routed scene, with its side walls fitted
 * to what it holds.
 * @param scene The routed scene.
 * @param edges The placed relationships.
 * @param lines Every line's points.
 * @param left How far every x moves.
 * @returns The frames and regions.
 */
function fitSides(
	scene: Scene,
	edges: ReadonlyMap<string, ElkExtendedEdge>,
	lines: ReadonlyMap<string, readonly Point[]>,
	left: number,
): { frames: FrameShape[]; regions: RegionShape[] } {
	const [frames, regions] = [frameShapes(scene, edges, left), regionShapes(scene, edges, left)];
	const items = [...scene.cards.values(), ...scene.labels.values()].map((item) =>
		scene.moved(item, left),
	);
	const framed = frames.map(({ id, box }): Fitting => {
		const title = scene.titles.get(id)!;
		const words = scene.words.get(title)!;
		const narrowest = words + ARCHITECTURE_HEADER_PADDING;
		const heading = scene.moved(title, left);
		return { box, inset: CONTAINER_INSET, clearance: CONTAINER_INSET, narrowest, heading, words };
	});
	const banded = regions.map(({ box, caption }): Fitting => {
		const words = REGION_CAPTION_INSET + caption.width;
		return {
			box,
			inset: REGION_INSET,
			clearance: REGION_CLEARANCE,
			narrowest: words + REGION_CAPTION_INSET,
			heading: caption,
			words,
		};
	});
	fitAll([...framed, ...banded], items, [...lines.values()]);
	return {
		frames: frames.map((frame, index) => ({ ...frame, box: framed[index]!.box })),
		regions: regions.map((region, index) => {
			const { box } = banded[index]!;
			const caption = { ...region.caption, x: region.caption.x + box.x - region.box.x };
			return { ...region, box, caption };
		}),
	};
}

export { fitSides };

// The side walls of the frames and group regions a track scene draws, fitted
// once every line is routed. Graphviz sizes a cluster to hold each label box
// where Graphviz stood it; the router then slides some labels onto their
// lines, and the strip kept for a label's old place stayed empty beside the
// container's members. Each wall is pulled in to one inset from the outermost
// thing its container holds.
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import { CONTAINER_INSET, REGION_INSET } from "#shared/constants/spacing.ts";
import { ARCHITECTURE_HEADER_PADDING } from "#shared/constants/design.ts";
import type { Box, Point } from "#shared/rules/geometry.ts";
import { LANE, REGION_CLEARANCE } from "#shared/rules/track/routes/chains.ts";
import {
	frameShapes,
	regionShapes,
	type FrameShape,
	type RegionShape,
} from "#shared/rules/track/scene/containers.ts";
import { REGION_CAPTION_INSET, TRACK_WIDE, type Scene } from "#shared/rules/track/scene/scene.ts";

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
	/**
	 * For a frame laid out as the region round it: how wide the region's
	 * caption needs it, and its box fitted before it widened for that.
	 */
	wide?: { readonly width: number; fitted?: Box };
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
 * The x of every line's end on a box's top or bottom wall.
 * @param lines Every line's points.
 * @param box The box.
 * @returns The x's.
 */
function endsOn(lines: readonly (readonly Point[])[], box: Box): number[] {
	return lines
		.flatMap((points) => [points[0]!, points.at(-1)!])
		.filter(
			({ x, y }) =>
				x > box.x &&
				x < box.x + box.width &&
				(Math.abs(y - box.y) < 0.5 || Math.abs(y - box.y - box.height) < 0.5),
		)
		.map(({ x }) => x);
}

/**
 * A frame laid out as the region round it, fitted, widened for its region's
 * caption: round the middle of the frame, inside the box its layout kept.
 * @param fitted The frame's box, fitted to what it holds.
 * @param width How wide the caption needs it.
 * @param kept The box its layout kept.
 * @returns The region's box.
 */
function widenedIn(fitted: Box, width: number, kept: Box): Box {
	const wide = Math.max(fitted.width, Math.min(kept.width, width));
	const centred = fitted.x - (wide - fitted.width) / 2;
	const x = Math.max(kept.x, Math.min(centred, kept.x + kept.width - wide));
	return { ...fitted, x, width: wide };
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
 * A frame laid out as the region round it holds the lines that end on it
 * too, and then stands as wide as its caption needs round what it holds.
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
	const uprights = [...uprightsIn(lines, box), ...(fitting.wide ? endsOn(lines, box) : [])];
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
	if (fitting.wide === undefined) return;
	fitting.wide.fitted = fitting.box;
	fitting.box = widenedIn(fitting.box, fitting.wide.width, box);
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
		// A frame laid out as the region round it keeps the region's inset too.
		const inset = CONTAINER_INSET + (title.inset ?? 0);
		const wide = scene.frames.get(id)!.node.layoutOptions?.[TRACK_WIDE];
		return {
			box,
			inset,
			clearance: inset,
			narrowest,
			heading,
			words,
			...(wide === undefined ? {} : { wide: { width: Number(wide) } }),
		};
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
		frames: frames.map((frame, index) => {
			const { box, wide } = framed[index]!;
			return wide === undefined
				? { ...frame, box }
				: { ...frame, box: wide.fitted ?? box, region: box };
		}),
		regions: regions.map((region, index) => {
			const { box } = banded[index]!;
			const caption = { ...region.caption, x: region.caption.x + box.x - region.box.x };
			return { ...region, box, caption };
		}),
	};
}

export { fitSides };

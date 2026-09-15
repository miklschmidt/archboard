// Measured badges use clear runs in the layout owner. A missing fit requests
// an engine reservation before the one complete drawing can be returned.
import type {
	ArchitectureDrawing,
	DrawingEdge,
	MeasuredArchitecture,
} from "@/runtime/semantic-renderer/lib/drawing";
import { DIAGRAM_MARGIN } from "@/runtime/semantic-renderer/lib/design";
import { inflate, type Box } from "@/runtime/semantic-renderer/lib/geometry";
import { curveBounds } from "@/runtime/semantic-renderer/lib/layout/curves";
import { COMPOUND_OPTIONS } from "@/runtime/semantic-renderer/lib/layout/compound-graph";

/** A route piece and its conservative bounds, including rounded corners. */
interface RoutePiece {
	readonly edgeId: string;
	readonly index: number;
	readonly box: Box;
	readonly axis: "x" | "y" | undefined;
}

/** A feasible badge box and the physical length of its unobstructed run. */
interface Candidate {
	readonly box: Box;
	readonly length: number;
	readonly index: number;
}

type Interval = readonly [number, number];

/**
 * How far a label may sit inside an obstacle's clearance before it counts as
 * meeting it. The engine spaces rows so that a label centred on a route has
 * exactly its clearance on each side, then snaps the route to a whole unit,
 * which leaves the label up to half a unit off that centre. Refusing the run
 * for that half unit would reserve the label with the engine instead, and a
 * reservation makes a layer of its own, moving every row and bending the route.
 */
const ROUTE_SNAP = 0.5;

const DIMENSIONS = {
	x: { cross: "y", length: "width", breadth: "height" },
	y: { cross: "x", length: "height", breadth: "width" },
} as const;

/**
 * Bound the actual rounded pieces; only straight pieces can hold a badge.
 * @param edges The authoritative routes.
 * @returns Runs and corner obstacles in drawing coordinates.
 */
function piecesOf(edges: readonly DrawingEdge[]): RoutePiece[] {
	return edges.flatMap(({ edge, curve }) => {
		let from = curve.from;
		return curve.segments.map((segment, index) => {
			const box = curveBounds({ from, segments: [segment] });
			from = segment.to;
			return {
				edgeId: edge.id,
				index,
				box,
				axis:
					segment.kind !== "line"
						? undefined
						: box.height <= 0.01
							? "x"
							: box.width <= 0.01
								? "y"
								: undefined,
			};
		});
	});
}

/**
 * Remove the positions where a badge would enter an obstacle's clearance.
 *
 * A badge is seeded exactly the room it needs beside a corridor, so the last
 * position the run allows and the first the corridor allows can be the same
 * number computed two ways; a blocked span that overshoots the run's end by
 * no more than the route snap still leaves that end position.
 * @param intervals Currently available positions for the badge's leading edge.
 * @param blocked The forbidden positions along the same axis.
 * @returns The remaining disjoint intervals, in coordinate order.
 */
function without(intervals: readonly Interval[], blocked: Interval): Interval[] {
	const [low, high] = blocked;
	return intervals.flatMap(([start, end]): Interval[] => {
		if (high <= start || low >= end) return [[start, end]];
		return [
			...(low + ROUTE_SNAP >= start
				? ([[start, Math.max(start, Math.min(low, end))]] as const)
				: []),
			...(high <= end + ROUTE_SNAP ? ([[Math.min(end, Math.max(high, start)), end]] as const) : []),
		];
	});
}

/**
 * Find the centers of clear spans on one horizontal or vertical straight run.
 * @param piece A piece of this badge's own route.
 * @param label Its measured dimensions.
 * @param obstacles Boxes already enlarged by their required clearance.
 * @param preferred Inherited position translated with its source card.
 * @returns Feasible boxes, scored without preferring either orientation.
 */
function candidatesOf(
	piece: RoutePiece,
	label: Box,
	obstacles: readonly Box[],
	preferred?: Box,
): Candidate[] {
	const axis = piece.axis;
	if (axis === undefined) return [];
	const { cross, length, breadth } = DIMENSIONS[axis];
	const air = Number(COMPOUND_OPTIONS["elk.spacing.labelNode"]);
	const start = piece.box[axis] + air;
	const end = piece.box[axis] + piece.box[length] - label[length] - air;
	if (end < start) return [];
	const across = piece.box[cross] - label[breadth] / 2;
	let intervals: Interval[] = [[start, end]];
	for (const box of obstacles) {
		if (
			across + label[breadth] <= box[cross] + ROUTE_SNAP ||
			across + ROUTE_SNAP >= box[cross] + box[breadth]
		)
			continue;
		intervals = without(intervals, [box[axis] - label[length], box[axis] + box[length]]);
	}
	return intervals.map(([low, high]) => ({
		box: {
			...label,
			[axis]:
				preferred === undefined ? (low + high) / 2 : Math.max(low, Math.min(high, preferred[axis])),
			[cross]: across,
		},
		length: high - low + label[length],
		index: piece.index,
	}));
}

/**
 * Keep badges within the engine's existing page and its quiet outside margin.
 * @param box The current or proposed label box.
 * @param drawing The unchanged engine extent.
 * @returns Whether this box can move without shifting or growing the canvas.
 */
function insidePage(box: Box, drawing: ArchitectureDrawing): boolean {
	return (
		box.x >= DIAGRAM_MARGIN &&
		box.y >= DIAGRAM_MARGIN &&
		box.x + box.width <= drawing.width - DIAGRAM_MARGIN &&
		box.y + box.height <= drawing.height - DIAGRAM_MARGIN
	);
}

/**
 * Protect card bodies and frame ink while leaving each frame's interior usable.
 * @param drawing The engine's cards and measured container headings.
 * @returns Obstacles before the common label-to-node clearance is added.
 */
function nodeObstacles(drawing: ArchitectureDrawing): Box[] {
	return [
		...drawing.cards.map(({ box }) => box),
		...drawing.containers.flatMap(({ box, measured }) => [
			{ ...box, height: measured.headerHeight },
			{ ...box, width: 0 },
			{ ...box, x: box.x + box.width, width: 0 },
			{ ...box, y: box.y + box.height, height: 0 },
		]),
	];
}

/**
 * Translate retained labels with the cards their relationships leave.
 * @param drawing Current solved cards and relationships.
 * @param predecessor Their preceding reading, when this is a comparison.
 * @returns Preferred positions; collision checks still choose the final clear box.
 */
function inheritedLabels(
	drawing: ArchitectureDrawing,
	predecessor?: ArchitectureDrawing,
): Map<string, Box> {
	if (predecessor === undefined) return new Map();
	const previous = new Map(
		predecessor.edges
			.filter((edge) => edge.label !== undefined)
			.map((edge) => [edge.edge.id, edge]),
	);
	const previousNodes = new Map(
		[...predecessor.cards, ...predecessor.containers].map((node) => [
			node.measured.node.id,
			node.box,
		]),
	);
	const nodes = new Map(
		[...drawing.cards, ...drawing.containers].map((node) => [node.measured.node.id, node.box]),
	);
	return new Map(
		drawing.edges.flatMap(({ edge }) => {
			const before = previous.get(edge.id),
				source = nodes.get(edge.from),
				oldSource = previousNodes.get(edge.from);
			if (
				before === undefined ||
				before.edge.from !== edge.from ||
				before.edge.to !== edge.to ||
				source === undefined ||
				oldSource === undefined
			)
				return [];
			return [
				[
					edge.id,
					{
						...before.label!.box,
						x: before.label!.box.x + source.x - oldSource.x,
						y: before.label!.box.y + source.y - oldSource.y,
					},
				],
			];
		}),
	);
}

/**
 * Keep an inherited label near its source, otherwise use the longest clear run.
 *
 * Reserved engine boxes remain a fallback when no clear alternative fits.
 * @param drawing Solved cards and routes, with any reserved label boxes.
 * @param measured Measured labels, including those awaiting their first placement.
 * @param predecessor Previous drawing whose label placement should stay recognizable.
 * @returns The one final drawing, with only eligible label boxes replaced.
 */
function placeLabelsOnRuns(
	drawing: ArchitectureDrawing,
	measured: MeasuredArchitecture["labels"],
	predecessor?: ArchitectureDrawing,
): ArchitectureDrawing {
	const pieces = piecesOf(drawing.edges);
	const preferences = inheritedLabels(drawing, predecessor);
	const labels = new Map(
		drawing.edges.flatMap(({ edge, label }) =>
			label === undefined ? [] : [[edge.id, label.box] as const],
		),
	);
	const nodeAir = Number(COMPOUND_OPTIONS["elk.spacing.labelNode"]);
	const labelAir = Number(COMPOUND_OPTIONS["elk.spacing.labelLabel"]);
	const routeAir = Number(COMPOUND_OPTIONS["elk.spacing.edgeLabel"]);
	const nodes = nodeObstacles(drawing).map((box) => inflate(box, nodeAir));
	for (const edge of drawing.edges.toSorted((one, other) =>
		one.edge.id < other.edge.id ? -1 : one.edge.id > other.edge.id ? 1 : 0,
	)) {
		const label = measured.get(edge.edge.id);
		if (label === undefined) continue;
		const preferred = preferences.get(edge.edge.id);
		const otherLabels = [...labels]
			.filter(([id]) => id !== edge.edge.id)
			.map(([, box]) => inflate(box, labelAir));
		const candidates = pieces
			.filter((piece) => piece.edgeId === edge.edge.id)
			.flatMap((piece) =>
				candidatesOf(
					piece,
					{ x: 0, y: 0, width: label.width, height: label.height },
					[
						...nodes,
						...otherLabels,
						...pieces.filter((other) => other !== piece).map(({ box }) => inflate(box, routeAir)),
					],
					preferred,
				),
			)
			.filter(({ box }) => insidePage(box, drawing));
		const chosen = candidates.toSorted(
			(one, other) =>
				(preferred === undefined
					? 0
					: Math.hypot(one.box.x - preferred.x, one.box.y - preferred.y) -
						Math.hypot(other.box.x - preferred.x, other.box.y - preferred.y)) ||
				other.length - one.length ||
				one.index - other.index,
		)[0];
		if (chosen !== undefined) labels.set(edge.edge.id, chosen.box);
	}
	return {
		...drawing,
		edges: drawing.edges.map((edge) => {
			const box = labels.get(edge.edge.id);
			const label = measured.get(edge.edge.id);
			return box === undefined || label === undefined
				? edge
				: { ...edge, label: { measured: label, box } };
		}),
	};
}

export { placeLabelsOnRuns };

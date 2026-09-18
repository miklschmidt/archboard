// Where a route crosses the frames between its two ends, and the face of each
// frame it crosses by.
//
// A relationship whose ends sit at different containment levels is handed to
// the engine as one section per frame it passes through, joined by a port on
// each frame. Only the face of such a port is the renderer's: the engine
// ignores the index a boundary port carries and seats the crossings of a face
// itself (TASK-258). Which faces a frame may carry at once is the engine's
// too, and narrower than it looks (`crowdedFrames`).

import type { SemanticEdge } from "@/shared/semantic-board/index";
import type { MeasuredArchitecture } from "@/transformers/semantic-renderer/lib/drawing";
import { hasSister, type Seat } from "@/transformers/semantic-renderer/lib/layout/flank-rules";
import {
	crossingFace,
	isFlank,
	type Face,
	type HeaderSide,
} from "@/transformers/semantic-renderer/lib/layout/reading";

/** The two attachment faces chosen before coordinates exist, in the solving frame. */
type PortSides = readonly [Face, Face];

/**
 * Read the inclusion path from a subject to the root of this view.
 * @param id The subject being connected.
 * @param measured The semantic subjects present in this view.
 * @returns The subject followed by its ancestors, nearest first.
 */
function ancestryOf(id: string, measured: MeasuredArchitecture): string[] {
	const parent = measured.nodes.get(id)?.node.parent;
	return parent === undefined || !measured.nodes.has(parent)
		? [id]
		: [id, ...ancestryOf(parent, measured)];
}

/** The frames one route passes out of and into, in the order it meets them. */
interface Boundaries {
	/** The frames the route leaves, innermost first. */
	readonly leaving: readonly string[];
	/** The frames the route enters, outermost first. */
	readonly entering: readonly string[];
}

/**
 * Identify only the frames an edge must leave and enter, in traversal order.
 * @param edge The semantic relationship.
 * @param measured The existing inclusion tree.
 * @returns The frames left, outermost last, and the frames entered, outermost first.
 */
function boundariesOf(edge: SemanticEdge, measured: MeasuredArchitecture): Boundaries {
	const from = ancestryOf(edge.from, measured);
	const to = ancestryOf(edge.to, measured);
	const common = from.find((id) => to.includes(id));
	const leaving = from.slice(1, common === undefined ? undefined : from.indexOf(common));
	const entering = to.slice(1, common === undefined ? undefined : to.indexOf(common));
	return { leaving, entering: entering.toReversed() };
}

/** One frame a route crosses, and the face of that frame it crosses by. */
interface Crossing {
	/** The frame being crossed. */
	readonly frame: string;
	/** The face of it the crossing sits on. */
	readonly side: Face;
}

/**
 * The frames a route crosses and the face it crosses each by, in traversal
 * order: the face the route leaves its source by for every frame it leaves,
 * and the face it reaches its target by for every frame it enters.
 *
 * A relationship with a sister crosses straight on rather than bundling down
 * the frame's flank, since the engine seats the crossings of a flank in an
 * order a reader cannot follow (`crossingFace`). The engine accepts a
 * crossing on any face whatever faces the ends use.
 * @param boundaries Frames left and entered, in traversal order.
 * @param sides The faces this relationship leaves and arrives by.
 * @param header Where a frame's title band sits in the solving frame.
 * @param seat Which of the relationships sharing this pair of endpoints it is.
 * @returns The crossings, in the order the route makes them.
 */
function crossingsOf(
	boundaries: Boundaries,
	sides: PortSides,
	header: HeaderSide,
	seat: Seat,
): Crossing[] {
	const straight = hasSister(seat);
	const exitFace = crossingFace(sides[0], header, straight);
	const entryFace = crossingFace(sides[1], header, straight);
	return [
		...boundaries.leaving.map((frame) => ({ frame, side: exitFace })),
		...boundaries.entering.map((frame) => ({ frame, side: entryFace })),
	];
}

/**
 * The frames whose crossings straight through share one corridor per face.
 *
 * A frame is crossed down a flank unless a relationship with a sister carries
 * straight on through it, and the engine refuses a frame crossed both ways as
 * soon as one face carries two of the straight ones: it expects the dummies in
 * the frame's own first and last layers to be accounted for by the frame's
 * ports on that one side, and a flank port is on neither, so it gives up on
 * the whole board (`UnsupportedConfigurationException: Expected 1 hierarchical
 * ports, but found only 0`, TASK-265). One corridor per face leaves such a
 * frame the one crossing it can carry there.
 *
 * A pair through one corridor cannot be reordered against itself — there is
 * nothing left to order — so it still reads through the frame in the order it
 * leaves by, which bundling it down a flank does not (TASK-258): measured on
 * 2026-09-18, the pair meets on either flank of a frame it leaves.
 * @param crossings Every route's crossings, in the graph's own order.
 * @returns The frames crossed both down a flank and straight through.
 */
function crowdedFrames(crossings: readonly (readonly Crossing[])[]): ReadonlySet<string> {
	const flanked = new Set<string>();
	const straight = new Set<string>();
	for (const route of crossings) {
		for (const { frame, side } of route) (isFlank(side) ? flanked : straight).add(frame);
	}
	return new Set([...flanked].filter((frame) => straight.has(frame)));
}

/**
 * The port id one crossing uses. A crowded frame is crossed straight through
 * once per face, so the routes that share a face there share the corridor.
 * @param edge The semantic relationship that owns the crossing.
 * @param index Its place among that relationship's crossings.
 * @param crossing The frame being crossed and the face of it.
 * @param crowded The frames crossed both down a flank and straight through.
 * @returns The boundary port's id.
 */
function crossingPortId(
	edge: SemanticEdge,
	index: number,
	crossing: Crossing,
	crowded: ReadonlySet<string>,
): string {
	const { frame, side } = crossing;
	return crowded.has(frame) && !isFlank(side)
		? `${frame}:corridor:${side}`
		: `${edge.id}:boundary:${index}`;
}

export {
	ancestryOf,
	boundariesOf,
	crossingPortId,
	crossingsOf,
	crowdedFrames,
	type Boundaries,
	type Crossing,
	type PortSides,
};

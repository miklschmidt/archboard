// Where a route crosses the frames between its two ends, the face of each
// frame it crosses by, and the boundary port it takes there.
//
// A relationship whose ends sit at different containment levels is handed to
// the engine as one section per frame it passes through, joined by a port on
// each frame. Only the face of such a port is the renderer's: the engine
// ignores the index a boundary port carries and seats the crossings of a face
// itself (TASK-258). Which faces a frame may carry at once is the engine's too
// and narrower than it looks, so every route's crossings are settled together
// here rather than one relationship at a time (TASK-265, and section 27 of
// docs/design/layout-rules.md for what is refused).

import type { SemanticEdge } from "@/shared/semantic-board/index";
import type { MeasuredArchitecture } from "@/transformers/semantic-renderer/lib/drawing";
import { hasSister, type Seat } from "@/transformers/semantic-renderer/lib/layout/flank-rules";
import {
	crossingFace,
	isFlank,
	type Face,
	type HeaderSide,
	type PortSides,
} from "@/transformers/semantic-renderer/lib/layout/reading";

/** One relationship as crossing reads it: which frames lie between its ends, and the faces it uses. */
interface Attachment {
	/** The relationship. */
	readonly edge: SemanticEdge;
	/** The faces it leaves and arrives by, or nothing when the engine places both ends itself. */
	readonly faces: PortSides | undefined;
	/** Which of the relationships sharing its pair of endpoints it is. */
	readonly seat: Seat;
}

/** One frame a route crosses: the face of it the crossing takes, and the port there. */
interface Crossing {
	/** The frame being crossed. */
	readonly frame: string;
	/** The face of it the crossing sits on. */
	readonly side: Face;
	/** The boundary port the two adjacent sections share, which sisters may share with it. */
	readonly port: string;
}

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

/** One frame a route crosses, before it is known which port the crossing takes. */
type Placed = Omit<Crossing, "port">;

/**
 * The frames a route crosses and the face it crosses each by, in traversal
 * order: the face the route leaves its source by for every frame it leaves,
 * and the face it reaches its target by for every frame it enters.
 *
 * A relationship with a sister crosses straight on rather than bundling down
 * the frame's flank, since the engine seats the crossings of a flank in an
 * order a reader cannot follow (`crossingFace`). The engine accepts a crossing
 * on any face whatever faces the ends use.
 * @param attachment The relationship, its faces and its seat.
 * @param measured The inclusion tree of this view.
 * @param header Where a frame's title band sits in the solving frame.
 * @returns The crossings, in the order the route makes them.
 */
function placedCrossings(
	attachment: Attachment,
	measured: MeasuredArchitecture,
	header: HeaderSide,
): Placed[] {
	const { edge, faces, seat } = attachment;
	if (faces === undefined) return [];
	const { leaving, entering } = boundariesOf(edge, measured);
	const straight = hasSister(seat);
	const exitFace = crossingFace(faces[0], header, straight);
	const entryFace = crossingFace(faces[1], header, straight);
	return [
		...leaving.map((frame) => ({ frame, side: exitFace })),
		...entering.map((frame) => ({ frame, side: entryFace })),
	];
}

/**
 * The frames whose crossings straight through share one corridor per face.
 *
 * A frame is crossed down a flank unless a relationship with a sister carries
 * straight on through it, and a frame crossed both ways is one the engine can
 * refuse outright: it expects the dummies in the frame's own first and last
 * layers to be accounted for by the frame's ports on that one side, a flank
 * port is on neither, and it gives up on the whole board
 * (`UnsupportedConfigurationException: Expected 1 hierarchical ports, but
 * found only 0`). Which assignments of faces it refuses is a property of the
 * graph rather than of the frame's ports, so the frames named here are every
 * frame crossed both ways and not only the ones measured refused; the price of
 * that is a corridor shared where the engine would have allowed two.
 *
 * One corridor per face is what such a frame can carry. The routes through it
 * are drawn on one line where they approach and leave it, which `shared-runs`
 * fans apart, so a reader still has one line each to follow.
 * @param crossings Every route's crossings, in the graph's own order.
 * @returns The frames crossed both down a flank and straight through.
 */
function crowdedFrames(crossings: readonly (readonly Placed[])[]): ReadonlySet<string> {
	const flanked = new Set<string>();
	const straight = new Set<string>();
	for (const route of crossings) {
		for (const { frame, side } of route) (isFlank(side) ? flanked : straight).add(frame);
	}
	return new Set([...flanked].filter((frame) => straight.has(frame)));
}

/**
 * The port one crossing takes. On a crowded frame the crossings straight
 * through one face share the corridor; every other crossing has its own.
 * @param edge The relationship that owns the crossing.
 * @param index Its place among that relationship's crossings.
 * @param crossing The frame being crossed and the face of it.
 * @param crowded The frames crossed both down a flank and straight through.
 * @returns The boundary port's id.
 */
function portOfCrossing(
	edge: SemanticEdge,
	index: number,
	crossing: Placed,
	crowded: ReadonlySet<string>,
): string {
	const { frame, side } = crossing;
	return crowded.has(frame) && !isFlank(side)
		? `${frame}:corridor:${side}`
		: `${edge.id}:boundary:${index}`;
}

/**
 * Where every route of one view crosses the frames between its ends, and which
 * boundary port each crossing takes. Settled for the whole view at once,
 * because what one frame may carry depends on every route that crosses it.
 * @param attachments Every relationship, its faces and its seat, in the graph's own order.
 * @param measured The inclusion tree of this view.
 * @param header Where a frame's title band sits in the solving frame.
 * @returns Each relationship's crossings in traversal order, by its id.
 */
function frameCrossings(
	attachments: readonly Attachment[],
	measured: MeasuredArchitecture,
	header: HeaderSide,
): Map<string, readonly Crossing[]> {
	const placed = attachments.map((attachment) => placedCrossings(attachment, measured, header));
	const crowded = crowdedFrames(placed);
	return new Map(
		attachments.map(({ edge }, index) => [
			edge.id,
			placed[index]!.map((crossing, place) => ({
				...crossing,
				port: portOfCrossing(edge, place, crossing, crowded),
			})),
		]),
	);
}

export { ancestryOf, frameCrossings, type Attachment, type Crossing };

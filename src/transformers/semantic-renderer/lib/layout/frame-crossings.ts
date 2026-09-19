// Each containment boundary has one distinct port per relationship. The
// engine orders those ports from the inside out; no crossing borrows another
// relationship's port or forces its downstream target onto a frame's flank.

import type { SemanticEdge } from "@/shared/semantic-board/index";
import type { MeasuredArchitecture } from "@/transformers/semantic-renderer/lib/drawing";
import { hasSister, type Seat } from "@/transformers/semantic-renderer/lib/layout/flank-rules";
import {
	crossingFace,
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
	/** The boundary port shared only by this relationship’s two adjacent sections. */
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
 * A crossing keeps its endpoint's direction unless it would cross the title.
 * Paired relationships retain their order when detouring around that band.
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
	const paired = hasSister(seat);
	const exitFace = crossingFace(faces[0], header, paired);
	const entryFace = crossingFace(faces[1], header, paired);
	return [
		...leaving.map((frame) => ({ frame, side: exitFace })),
		...entering.map((frame) => ({ frame, side: entryFace })),
	];
}

/**
 * Where every route of one view crosses the frames between its ends, and which
 * distinct boundary port each crossing takes.
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
	return new Map(
		attachments.map(({ edge }, index) => [
			edge.id,
			placed[index]!.map((crossing, place) => ({
				...crossing,
				port: `${edge.id}:boundary:${place}`,
			})),
		]),
	);
}

export { ancestryOf, frameCrossings, type Attachment, type Crossing };

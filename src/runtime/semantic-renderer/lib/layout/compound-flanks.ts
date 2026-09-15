// A flank route reaches a west face along the target's own row, from a lane
// left of both endpoints. Once every card is seeded, a card in that row between
// the lane and the target is in the way, and the engine draws the line through
// it rather than around it; such a skip is reseated as a plain descent instead.
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { Box, Point } from "@/runtime/semantic-renderer/lib/geometry";
import { COMPOUND_OPTIONS } from "@/runtime/semantic-renderer/lib/layout/compound-graph";
import { portHint } from "@/runtime/semantic-renderer/lib/layout/compound-node-hints";

/** Everything the seeding pass learns about where cards and attachments will be. */
interface Seeded {
	/** Preliminary attachments in global coordinates, by port id. */
	readonly ports: Map<string, Point>;
	/** Attachment faces, by port id. */
	readonly portSides: Map<string, string>;
	/** Each seeded card or frame at its minimum size, in global coordinates. */
	readonly boxes: Map<string, Box>;
	/** Each engine node with its global origin, for reseating its ports. */
	readonly nodes: Map<string, { readonly node: ElkNode; readonly point: Point }>;
	/** Which node owns each port. */
	readonly owners: Map<string, string>;
}

/**
 * An empty record of the seeding pass.
 * @returns Maps to fill as nodes are seeded.
 */
function emptySeeded(): Seeded {
	return {
		ports: new Map(),
		portSides: new Map(),
		boxes: new Map(),
		nodes: new Map(),
		owners: new Map(),
	};
}

/**
 * Whether a box reaches a point, its frame included.
 * @param box The box.
 * @param point The point.
 * @returns True when the point is on or inside the box.
 */
function reaches(box: Box, point: Point): boolean {
	return (
		box.x <= point.x &&
		point.x <= box.x + box.width &&
		box.y <= point.y &&
		point.y <= box.y + box.height
	);
}

/**
 * Whether a box lies across the horizontal approach to an attachment.
 * @param box A seeded card.
 * @param to The attachment being approached, on a west face.
 * @param lane The horizontal coordinate the approach sets out from.
 * @returns True when the approach would run through the box.
 */
function acrossApproach(box: Box, to: Point, lane: number): boolean {
	return box.y < to.y && to.y < box.y + box.height && box.x < to.x && box.x + box.width > lane;
}

/**
 * Whether a west-face approach would run through a card that is neither
 * endpoint nor a frame around one.
 * @param edge The engine edge, both ends on west faces.
 * @param seeded Where everything will be.
 * @returns True when a seeded card lies across the approach.
 */
function westApproachBlocked(edge: ElkExtendedEdge, seeded: Seeded): boolean {
	const from = seeded.ports.get(edge.sources[0]!),
		to = seeded.ports.get(edge.targets[0]!);
	if (from === undefined || to === undefined) return false;
	const lane = Math.min(from.x, to.x) - Number(COMPOUND_OPTIONS["elk.spacing.edgeNode"]);
	return [...seeded.boxes.values()].some(
		(box) => !reaches(box, from) && !reaches(box, to) && acrossApproach(box, to, lane),
	);
}

/**
 * Put one attachment on another face and redistribute that node's attachments
 * on the faces it left and joined.
 * @param portId The attachment to move.
 * @param side Its new face.
 * @param seeded Where everything will be.
 */
function reseatPort(portId: string, side: "SOUTH" | "NORTH", seeded: Seeded): void {
	const owner = seeded.nodes.get(seeded.owners.get(portId)!)!;
	const port = owner.node.ports!.find((candidate) => candidate.id === portId)!;
	const left = port.layoutOptions!["elk.port.side"];
	port.layoutOptions = { ...port.layoutOptions, "elk.port.side": side };
	for (const sibling of owner.node.ports!) {
		const face = sibling.layoutOptions!["elk.port.side"];
		if (face === undefined || (face !== left && face !== side)) continue;
		const hint = portHint(owner.node, sibling, owner.point);
		seeded.ports.set(sibling.id, hint);
		seeded.portSides.set(sibling.id, face);
		sibling.x = hint.x - owner.point.x;
		sibling.y = hint.y - owner.point.y;
	}
}

/**
 * Turn a flank skip whose approach is blocked into a plain descent: out of the
 * source's bottom face and into the target's top, which the engine routes
 * between rows rather than along one.
 * @param graph The seeded hierarchy.
 * @param seeded Where everything will be.
 */
function reseatBlockedFlanks(graph: ElkNode, seeded: Seeded): void {
	for (const edge of graph.edges!) {
		if (
			seeded.portSides.get(edge.sources[0]!) !== "WEST" ||
			seeded.portSides.get(edge.targets[0]!) !== "WEST" ||
			!westApproachBlocked(edge, seeded)
		)
			continue;
		reseatPort(edge.sources[0]!, "SOUTH", seeded);
		reseatPort(edge.targets[0]!, "NORTH", seeded);
	}
}

export { emptySeeded, reseatBlockedFlanks, type Seeded };

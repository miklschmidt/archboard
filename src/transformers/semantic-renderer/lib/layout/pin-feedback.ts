import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { AlignedPin } from "@/transformers/semantic-renderer/lib/layout/avoid-pins";
import { boxOf, type Face } from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { ROUTE_NUDGE_DISTANCE } from "@/transformers/semantic-renderer/config";

type PinProjection = { pin: AlignedPin; corridor: Box };

/**
 * Read one endpoint's actual attachment from a complete native route.
 * @param node Endpoint card.
 * @param points Route ordered away from that endpoint.
 * @returns Its face and proportional position.
 */
function usedPin(node: ElkNode, points: readonly Point[]): AlignedPin {
	const at = points[0]!;
	const next = points[1]!;
	const vertical = Math.abs(at.x - next.x) < Math.abs(at.y - next.y);
	const face: Face = vertical
		? next.y > at.y
			? "SOUTH"
			: "NORTH"
		: next.x > at.x
			? "EAST"
			: "WEST";
	const box = boxOf(node);
	return { face, position: vertical ? (at.x - box.x) / box.width : (at.y - box.y) / box.height };
}

/**
 * Preserve every ordinary-card attachment, including multiple edges in one shared channel.
 * Self-loop pins and frame attachments retain their existing specialized policies.
 * @param nodes Placed semantic nodes.
 * @param edge One complete native relationship.
 * @returns Actual card pins paired with their endpoint identity.
 */
export function usedCardPins(
	nodes: ReadonlyMap<string, ElkNode>,
	edge: ElkExtendedEdge,
): [string, AlignedPin][] {
	const section = edge.sections?.[0];
	if (!section || edge.sources[0] === edge.targets[0]) return [];
	const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
	const ends = [
		[edge.sources[0]!, points],
		[edge.targets[0]!, points.toReversed()],
	] as const;
	return ends.flatMap(([id, route]) => {
		const node = nodes.get(id)!;
		return node.children?.length ? [] : [[id, usedPin(node, route)] as [string, AlignedPin]];
	});
}

/**
 * Find the corridor from an outside run to the near card boundary.
 * @param low Card's first boundary.
 * @param high Card's second boundary.
 * @param one Run start.
 * @param two Run end.
 * @returns Corridor and approach direction, or nothing for an overlapping run.
 */
function outsideInterval(
	low: number,
	high: number,
	one: number,
	two: number,
): readonly [number, number, boolean] | undefined {
	const start = Math.min(one, two);
	const end = Math.max(one, two);
	if (end < low) return [start, low, true];
	if (start > high) return [high, end, false];
	return undefined;
}

/**
 * Resolve the face reached by an outside run.
 * @param vertical Run orientation.
 * @param before Whether the run precedes the card on its axis.
 * @returns Near card face.
 */
function projectionFace(vertical: boolean, before: boolean): Face {
	if (vertical) return before ? "NORTH" : "SOUTH";
	return before ? "WEST" : "EAST";
}

/**
 * Project an external straight run onto the near face of a card.
 * @param box Card bounds.
 * @param one First point of the native run.
 * @param two Second point of the native run.
 * @param vertical Whether the run travels along the y axis.
 * @returns A pin and its complete approach corridor when the run faces this card.
 */
function projection(
	box: Box,
	one: Point,
	two: Point,
	vertical: boolean,
): PinProjection | undefined {
	const axes = vertical
		? (["x", "y", "width", "height"] as const)
		: (["y", "x", "height", "width"] as const);
	const [axis, cross, extent, crossExtent] = axes;
	const coordinate = one[axis];
	if (
		coordinate < box[axis] + ROUTE_NUDGE_DISTANCE ||
		coordinate > box[axis] + box[extent] - ROUTE_NUDGE_DISTANCE
	)
		return undefined;
	const interval = outsideInterval(
		box[cross],
		box[cross] + box[crossExtent],
		one[cross],
		two[cross],
	);
	if (interval === undefined) return undefined;
	const [start, end, before] = interval;
	return {
		pin: {
			face: projectionFace(vertical, before),
			position: (coordinate - box[axis]) / box[extent],
		},
		corridor: vertical
			? { x: coordinate, y: start, width: 0, height: end - start }
			: { x: start, y: coordinate, width: end - start, height: 0 },
	};
}

/**
 * Offer continuations of the router's own straight runs, without inventing a path.
 * @param node Ordinary endpoint card.
 * @param edge Complete native relationship.
 * @returns Candidate attachment corridors for the existing collision policy to validate.
 */
export function projectedCardPins(node: ElkNode, edge: ElkExtendedEdge): PinProjection[] {
	const section = edge.sections?.[0];
	if (!section) return [];
	const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
	return points.slice(1).flatMap((point, index) => {
		const previous = points[index]!;
		const candidate = projection(
			boxOf(node),
			previous,
			point,
			Math.abs(previous.x - point.x) < 0.001,
		);
		return candidate ? [candidate] : [];
	});
}

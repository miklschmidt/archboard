// New branches leave measured badge room alongside retained route corridors.
import type { ElkExtendedEdge } from "elkjs/lib/elk-api";
import type { DrawingEdge } from "@/runtime/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/runtime/semantic-renderer/lib/geometry";
import { BEND_RADIUS_MAX } from "@/runtime/semantic-renderer/lib/design";
import { COMPOUND_OPTIONS } from "@/runtime/semantic-renderer/lib/layout/compound-graph";

/** Current badge measurements and predecessor routes share global coordinates. */
interface NodeHintRoutes {
	readonly current: readonly ElkExtendedEdge[];
	readonly previous: readonly DrawingEdge[];
}

/** A current attachment and whether its branch may move to make room. */
interface HintAttachment {
	readonly point: Point;
	readonly moving: boolean;
	readonly vertical: boolean;
}

/** A badge on the connection from an existing card to a movable branch. */
interface BadgeConnection {
	readonly moving: Point;
	readonly fixed: Point;
	readonly width: number;
}

/**
 * Read only straight vertical portions of the inherited routes.
 * @param edges Previous drawing relationships in global coordinates.
 * @returns Occupied vertical corridor intervals.
 */
function verticalGuides(edges: readonly DrawingEdge[]): Box[] {
	return edges.flatMap(({ curve }) => {
		let from = curve.from;
		return curve.segments.flatMap((segment) => {
			const start = from;
			from = segment.to;
			if (segment.kind !== "line" || start.x !== from.x || start.y === from.y) return [];
			return [
				{ x: start.x, y: Math.min(start.y, from.y), width: 0, height: Math.abs(start.y - from.y) },
			];
		});
	});
}

/**
 * Select a labeled vertical attachment joining a new and an existing sibling.
 * @param edge One measured relationship with at least one badge.
 * @param attachments Current global positions for this containment level.
 * @returns Its movable and fixed attachments, when both belong to this level.
 */
function badgeConnection(
	edge: ElkExtendedEdge,
	attachments: ReadonlyMap<string, HintAttachment>,
): BadgeConnection | undefined {
	const source = attachments.get(edge.sources[0]!),
		target = attachments.get(edge.targets[0]!);
	if (source === undefined || target === undefined) return undefined;
	if (source.moving === target.moving) return undefined;
	const [moving, fixed] = source.moving ? [source, target] : [target, source];
	if (!moving.vertical) return undefined;
	return {
		moving: moving.point,
		fixed: fixed.point,
		width: Math.max(...edge.labels!.map((label) => label.width!)),
	};
}

/**
 * Check whether a vertical corridor separates the stable endpoint from this branch.
 * @param guide An inherited straight vertical route portion.
 * @param connection Current endpoints and measured badge width.
 * @returns Whether this corridor crosses the connection's seeded vertical span.
 */
function crossesSpan(guide: Box, connection: BadgeConnection): boolean {
	return (
		guide.x > connection.fixed.x &&
		guide.y <= Math.max(connection.fixed.y, connection.moving.y) &&
		guide.y + guide.height >= Math.min(connection.fixed.y, connection.moving.y)
	);
}

/**
 * Reserve translations that leave a horizontal badge squeezed against a corridor.
 * @param routes Current measured relationships and prior solved routes.
 * @param attachments Global attachment hints for this new component and old siblings.
 * @returns Open forbidden translation intervals, shared with card collision packing.
 */
function badgeShiftIntervals(
	routes: NodeHintRoutes,
	attachments: ReadonlyMap<string, HintAttachment>,
): [number, number][] {
	const guides = verticalGuides(routes.previous);
	const clearance =
		Number(COMPOUND_OPTIONS["elk.spacing.edgeLabel"]) +
		Number(COMPOUND_OPTIONS["elk.spacing.labelNode"]) +
		BEND_RADIUS_MAX;
	return routes.current
		.filter((edge) => (edge.labels?.length ?? 0) > 0)
		.flatMap((edge) => {
			const connection = badgeConnection(edge, attachments);
			if (connection === undefined) return [];
			return guides
				.filter((guide) => crossesSpan(guide, connection))
				.map((guide) => [
					guide.x - connection.moving.x,
					guide.x + connection.width + clearance - connection.moving.x,
				]);
		});
}

export { badgeShiftIntervals, type HintAttachment, type NodeHintRoutes };

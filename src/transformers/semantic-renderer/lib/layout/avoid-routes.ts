import type { ElkExtendedEdge } from "@archboard/elk-rs";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import { simplify } from "@/transformers/semantic-renderer/lib/layout/curves";

export type Connection = InstanceType<AvoidEngine["ConnRef"]>;

/** A native scene could not find an obstacle-free route; alternative scenes may still work. */
class NativeRouteUnavailable extends Error {}

/**
 * Copy a valid obstacle-free native polyline.
 * @param connection The router-owned connector.
 * @param id Relationship identity for diagnostics.
 * @returns Geometry independent of native lifetime.
 */
function pointsOf(connection: Connection, id: string): Point[] {
	if (!connection.hasValidRoute() || connection.hasCrossingObstacles())
		throw new NativeRouteUnavailable(
			`Layout could not route relationship ${id} clear of obstacles`,
		);
	const line = connection.displayRoute();
	const points: Point[] = [];
	for (let index = 0; index < line.size(); index++) {
		const point = line.at(index);
		points.push({ x: point.x, y: point.y });
	}
	return points;
}

/**
 * Whether one point and its incoming segment are finite and orthogonal.
 * @param point Current point.
 * @param index Its route index.
 * @param points Complete route.
 * @returns Whether this segment is invalid.
 */
function invalidPoint(point: Point, index: number, points: readonly Point[]): boolean {
	if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return true;
	const previous = points[index - 1];
	return (
		previous !== undefined &&
		Math.abs(point.x - previous.x) > 0.001 &&
		Math.abs(point.y - previous.y) > 0.001
	);
}

/**
 * Copy one complete valid route without publishing a partial native scene.
 * @param edge The semantic relationship.
 * @param connections Its native route segments.
 * @returns Independent complete sections ready for atomic publication.
 */
function sectionsOf(
	edge: ElkExtendedEdge,
	connections: readonly Connection[],
): NonNullable<ElkExtendedEdge["sections"]> {
	const points = simplify(connections.flatMap((connection) => pointsOf(connection, edge.id)));
	if (points.length < 2 || points.some(invalidPoint))
		throw new Error(`Layout returned an invalid orthogonal route for relationship ${edge.id}`);
	return [
		{
			id: `${edge.id}:route`,
			startPoint: points[0]!,
			bendPoints: points.slice(1, -1),
			endPoint: points.at(-1)!,
		},
	];
}

/**
 * Publish every native path together, retaining the last complete scene if an alternative fails.
 * Label settlement and final bend validation still inspect the retained routes.
 * @param edges Relationships receiving their complete sections.
 * @param routes Native connections belonging to the current scene.
 * @param keepPrevious Whether a complete earlier scene is available.
 * @returns Whether the new scene was published, rather than retaining the prior one.
 */
export function publishRoutes(
	edges: readonly ElkExtendedEdge[],
	routes: ReadonlyMap<string, readonly Connection[]>,
	keepPrevious: boolean,
): boolean {
	try {
		const sections = edges.map((edge) => sectionsOf(edge, routes.get(edge.id)!));
		edges.forEach((edge, index) => (edge.sections = sections[index]!));
		return true;
	} catch (error) {
		if (keepPrevious && error instanceof NativeRouteUnavailable) return false;
		throw error;
	}
}

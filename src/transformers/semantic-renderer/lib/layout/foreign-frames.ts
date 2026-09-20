import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { boxOf } from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import {
	nativeRoutePoints,
	publishRoutes,
	setRouteCheckpoints,
	type Connection,
} from "@/transformers/semantic-renderer/lib/layout/avoid-routes";
import type { RoutingScene } from "@/transformers/semantic-renderer/lib/layout/avoid-routing";
import { EndpointOptions } from "@/transformers/semantic-renderer/lib/layout/endpoint-options";

interface ScopedRoute {
	readonly sections: NonNullable<ElkExtendedEdge["sections"]>;
	readonly checkpoints: readonly (readonly Point[])[];
}

/** A frame body is closed only to relationships whose endpoints are outside it. */
export class ForeignFrames {
	private readonly frames: ElkNode[] = [];
	private readonly ancestors = new Map<string, readonly string[]>();

	/**
	 * Collect frames and their descendants from placed geometry.
	 * @param graph The globally placed graph.
	 */
	constructor(graph: ElkNode) {
		for (const node of graph.children ?? []) this.visit(node, []);
	}

	/**
	 * Record this node's frame ancestry.
	 * @param node A node in the placed hierarchy.
	 * @param parents Ancestor frame IDs.
	 */
	private visit(node: ElkNode, parents: readonly string[]): void {
		const children = node.children ?? [];
		const frame = children.length > 0;
		const ancestry = frame ? [...parents, node.id] : parents;
		this.ancestors.set(node.id, ancestry);
		if (frame) this.frames.push(node);
		for (const child of children) this.visit(child, ancestry);
	}

	/**
	 * Find frame bodies that contain neither endpoint of a relationship.
	 * @param edge A semantic relationship.
	 * @returns Frames closed to this relationship.
	 */
	closedFor(edge: ElkExtendedEdge): readonly ElkNode[] {
		const from = this.ancestors.get(edge.sources[0]!) ?? [];
		const to = this.ancestors.get(edge.targets[0]!) ?? [];
		return this.frames.filter((frame) => !from.includes(frame.id) && !to.includes(frame.id));
	}

	/**
	 * Detect traversal through a frame containing neither semantic endpoint.
	 * @param edge A routed semantic relationship.
	 * @returns Whether the route enters an unrelated frame body.
	 */
	crosses(edge: ElkExtendedEdge): boolean {
		const section = edge.sections?.[0];
		if (section === undefined) return false;
		const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
		return this.closedFor(edge).some((frame) => routeCrosses(points, boxOf(frame)));
	}

	/**
	 * Constrain offending shared routes with scoped detours, then validate all routes.
	 * @param avoid The native routing module.
	 * @param graph Complete globally placed geometry.
	 * @param edges All semantic relationships.
	 * @param shared The shared obstacle and lane scene.
	 * @param routes Connectors in that shared scene.
	 * @param createScene Builds a scoped scene with unrelated frames closed.
	 */
	private reroute(
		avoid: AvoidEngine,
		graph: ElkNode,
		edges: readonly ElkExtendedEdge[],
		shared: RoutingScene,
		routes: ReadonlyMap<string, readonly Connection[]>,
		createScene: (closed: ReadonlySet<string>) => RoutingScene,
	): void {
		const detours = this.detours(graph, edges, createScene);
		if (detours.size > 0) {
			for (const [id, detour] of detours)
				routes
					.get(id)!
					.forEach((connection, index) =>
						setRouteCheckpoints(avoid, connection, detour.checkpoints[index] ?? []),
					);
			shared.router.processTransaction();
			publishRoutes(edges, routes, true);
		}
		for (const edge of edges) {
			if (!this.crosses(edge)) continue;
			edge.sections = (
				detours.get(edge.id) ?? this.around(graph, edge, edges, createScene)
			).sections;
		}
	}

	/**
	 * Recheck faces after the shared scene has been constrained by foreign frames.
	 * @param avoid The native routing module.
	 * @param graph Complete globally placed geometry.
	 * @param edges All semantic relationships.
	 * @param endpoints Available endpoint faces.
	 * @param shared The shared obstacle and lane scene.
	 * @param routes Connectors in that shared scene.
	 * @param createScene Builds a scoped scene with unrelated frames closed.
	 * @returns Whether the caller should retry with different endpoint faces.
	 */
	settle(
		avoid: AvoidEngine,
		graph: ElkNode,
		edges: readonly ElkExtendedEdge[],
		endpoints: EndpointOptions,
		shared: RoutingScene,
		routes: ReadonlyMap<string, readonly Connection[]>,
		createScene: (closed: ReadonlySet<string>) => RoutingScene,
	): boolean {
		if (endpoints.reject(edges, shared.nodes)) return true;
		this.reroute(avoid, graph, edges, shared, routes, createScene);
		return endpoints.reject(edges, shared.nodes);
	}

	/**
	 * Find only shared routes that actually enter an unrelated frame.
	 * @param graph Complete globally placed geometry.
	 * @param edges All semantic relationships.
	 * @param createScene Builds a scoped native obstacle scene.
	 * @returns Valid detours keyed by relationship ID.
	 */
	private detours(
		graph: ElkNode,
		edges: readonly ElkExtendedEdge[],
		createScene: (closed: ReadonlySet<string>) => RoutingScene,
	): Map<string, ScopedRoute> {
		const found = new Map<string, ScopedRoute>();
		for (const edge of edges) {
			if (this.crosses(edge)) found.set(edge.id, this.around(graph, edge, edges, createScene));
		}
		return found;
	}

	/**
	 * Solve one relationship with only its own ancestry left open.
	 * @param graph Complete globally placed geometry.
	 * @param edge The offending relationship.
	 * @param edges All relationships, for shared channel placement.
	 * @param createScene Builds a scoped native obstacle scene.
	 * @returns A valid detour and its native bend checkpoints.
	 */
	private around(
		graph: ElkNode,
		edge: ElkExtendedEdge,
		edges: readonly ElkExtendedEdge[],
		createScene: (closed: ReadonlySet<string>) => RoutingScene,
	): ScopedRoute {
		const closed = new Set(this.closedFor(edge).map((frame) => frame.id));
		const scene = createScene(closed);
		try {
			graph.children?.forEach((node) => scene.visit(node));
			scene.ports(edges);
			scene.labels(edges, edge.id);
			const candidate = { ...edge };
			const connections = scene.relationship(candidate);
			scene.router.processTransaction();
			publishRoutes([candidate], new Map([[edge.id, connections]]), false);
			if (this.crosses(candidate))
				throw new Error(`Layout routed relationship ${edge.id} through an unrelated frame`);
			return {
				sections: candidate.sections!,
				checkpoints: connections.map((connection) =>
					nativeRoutePoints(connection, edge.id).slice(1, -1),
				),
			};
		} finally {
			scene.router.delete();
		}
	}
}

/**
 * Test strict interior overlap; touching a frame outline is not traversal.
 * @param points The orthogonal route polyline.
 * @param box The frame body.
 * @returns Whether any segment enters the frame interior.
 */
function routeCrosses(points: readonly Point[], box: Box): boolean {
	const inset = 0.01;
	const left = box.x + inset;
	const right = box.x + box.width - inset;
	const top = box.y + inset;
	const bottom = box.y + box.height - inset;
	return points.some((point, index) => {
		const next = points[index + 1];
		return (
			next !== undefined &&
			Math.min(point.x, next.x) < right &&
			Math.max(point.x, next.x) > left &&
			Math.min(point.y, next.y) < bottom &&
			Math.max(point.y, next.y) > top
		);
	});
}

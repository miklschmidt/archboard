import type { ElkNode } from "@archboard/elk-rs";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { RoutingScene } from "@/transformers/semantic-renderer/lib/layout/avoid-routing";
import { EndpointOptions } from "@/transformers/semantic-renderer/lib/layout/endpoint-options";
import { ForeignFrames } from "@/transformers/semantic-renderer/lib/layout/foreign-frames";
import type { AlignedPins } from "@/transformers/semantic-renderer/lib/layout/avoid-pins";
import {
	isNativeRouteUnavailable,
	positionReservedLabel,
	publishRoutes,
} from "@/transformers/semantic-renderer/lib/layout/avoid-routes";

/**
 * Register the complete hierarchy in one native scene.
 * @param scene Native obstacle owner.
 * @param graph Placed semantic graph.
 */
function visitNodes(scene: RoutingScene, graph: ElkNode): void {
	graph.children?.forEach((node) => scene.visit(node));
}

/**
 * Settle routes and endpoint faces for one set of native physical pin alternatives.
 * @param avoid Initialized native router.
 * @param graph Complete globally placed geometry.
 * @param endpoints Available shared faces.
 * @param pins Optional feedback candidates.
 * @returns New useful physical alternatives after the scene has settled.
 */
function settle(
	avoid: AvoidEngine,
	graph: ElkNode,
	endpoints: EndpointOptions,
	pins?: AlignedPins,
): AlignedPins | undefined {
	const frames = new ForeignFrames(graph);
	const edges = graph.edges ?? [];
	let routed = false;
	for (;;) {
		const scene = new RoutingScene(avoid, endpoints);
		try {
			edges.forEach(positionReservedLabel);
			visitNodes(scene, graph);
			scene.ports(edges, pins);
			scene.labels(edges);
			const routes = new Map(edges.map((edge) => [edge.id, scene.relationship(edge)]));
			scene.router.processTransaction();
			if (!publishRoutes(edges, routes, routed)) return undefined;
			routed = true;
			if (
				frames.settle(
					avoid,
					graph,
					edges,
					endpoints,
					scene,
					routes,
					(closed) => new RoutingScene(avoid, endpoints, closed),
				)
			)
				continue;
			return pins === undefined ? scene.refinePorts(edges) : undefined;
		} finally {
			scene.router.delete();
		}
	}
}

/**
 * Route once, then offer one optional native refinement informed by the settled paths.
 * Failed optional routes retain the complete baseline; unrelated failures still propagate.
 * @param avoid Initialized native router.
 * @param graph Complete globally placed semantic geometry.
 * @returns The hierarchy with finite orthogonal relationship routes.
 */
export function routeGraph(avoid: AvoidEngine, graph: ElkNode): ElkNode {
	const endpoints = new EndpointOptions();
	const pins = settle(avoid, graph, endpoints);
	if (pins === undefined) return graph;
	const candidate = structuredClone(graph);
	try {
		settle(avoid, candidate, endpoints, pins);
		return candidate;
	} catch (error) {
		if (!isNativeRouteUnavailable(error)) throw error;
	}
	return graph;
}

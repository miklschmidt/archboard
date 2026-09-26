import type { ElkNode } from "@archboard/elk-rs";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { RoutingScene } from "@/transformers/semantic-renderer/lib/layout/avoid-routing";
import { EndpointOptions } from "@/transformers/semantic-renderer/lib/layout/endpoint-options";
import { EVEN_PINS } from "@/transformers/semantic-renderer/lib/layout/even-pins";
import { CORNER_PINS } from "@/transformers/semantic-renderer/lib/layout/pin-feedback";
import { ForeignFrames } from "@/transformers/semantic-renderer/lib/layout/foreign-frames";
import { wallReach } from "@/transformers/semantic-renderer/lib/layout/frame-walls";
import { joinSqueezedTrunks } from "@/transformers/semantic-renderer/lib/layout/squeezed-trunks";
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
 * Whether a graph's routes are asked for evened pins (even-pins.ts).
 * @param graph The placed graph.
 * @returns True when every pin of a shape should cost the same.
 */
function evenPins(graph: ElkNode): boolean {
	return graph.layoutOptions?.[EVEN_PINS] === "true";
}

/**
 * Whether a graph's routes are offered corner pins (pin-feedback.ts).
 * @param graph The placed graph.
 * @returns True when a route that hooks past a card's corner may enter the face it passed.
 */
function cornerPins(graph: ElkNode): boolean {
	return graph.layoutOptions?.[CORNER_PINS] === "true";
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
	const even = evenPins(graph);
	const reach = wallReach(graph);
	let routed = false;
	for (;;) {
		const scene = new RoutingScene(avoid, endpoints, new Set(), even, reach);
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
					(closed) => new RoutingScene(avoid, endpoints, closed, even, reach),
				)
			)
				continue;
			return pins === undefined ? scene.refinePorts(edges, cornerPins(graph)) : undefined;
		} finally {
			scene.router.delete();
		}
	}
}

/**
 * Route a placed graph, with lines that share a pin joined where the router
 * squeezed them apart.
 * @param avoid Initialized native router.
 * @param graph Complete globally placed semantic geometry.
 * @returns The hierarchy with finite orthogonal relationship routes.
 */
export function routeGraph(avoid: AvoidEngine, graph: ElkNode): ElkNode {
	const routed = refinedRoutes(avoid, graph);
	joinSqueezedTrunks(routed.edges ?? []);
	return routed;
}

/**
 * Route once, then offer one optional native refinement informed by the settled paths.
 * Failed optional routes retain the complete baseline; unrelated failures still propagate.
 * @param avoid Initialized native router.
 * @param graph Complete globally placed semantic geometry.
 * @returns The hierarchy with finite orthogonal relationship routes.
 */
function refinedRoutes(avoid: AvoidEngine, graph: ElkNode): ElkNode {
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

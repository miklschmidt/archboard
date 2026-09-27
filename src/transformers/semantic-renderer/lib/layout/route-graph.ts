import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { RoutingScene } from "@/transformers/semantic-renderer/lib/layout/avoid-routing";
import { EndpointOptions } from "@/transformers/semantic-renderer/lib/layout/endpoint-options";
import { ForeignFrames } from "@/transformers/semantic-renderer/lib/layout/foreign-frames";
import { wallReach } from "@/transformers/semantic-renderer/lib/layout/frame-walls";
import { centreLabels } from "@/transformers/semantic-renderer/lib/layout/label-centring";
import { requestOf } from "@/transformers/semantic-renderer/lib/layout/route-requests";
import { joinSqueezedTrunks } from "@/transformers/semantic-renderer/lib/layout/squeezed-trunks";
import type { PinFeedback } from "@/transformers/semantic-renderer/lib/layout/lone-pins";
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
 * @param feedback Optional feedback candidates; held channels mark the last solve.
 * @returns New useful physical alternatives after the scene has settled.
 */
function settle(
	avoid: AvoidEngine,
	graph: ElkNode,
	endpoints: EndpointOptions,
	feedback?: PinFeedback,
): PinFeedback | undefined {
	const frames = new ForeignFrames(graph);
	const edges = graph.edges ?? [];
	const requested = requestOf(graph);
	const request = { ...requested, reach: wallReach(graph, requested.clearWalls) };
	let routed = false;
	for (;;) {
		const scene = new RoutingScene(avoid, endpoints, new Set(), request);
		try {
			edges.forEach(positionReservedLabel);
			visitNodes(scene, graph);
			scene.ports(edges, feedback?.pins);
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
					(closed) => new RoutingScene(avoid, endpoints, closed, request),
				)
			)
				continue;
			return nextFeedback(scene, edges, feedback);
		} finally {
			scene.router.delete();
		}
	}
}

/**
 * What a settled scene offers the next solve: a refinement after the first
 * solve, lone ports centred after the refinement, nothing after that.
 * @param scene The settled scene.
 * @param edges Its routed relationships.
 * @param feedback What this solve was offered.
 * @returns The next solve's feedback, or nothing when the routes are final.
 */
function nextFeedback(
	scene: RoutingScene,
	edges: readonly ElkExtendedEdge[],
	feedback: PinFeedback | undefined,
): PinFeedback | undefined {
	if (feedback === undefined) {
		const pins = scene.refinePorts(edges);
		return pins === undefined ? undefined : { pins };
	}
	return feedback.held === undefined ? scene.centrePorts(edges) : undefined;
}

/**
 * Route a placed graph, with lines that share a pin joined where the router
 * squeezed them apart.
 * @param avoid Initialized native router.
 * @param graph Complete globally placed semantic geometry.
 * @returns The hierarchy with finite orthogonal relationship routes.
 */
export function routeGraph(avoid: AvoidEngine, graph: ElkNode): ElkNode {
	const { centredLabels, centredLines } = requestOf(graph);
	if (centredLabels) centreLabels(graph);
	else if (centredLines.length > 0) centreLabels(graph, new Set(centredLines));
	const routed = refinedRoutes(avoid, graph);
	joinSqueezedTrunks(routed.edges ?? []);
	return routed;
}

/**
 * Route once, then offer one optional native refinement informed by the
 * settled paths, and, when that leaves a lone port to centre, one last solve
 * with the centred channels held to their faces (lone-pins.ts). Failed optional routes
 * retain the last complete routing; unrelated failures still propagate.
 * @param avoid Initialized native router.
 * @param graph Complete globally placed semantic geometry.
 * @returns The hierarchy with finite orthogonal relationship routes.
 */
function refinedRoutes(avoid: AvoidEngine, graph: ElkNode): ElkNode {
	const endpoints = new EndpointOptions();
	endpoints.refuse(graph.edges ?? [], requestOf(graph).refusedEnds);
	let routed = graph;
	let feedback = settle(avoid, graph, endpoints);
	while (feedback !== undefined) {
		if (feedback.held !== undefined) endpoints.hold(feedback.pins, feedback.held);
		const candidate = structuredClone(routed);
		try {
			feedback = settle(avoid, candidate, endpoints, feedback);
			routed = candidate;
		} catch (error) {
			if (!isNativeRouteUnavailable(error)) throw error;
			break;
		}
	}
	return routed;
}

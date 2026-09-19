import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { BEND_RADIUS } from "@/transformers/semantic-renderer/config";
import { relationshipKind } from "@/transformers/semantic-renderer/lib/layout/avoid-pins";
import {
	FACES,
	boxOf,
	contains,
	type Face,
} from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";

/**
 * Identify the physical face from its outward endpoint run.
 * @param tip Visible card attachment.
 * @param beside Next point outside the card.
 * @returns The cardinal face the router chose.
 */
function faceOf(tip: Point, beside: Point): Face {
	return Math.abs(tip.x - beside.x) > Math.abs(tip.y - beside.y)
		? beside.x > tip.x
			? "EAST"
			: "WEST"
		: beside.y > tip.y
			? "SOUTH"
			: "NORTH";
}

/**
 * Whether the approach changes lanes without enough room for its adjoining bends.
 * @param points A route ordered from the endpoint outwards.
 * @returns Whether either of the first two internal runs cannot fit two bends.
 */
function cramped(points: readonly Point[]): boolean {
	const corners = points.slice(1, -1).slice(0, 3);
	return corners
		.slice(1)
		.some(
			(point, index) =>
				Math.hypot(point.x - corners[index]!.x, point.y - corners[index]!.y) <
				2 * BEND_RADIUS - 0.01,
		);
}

/**
 * Frames keep their internal title divider and source attachment; external arrivals can change faces.
 * @param node Semantic endpoint.
 * @param toward Source subject for an arrival, absent for a departure.
 * @returns Whether native face alternatives preserve the endpoint's meaning.
 */
function allowsAlternatives(node: ElkNode, toward: ElkNode | undefined): boolean {
	return !node.children?.length || (toward !== undefined && !contains(boxOf(node), boxOf(toward)));
}

/** Native alternatives for endpoint approaches; each rejected shared face stays rejected. */
export class EndpointOptions {
	private readonly removed = new Map<string, Set<Face>>();

	/**
	 * Keep a shared face unless its approach has proved too cramped to round.
	 * @param id Card identity.
	 * @param kind Shared relationship kind.
	 * @param face Candidate face.
	 * @returns Whether to offer this face to the native router.
	 */
	allows(id: string, kind: string, face: Face): boolean {
		return !this.removed.get(`${id}:${kind}`)?.has(face);
	}

	/**
	 * Remove unusable endpoint faces before routing again. Every retry removes a
	 * face, and one alternative always remains, so this search is finite.
	 * @param edges Complete native routes from the current scene.
	 * @param nodes Placed semantic nodes, distinguishing cards from frames.
	 * @returns Whether another native solve has a new set of endpoint alternatives.
	 */
	reject(edges: readonly ElkExtendedEdge[], nodes: ReadonlyMap<string, ElkNode>): boolean {
		// Recompute all paths after one shared class changes; later routes in this
		// scene still reflect the old choices and must not reject another face.
		return edges.some((edge) => this.rejectEdge(edge, nodes));
	}

	/**
	 * Check both ends, preferring to repair arrival before departure.
	 * @param edge Complete native route.
	 * @param nodes Placed semantic subjects.
	 * @returns Whether one shared endpoint face was rejected.
	 */
	private rejectEdge(edge: ElkExtendedEdge, nodes: ReadonlyMap<string, ElkNode>): boolean {
		const section = edge.sections?.[0];
		if (!section || edge.sources[0] === edge.targets[0]) return false;
		const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
		const kind = relationshipKind(edge);
		return (
			this.rejectEnd(edge.targets[0]!, kind, points.toReversed(), nodes, edge.sources[0]) ||
			this.rejectEnd(edge.sources[0]!, kind, points, nodes)
		);
	}

	/**
	 * Retain at least one native face for this card and relationship kind.
	 * @param id Card identity.
	 * @param kind Shared relationship kind.
	 * @param route Native route ordered from this endpoint outwards.
	 * @param nodes Placed subjects, including frames whose boundary gates differ.
	 * @param toward Source identity for arrivals; absent for departures.
	 * @returns Whether this card or external frame arrival needs another face.
	 */
	private rejectEnd(
		id: string,
		kind: string,
		route: readonly Point[],
		nodes: ReadonlyMap<string, ElkNode>,
		toward?: string,
	): boolean {
		const node = nodes.get(id)!;
		if (!allowsAlternatives(node, toward === undefined ? undefined : nodes.get(toward)))
			return false;
		if (!cramped(route)) return false;
		return this.removeFace(id, kind, faceOf(route[0]!, route[1]!));
	}

	/**
	 * Remove one alternative, preserving the last face and shared-kind identity.
	 * @param id Card identity.
	 * @param kind Shared relationship kind.
	 * @param face The insufficient approach selected by native routing.
	 * @returns Whether the native choices changed.
	 */
	private removeFace(id: string, kind: string, face: Face): boolean {
		const key = `${id}:${kind}`;
		const removed = this.removed.get(key) ?? new Set<Face>();
		if (removed.size >= FACES.length - 1 || removed.has(face)) return false;
		removed.add(face);
		this.removed.set(key, removed);
		return true;
	}
}

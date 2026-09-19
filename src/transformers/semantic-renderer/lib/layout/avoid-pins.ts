import { ROUTE_NUDGE_DISTANCE } from "@/transformers/semantic-renderer/config";
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { boxOf, type Face } from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";

export type AlignedPin = { face: Face; position: number };
export type AlignedPins = Map<string, Map<string, AlignedPin[]>>;

const AXES = [
	["x", "width", "y", "height", "SOUTH", "NORTH"],
	["y", "height", "x", "width", "EAST", "WEST"],
] as const;

/**
 * Physical distance along a shared face; pins on separate faces do not collide.
 * @param box Card bounds.
 * @param one First pin.
 * @param two Second pin.
 * @param distance Minimum separation.
 * @returns Whether the pins are too close.
 */
function nearby(box: Box, one: AlignedPin, two: AlignedPin, distance: number): boolean {
	if (one.face !== two.face) return false;
	const extent = one.face === "NORTH" || one.face === "SOUTH" ? box.width : box.height;
	return Math.abs(one.position - two.position) * extent < distance;
}

/**
 * Shared kind ports exist at their proportional position on every card face.
 * @param index Kind's sorted index.
 * @param count Number of kinds.
 * @param face Card face.
 * @returns The ordinary shared pin.
 */
function seed(index: number, count: number, face: Face): AlignedPin {
	return { face, position: (index + 0.5) / count };
}

/**
 * A self-loop uses two private native classes, so neither can be shared with an aligned pin.
 * @param index Kind's sorted index.
 * @param count Number of kinds.
 * @returns Private east and south pins.
 */
function selfLoopPins(index: number, count: number): readonly AlignedPin[] {
	return [
		{ face: "EAST", position: (index + 1 / 3) / count },
		{ face: "SOUTH", position: (index + 2 / 3) / count },
	];
}

/**
 * Candidate straight channels through the two overlapping card spans.
 * @param one Source card bounds.
 * @param two Target card bounds.
 * @returns One ordered group of source and target pins per available axis.
 */
function candidates(one: Box, two: Box): [AlignedPin, AlignedPin][][] {
	const result: [AlignedPin, AlignedPin][][] = [];
	for (const [axis, extent, cross, crossExtent, forward, reverse] of AXES) {
		const low = Math.max(one[axis], two[axis]) + ROUTE_NUDGE_DISTANCE;
		const high = Math.min(one[axis] + one[extent], two[axis] + two[extent]) - ROUTE_NUDGE_DISTANCE;
		if (low > high) continue;
		if (
			Math.max(one[cross], two[cross]) <
			Math.min(one[cross] + one[crossExtent], two[cross] + two[crossExtent])
		)
			continue;
		const faces =
			one[cross] < two[cross] ? ([forward, reverse] as const) : ([reverse, forward] as const);
		/**
		 * Keep the card center inside the common available span.
		 * @param coordinate Unclamped card center.
		 * @returns A point in the usable span.
		 */
		const clamp = (coordinate: number): number => Math.max(low, Math.min(high, coordinate));
		const balanced = clamp((one[axis] + one[extent] / 2 + two[axis] + two[extent] / 2) / 2);
		const coordinates = new Set([
			balanced,
			(low + high) / 2,
			clamp(one[axis] + one[extent] / 2),
			clamp(two[axis] + two[extent] / 2),
		]);
		const pair: [AlignedPin, AlignedPin][] = [];
		for (const coordinate of coordinates)
			pair.push([
				{ face: faces[0], position: (coordinate - one[axis]) / one[extent] },
				{ face: faces[1], position: (coordinate - two[axis]) / two[extent] },
			]);
		result.push(pair);
	}
	return result;
}

/** Construct stable, noncolliding candidate pins before native connector registration. */
class PinCandidates {
	readonly pins: AlignedPins = new Map();
	private readonly selfLoops = new Map<string, Set<string>>();

	/**
	 * Gather private self-loop coordinates before evaluating ordinary edges.
	 * @param nodes Placed scene nodes.
	 * @param kinds Sorted kinds at every endpoint.
	 * @param edges All scene relationships.
	 */
	constructor(
		private readonly nodes: ReadonlyMap<string, ElkNode>,
		private readonly kinds: ReadonlyMap<string, readonly string[]>,
		edges: readonly ElkExtendedEdge[],
	) {
		for (const edge of edges) {
			if (edge.sources[0] !== edge.targets[0]) continue;
			const id = edge.sources[0]!;
			const present = this.selfLoops.get(id) ?? new Set<string>();
			present.add(relationshipKind(edge));
			this.selfLoops.set(id, present);
		}
	}

	/**
	 * Reserve each usable straight pair together.
	 * @param edge One semantic relationship.
	 */
	add(edge: ElkExtendedEdge): void {
		const source = this.nodes.get(edge.sources[0]!)!;
		const target = this.nodes.get(edge.targets[0]!)!;
		if (source === target || !ordinaryCard(source) || !ordinaryCard(target)) return;
		this.addCardPair(source, target, relationshipKind(edge));
	}

	/**
	 * Try the balanced candidate first for every separated card axis.
	 * @param source Source card.
	 * @param target Target card.
	 * @param kind Shared semantic kind.
	 */
	private addCardPair(source: ElkNode, target: ElkNode, kind: string): void {
		for (const axis of candidates(boxOf(source), boxOf(target))) {
			for (const [index, [from, to]] of axis.entries()) {
				const accepted = this.addPair(source.id, target.id, kind, from, to);
				if (index === 0 && accepted) break;
			}
		}
	}

	/**
	 * Reserve a candidate only when both endpoint pins have room.
	 * @param source Source identity.
	 * @param target Target identity.
	 * @param kind Shared semantic kind.
	 * @param from Source candidate.
	 * @param to Target candidate.
	 * @returns Whether both ends accepted it.
	 */
	private addPair(
		source: string,
		target: string,
		kind: string,
		from: AlignedPin,
		to: AlignedPin,
	): boolean {
		if (!this.available(source, kind, from) || !this.available(target, kind, to)) return false;
		this.record(source, kind, from);
		this.record(target, kind, to);
		return true;
	}

	/**
	 * Check every other shared class and all private self-loop pin locations.
	 * @param id Card identity.
	 * @param kind Candidate kind.
	 * @param pin Candidate physical pin.
	 * @returns Whether it has room.
	 */
	private available(id: string, kind: string, pin: AlignedPin): boolean {
		const box = boxOf(this.nodes.get(id)!);
		const kinds = this.kinds.get(id)!;
		return kinds.every((other, index) =>
			this.freeOfKind(id, kind, pin, box, other, index, kinds.length),
		);
	}

	/**
	 * An aligned pin may reuse its own class, but not another class's physical pin.
	 * @param id Card identity.
	 * @param kind Candidate kind.
	 * @param pin Candidate physical pin.
	 * @param box Card bounds.
	 * @param other Existing kind.
	 * @param index Other kind's sorted index.
	 * @param count Number of kinds on the card.
	 * @returns Whether the other kind has no nearby physical pin.
	 */
	private freeOfKind(
		id: string,
		kind: string,
		pin: AlignedPin,
		box: Box,
		other: string,
		index: number,
		count: number,
	): boolean {
		const loop = this.selfLoops.get(id)?.has(other) ? selfLoopPins(index, count) : [];
		const shared =
			other === kind
				? []
				: [seed(index, count, pin.face), ...(this.pins.get(id)?.get(other) ?? [])];
		return ![...loop, ...shared].some((reserved) =>
			nearby(box, pin, reserved, ROUTE_NUDGE_DISTANCE),
		);
	}

	/**
	 * Avoid a redundant physical pin at the already registered ordinary seed.
	 * @param id Card identity.
	 * @param kind Semantic relationship kind.
	 * @param pin Candidate physical pin.
	 */
	private record(id: string, kind: string, pin: AlignedPin): void {
		const byKind = this.pins.get(id) ?? new Map<string, AlignedPin[]>();
		const pins = byKind.get(kind) ?? [];
		const box = boxOf(this.nodes.get(id)!);
		const kinds = this.kinds.get(id)!;
		const ordinary = seed(kinds.indexOf(kind), kinds.length, pin.face);
		if (
			!nearby(box, pin, ordinary, 0.000001) &&
			!pins.some((prior) => nearby(box, pin, prior, 0.000001))
		)
			pins.push(pin);
		byKind.set(kind, pins);
		this.pins.set(id, byKind);
	}
}

/**
 * Return optional shared-class pins for ordinary card ends, keyed by node and kind.
 * @param nodes Placed scene nodes.
 * @param kinds Sorted kinds at every endpoint.
 * @param edges All scene relationships.
 * @returns Available aligned pins.
 */
export function alignedPins(
	nodes: ReadonlyMap<string, ElkNode>,
	kinds: ReadonlyMap<string, readonly string[]>,
	edges: readonly ElkExtendedEdge[],
): AlignedPins {
	const selected = new PinCandidates(nodes, kinds, edges);
	for (const edge of edges.toSorted((one, two) => one.id.localeCompare(two.id))) selected.add(edge);
	return selected.pins;
}

/**
 * Whether this placed node is an ordinary card rather than a frame.
 * @param node One placed semantic node.
 * @returns Whether it has no children.
 */
function ordinaryCard(node: ElkNode): boolean {
	return !node.children?.length;
}

/**
 * Shared port group carried from semantic meaning through the layout graph.
 * @param edge One routed relationship.
 * @returns Its semantic kind, or the default group for direct engine clients.
 */
export function relationshipKind(edge: ElkExtendedEdge): string {
	return edge.layoutOptions?.["archboard.relationship.kind"] ?? "";
}

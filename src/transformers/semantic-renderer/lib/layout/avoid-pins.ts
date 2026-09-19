import { CARD_ROUTE_CLEARANCE } from "@/transformers/semantic-renderer/lib/layout/routing-clearance";
import {
	ROUTE_NUDGE_DISTANCE,
	ROUTE_OBSTACLE_CLEARANCE,
} from "@/transformers/semantic-renderer/config";
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import {
	boxOf,
	boxesOverlap,
	facePoint,
	obstacleOf,
	SIDES,
	type Face,
} from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import { inflate, type Box } from "@/transformers/semantic-renderer/lib/geometry";

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
 * Shared connection-channel ports exist at their proportional position on every card face.
 * @param index Channel's sorted index.
 * @param count Number of channels.
 * @param face Card face.
 * @returns The ordinary shared pin.
 */
function seed(index: number, count: number, face: Face): AlignedPin {
	return { face, position: (index + 0.5) / count };
}

/**
 * Prefer the reserved label center for vertical channels when one is supplied.
 * @param one Source card bounds.
 * @param two Target card bounds.
 * @param axis Shared span axis.
 * @param extent Dimension along that axis.
 * @param anchor Optional label center.
 * @returns Preferred global channel coordinate.
 */
function preferredCoordinate(
	one: Box,
	two: Box,
	axis: "x" | "y",
	extent: "width" | "height",
	anchor?: number,
): number {
	if (axis === "x" && anchor !== undefined) return anchor;
	return (one[axis] + one[extent] / 2 + two[axis] + two[extent] / 2) / 2;
}

/**
 * A self-loop uses two private native classes, so neither can be shared with an aligned pin.
 * @param index Channel's sorted index.
 * @param count Number of channels.
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
 * @param anchor Optional reserved-label center on the horizontal axis.
 * @returns One ordered group of source and target pins per available axis.
 */
function candidates(one: Box, two: Box, anchor?: number): [AlignedPin, AlignedPin][][] {
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
		const balanced = clamp(preferredCoordinate(one, two, axis, extent, anchor));
		const coordinates = [
			...new Set([
				balanced,
				(low + high) / 2,
				clamp(one[axis] + one[extent] / 2),
				clamp(two[axis] + two[extent] / 2),
			]),
		].toSorted((a, b) => Math.abs(a - balanced) - Math.abs(b - balanced) || a - b);
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

/**
 * Project a fixed arrival onto the facing source card when its outward run has room.
 * @param source Ordinary source card.
 * @param target Destination frame.
 * @param arrival Fixed frame arrival.
 * @returns The facing card pin within the usable span, or no straight alternative.
 */
function oppositePin(source: Box, target: Box, arrival: AlignedPin): AlignedPin | undefined {
	const opposite: Record<Face, Face> = {
		NORTH: "SOUTH",
		SOUTH: "NORTH",
		WEST: "EAST",
		EAST: "WEST",
	};
	const at = facePoint(target, arrival.face, arrival.position);
	const [x, y] = SIDES[arrival.face];
	const vertical = x === 0.5;
	const extent = vertical ? source.width : source.height;
	const offset = vertical ? at.x - source.x : at.y - source.y;
	if (offset < ROUTE_NUDGE_DISTANCE || offset > extent - ROUTE_NUDGE_DISTANCE) return undefined;
	const pin = { face: opposite[arrival.face], position: offset / extent };
	const from = facePoint(source, pin.face, pin.position);
	return (from.x - at.x) * (2 * x - 1) + (from.y - at.y) * (2 * y - 1) > 0 ? pin : undefined;
}

/** Construct stable, noncolliding candidate pins before native connector registration. */
class PinCandidates {
	readonly pins: AlignedPins = new Map();
	private readonly selfLoops = new Map<string, Set<string>>();

	/**
	 * Gather private self-loop coordinates before evaluating ordinary edges.
	 * @param nodes Placed scene nodes.
	 * @param channels Sorted connection channels at every endpoint.
	 * @param edges All scene relationships.
	 * @param arrivals Existing frame policy's candidate arrival pins, keyed by relationship.
	 * @param offered Feasible first-pass pins whose replaced seeds need no clearance.
	 */
	constructor(
		private readonly nodes: ReadonlyMap<string, ElkNode>,
		private readonly channels: ReadonlyMap<string, readonly string[]>,
		private readonly edges: readonly ElkExtendedEdge[],
		private readonly arrivals: ReadonlyMap<string, AlignedPin>,
		private readonly offered: AlignedPins = new Map(),
	) {
		for (const edge of edges) {
			if (edge.sources[0] !== edge.targets[0]) continue;
			const id = edge.sources[0]!;
			const present = this.selfLoops.get(id) ?? new Set<string>();
			present.add(relationshipChannel(edge, id));
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
		if (source === target || !ordinaryCard(source)) return;
		if (!ordinaryCard(target)) {
			const arrival = this.arrivals.get(edge.id);
			if (arrival !== undefined) this.addFrameArrival(edge, source, target, arrival);
			return;
		}
		this.addCardPair(
			source,
			target,
			relationshipChannel(edge, source.id),
			relationshipChannel(edge, target.id),
			edge.id,
			anchorCoordinate(edge),
		);
	}

	/**
	 * Offer a clear source pin opposite an external frame's existing arrival.
	 * The frame keeps its own face and position policy; only the card gains a pin.
	 * @param edge Relationship whose source channel may align.
	 * @param source Ordinary source card.
	 * @param target External destination frame.
	 * @param arrival The frame policy's current candidate.
	 */
	private addFrameArrival(
		edge: ElkExtendedEdge,
		source: ElkNode,
		target: ElkNode,
		arrival: AlignedPin,
	): void {
		const from = oppositePin(boxOf(source), boxOf(target), arrival);
		if (from === undefined) return;
		const channel = relationshipChannel(edge, source.id);
		if (
			this.available(source.id, channel, from) &&
			this.clearSegment(source.id, target.id, from, arrival, edge.id)
		)
			this.record(source.id, channel, from);
	}

	/**
	 * Try feasible candidates from nearest to farthest from the balanced center.
	 * @param source Source card.
	 * @param target Target card.
	 * @param sourceChannel Source endpoint's connection channel.
	 * @param targetChannel Target endpoint's connection channel.
	 * @param edgeId Relationship whose own label remains traversable.
	 * @param anchor Optional reserved-label center on the horizontal axis.
	 */
	private addCardPair(
		source: ElkNode,
		target: ElkNode,
		sourceChannel: string,
		targetChannel: string,
		edgeId: string,
		anchor?: number,
	): void {
		for (const axis of candidates(boxOf(source), boxOf(target), anchor)) {
			for (const [from, to] of axis) {
				const accepted = this.addPair(
					source.id,
					target.id,
					sourceChannel,
					targetChannel,
					from,
					to,
					edgeId,
				);
				if (accepted) break;
			}
		}
	}

	/**
	 * Reserve a candidate only when both endpoint pins have room.
	 * @param source Source identity.
	 * @param target Target identity.
	 * @param sourceChannel Source endpoint's connection channel.
	 * @param targetChannel Target endpoint's connection channel.
	 * @param from Source candidate.
	 * @param to Target candidate.
	 * @param edgeId Relationship whose own label remains traversable.
	 * @returns Whether both ends accepted it.
	 */
	private addPair(
		source: string,
		target: string,
		sourceChannel: string,
		targetChannel: string,
		from: AlignedPin,
		to: AlignedPin,
		edgeId: string,
	): boolean {
		if (!this.available(source, sourceChannel, from) || !this.available(target, targetChannel, to))
			return false;
		if (!this.clearSegment(source, target, from, to, edgeId)) return false;
		this.record(source, sourceChannel, from);
		this.record(target, targetChannel, to);
		return true;
	}

	/**
	 * A straight candidate must not enter another node's solid card or title band.
	 * @param source Source node identity.
	 * @param target Target node identity.
	 * @param from Source card pin.
	 * @param to Target card pin.
	 * @param edgeId Relationship whose own label remains traversable.
	 * @returns Whether the whole physical segment is clear.
	 */
	private clearSegment(
		source: string,
		target: string,
		from: AlignedPin,
		to: AlignedPin,
		edgeId: string,
	): boolean {
		const a = facePoint(boxOf(this.nodes.get(source)!), from.face, from.position);
		const b = facePoint(boxOf(this.nodes.get(target)!), to.face, to.position);
		const segment: Box = {
			x: Math.min(a.x, b.x),
			y: Math.min(a.y, b.y),
			width: Math.abs(a.x - b.x),
			height: Math.abs(a.y - b.y),
		};
		for (const [id, node] of this.nodes) {
			if (id === source || id === target) continue;
			if (boxesOverlap(segment, inflate(obstacleOf(node), CARD_ROUTE_CLEARANCE))) return false;
		}

		return this.clearLabels(segment, edgeId);
	}

	/**
	 * Aligned channels must clear the same foreign label obstacles as native routing.
	 * @param segment Proposed physical channel.
	 * @param ownId Its relationship, whose own label is traversable.
	 * @returns Whether all foreign buffered labels leave this channel open.
	 */
	private clearLabels(segment: Box, ownId: string): boolean {
		return this.edges.every((edge) => {
			if (edge.id === ownId || edge.layoutOptions?.["archboard.route-label"] !== "true")
				return true;
			return (edge.labels ?? []).every(
				(label) => !boxesOverlap(segment, inflate(boxOf(label), ROUTE_OBSTACLE_CLEARANCE)),
			);
		});
	}

	/**
	 * Check every other shared channel and all private self-loop pin locations.
	 * @param id Card identity.
	 * @param channel Candidate connection channel.
	 * @param pin Candidate physical pin.
	 * @returns Whether it has room.
	 */
	private available(id: string, channel: string, pin: AlignedPin): boolean {
		const box = boxOf(this.nodes.get(id)!);
		const channels = this.channels.get(id)!;
		return channels.every((other, index) =>
			this.freeOfChannel(id, channel, pin, box, other, index, channels.length),
		);
	}

	/**
	 * An aligned pin may reuse its own class, but not another class's physical pin.
	 * @param id Card identity.
	 * @param channel Candidate connection channel.
	 * @param pin Candidate physical pin.
	 * @param box Card bounds.
	 * @param other Existing channel.
	 * @param index Other channel's sorted index.
	 * @param count Number of channels on the card.
	 * @returns Whether the other channel has no nearby physical pin.
	 */
	private freeOfChannel(
		id: string,
		channel: string,
		pin: AlignedPin,
		box: Box,
		other: string,
		index: number,
		count: number,
	): boolean {
		const loop = this.selfLoops.get(id)?.has(other) ? selfLoopPins(index, count) : [];
		const shared =
			other === channel ? [] : this.sharedPins(id, other, seed(index, count, pin.face));
		return ![...loop, ...shared].some((reserved) =>
			nearby(box, pin, reserved, ROUTE_NUDGE_DISTANCE),
		);
	}

	/**
	 * Keep only physical pins that native registration will actually offer.
	 * @param id Card identity.
	 * @param channel Other relationship channel.
	 * @param fallback Seed used when no matched candidate replaces this face.
	 * @returns Previously feasible and newly selected pins.
	 */
	private sharedPins(id: string, channel: string, fallback: AlignedPin): readonly AlignedPin[] {
		const offered = this.offered.get(id)?.get(channel) ?? [];
		const seeds = offered.some((pin) => pin.face === fallback.face) ? [] : [fallback];
		return [...seeds, ...offered, ...(this.pins.get(id)?.get(channel) ?? [])];
	}

	/**
	 * Keep the accepted physical pin, including when it replaces the ordinary seed.
	 * @param id Card identity.
	 * @param channel Connection channel.
	 * @param pin Candidate physical pin.
	 */
	private record(id: string, channel: string, pin: AlignedPin): void {
		const byChannel = this.pins.get(id) ?? new Map<string, AlignedPin[]>();
		const pins = byChannel.get(channel) ?? [];
		const box = boxOf(this.nodes.get(id)!);
		if (!pins.some((prior) => nearby(box, pin, prior, 0.000001))) pins.push(pin);
		byChannel.set(channel, pins);
		this.pins.set(id, byChannel);
	}
}

/**
 * Return optional shared-class pins for ordinary card ends, keyed by node and channel.
 * @param nodes Placed scene nodes.
 * @param channels Sorted connection channels at every endpoint.
 * @param edges All scene relationships.
 * @param arrivals Existing frame policy's candidate arrivals.
 * @returns Available aligned pins.
 */
export function alignedPins(
	nodes: ReadonlyMap<string, ElkNode>,
	channels: ReadonlyMap<string, readonly string[]>,
	edges: readonly ElkExtendedEdge[],
	arrivals: ReadonlyMap<string, AlignedPin>,
): AlignedPins {
	// The first pass protects every seed. The refinement can release seeds
	// replaced by real matched pins, without losing those feasible alternatives.
	const selected = new PinCandidates(nodes, channels, edges, arrivals);
	for (const edge of edges.toSorted((one, two) => one.id.localeCompare(two.id))) selected.add(edge);
	const refined = new PinCandidates(nodes, channels, edges, arrivals, selected.pins);
	for (const edge of edges.toSorted((one, two) => one.id.localeCompare(two.id))) refined.add(edge);
	return refined.pins;
}

/**
 * Only an entire vertical channel may move both card pins with its badge.
 * @param edge Relationship carrying an optional accepted waypoint.
 * @returns Physical channel coordinate, or no pin hint for a bent route.
 */
function anchorCoordinate(edge: ElkExtendedEdge): number | undefined {
	const options = edge.layoutOptions ?? {};
	if (
		options["archboard.route-label.pin-align"] === "false" ||
		options["archboard.route-label.axis"] === "x"
	)
		return undefined;
	const x = reservedLabelX(edge);
	return x === undefined ? undefined : Number(x) + edge.labels![0]!.width! / 2;
}

/**
 * Use the accepted explicit label position or the measured fallback reservation.
 * @param edge Relationship carrying its reserved label.
 * @returns Its horizontal label coordinate when a reservation exists.
 */
function reservedLabelX(edge: ElkExtendedEdge): string | number | undefined {
	const options = edge.layoutOptions ?? {};
	return (
		options["archboard.route-label.x"] ??
		(options["archboard.route-label"] === "true" ? edge.labels?.[0]?.x : undefined)
	);
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

/**
 * Return the channel an edge occupies at one of its endpoints.
 *
 * Same-kind relationships may share a trunk when they have the same local
 * direction, but an incoming relationship must not reuse an outgoing one. A
 * comparison standing is part of the visible identity of a connection, so it
 * also gets its own channel whenever the render is a proposal.
 * @param edge One routed relationship.
 * @param endpoint The endpoint whose physical port is being allocated.
 * @returns A stable channel key.
 */
export function relationshipChannel(edge: ElkExtendedEdge, endpoint: string): string {
	const source = edge.sources[0]!;
	const target = edge.targets[0]!;
	const direction = source === target ? "self" : endpoint === source ? "outgoing" : "incoming";
	return JSON.stringify([
		relationshipKind(edge),
		edge.layoutOptions?.["archboard.relationship.standing"] ?? "",
		direction,
	]);
}

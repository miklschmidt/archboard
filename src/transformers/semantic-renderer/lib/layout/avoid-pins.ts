import {
	projectedCardPins,
	usedCardPins,
} from "@/transformers/semantic-renderer/lib/layout/pin-feedback";
import { CARD_ROUTE_CLEARANCE } from "@/transformers/semantic-renderer/lib/layout/routing-clearance";
import {
	ROUTE_NUDGE_DISTANCE,
	ROUTE_OBSTACLE_CLEARANCE,
} from "@/transformers/semantic-renderer/config";
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { semanticOrder } from "@/transformers/semantic-renderer/lib/layout/semantic-order";
import {
	boxOf,
	contains,
	boxesOverlap,
	facePoint,
	obstacleOf,
	type Face,
} from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import { inflate, type Box } from "@/transformers/semantic-renderer/lib/geometry";

export type AlignedPin = { face: Face; position: number };
export type AlignedPins = Map<string, Map<string, AlignedPin[]>>;

/**
 * Read physical alternatives in a shared endpoint channel.
 * @param pins Grouped alternatives.
 * @param id Endpoint identity.
 * @param channel Connection channel.
 * @returns Existing alternatives, or an empty list.
 */
function pinsAt(pins: AlignedPins, id: string, channel: string): readonly AlignedPin[] {
	return pins.get(id)?.get(channel) ?? [];
}

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
export function nearby(box: Box, one: AlignedPin, two: AlignedPin, distance: number): boolean {
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
 * Candidate straight channels through two overlapping endpoint spans.
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

/** Construct stable, noncolliding candidate pins before native connector registration. */
class PinCandidates {
	readonly pins: AlignedPins = new Map();
	private readonly selfLoops = new Map<string, Set<string>>();

	/**
	 * Gather private self-loop coordinates before evaluating ordinary edges.
	 * @param nodes Placed scene nodes.
	 * @param channels Sorted connection channels at every endpoint.
	 * @param edges All scene relationships.
	 * @param offered Feasible first-pass pins whose replaced seeds need no clearance.
	 */
	constructor(
		private readonly nodes: ReadonlyMap<string, ElkNode>,
		private readonly channels: ReadonlyMap<string, readonly string[]>,
		private readonly edges: readonly ElkExtendedEdge[],
		private readonly offered: AlignedPins = new Map(),
		private readonly used: AlignedPins = new Map(),
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
		if (!ordinaryCard(target) && contains(boxOf(target), boxOf(source))) return;
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
	 * Offer clear continuations of existing native rails to each ordinary endpoint.
	 * @param edge Complete baseline relationship.
	 */
	addRails(edge: ElkExtendedEdge): void {
		if (edge.sources[0] === edge.targets[0]) return;
		for (const id of [...edge.sources, ...edge.targets].filter((endpoint) =>
			ordinaryCard(this.nodes.get(endpoint)!),
		)) {
			const node = this.nodes.get(id)!;
			const channel = relationshipChannel(edge, id);
			for (const { pin, corridor } of projectedCardPins(node, edge)) {
				if (!this.available(id, channel, pin)) continue;
				if (!this.clearCorridor(corridor, new Set([id]), edge.id)) continue;
				this.record(id, channel, pin);
			}
		}
	}

	/**
	 * Try feasible candidates from nearest to farthest from the balanced center.
	 * @param source Source card.
	 * @param target Target card or external frame.
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
		if (!arrivalBelowTitle(this.nodes.get(target)!, to)) return false;
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
		return this.clearCorridor(segment, new Set([source, target]), edgeId);
	}

	/**
	 * Validate projected and paired pins against the same buffered cards and labels.
	 * @param segment Proposed straight corridor.
	 * @param endpoints Cards touched by this corridor.
	 * @param edgeId Relationship whose own label remains traversable.
	 * @returns Whether every foreign obstacle leaves the corridor clear.
	 */
	private clearCorridor(segment: Box, endpoints: ReadonlySet<string>, edgeId: string): boolean {
		for (const [id, node] of this.nodes) {
			if (endpoints.has(id)) continue;
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
	 * Whether this channel has actual attachments from the baseline scene.
	 * @param id Card identity.
	 * @param channel Relationship channel.
	 * @returns Whether baseline pins replace hypothetical reservations.
	 */
	private hasUsedChannel(id: string, channel: string): boolean {
		return this.used.get(id)?.has(channel) ?? false;
	}

	/**
	 * Keep actual, offered, and newly selected pins while reserving seeds only before feedback.
	 * @param id Card identity.
	 * @param channel Shared channel.
	 * @param fallback Ordinary seed.
	 * @returns Physical reservations protecting other channels.
	 */
	private sharedPins(id: string, channel: string, fallback: AlignedPin): readonly AlignedPin[] {
		const offered = pinsAt(this.offered, id, channel);
		const selected = pinsAt(this.pins, id, channel);
		if (this.hasUsedChannel(id, channel)) return [...offered, ...selected];
		const seeds = offered.some((pin) => pin.face === fallback.face)
			? []
			: seedPins(this.nodes.get(id)!, fallback);
		return [...seeds, ...offered, ...selected];
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
 * Return feasible shared-class pins for cards and external frame arrivals.
 * @param nodes Placed scene nodes.
 * @param channels Sorted connection channels at every endpoint.
 * @param edges All scene relationships.
 * @returns Available aligned pins.
 */
export function alignedPins(
	nodes: ReadonlyMap<string, ElkNode>,
	channels: ReadonlyMap<string, readonly string[]>,
	edges: readonly ElkExtendedEdge[],
): AlignedPins {
	// The first pass protects every seed. The refinement can release seeds
	// replaced by real matched pins, without losing those feasible alternatives.
	const selected = new PinCandidates(nodes, channels, edges);
	for (const edge of edges.toSorted((one, two) => semanticOrder(one) - semanticOrder(two)))
		selected.add(edge);
	const refined = new PinCandidates(nodes, channels, edges, selected.pins);
	for (const edge of edges.toSorted((one, two) => semanticOrder(one) - semanticOrder(two)))
		refined.add(edge);
	return refined.pins;
}

/**
 * Collect actual attachments before reconsidering unused alternatives.
 * @param nodes Placed nodes.
 * @param edges Settled routes.
 * @returns Pins grouped by endpoint and channel.
 */
function collectUsedPins(
	nodes: ReadonlyMap<string, ElkNode>,
	edges: readonly ElkExtendedEdge[],
): AlignedPins {
	const used: AlignedPins = new Map();
	for (const edge of edges) {
		for (const [id, pin] of usedCardPins(nodes, edge)) {
			const byChannel = used.get(id) ?? new Map<string, AlignedPin[]>();
			const channel = relationshipChannel(edge, id);
			const pins = byChannel.get(channel) ?? [];
			if (!pins.some((prior) => nearby(boxOf(nodes.get(id)!), pin, prior, 0.000001)))
				pins.push(pin);
			byChannel.set(channel, pins);
			used.set(id, byChannel);
		}
	}
	return used;
}

/**
 * Refine one settled native scene while retaining all of its actually used card pins.
 * Unused seeds may yield to clear alternatives; shared channels keep every used attachment.
 * @param nodes Placed scene nodes.
 * @param channels Sorted connection channels at every endpoint.
 * @param edges Complete baseline relationships.
 * @returns Refined alternatives, or nothing when no new pin could be offered.
 */
export function refinedPins(
	nodes: ReadonlyMap<string, ElkNode>,
	channels: ReadonlyMap<string, readonly string[]>,
	edges: readonly ElkExtendedEdge[],
): AlignedPins | undefined {
	const used = collectUsedPins(nodes, edges);
	const selected = new PinCandidates(nodes, channels, edges, used, used);
	for (const [id, byChannel] of used)
		selected.pins.set(id, new Map([...byChannel].map(([channel, pins]) => [channel, [...pins]])));
	for (const edge of edges.toSorted((one, two) => semanticOrder(one) - semanticOrder(two))) {
		selected.add(edge);
		selected.addRails(edge);
	}
	const added = [...selected.pins].some(([id, byChannel]) =>
		[...byChannel].some(
			([channel, pins]) => pins.length > (used.get(id)?.get(channel)?.length ?? 0),
		),
	);
	return added ? selected.pins : undefined;
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
 * Frames have perimeter departure seeds and body-only side-arrival seeds.
 * @param node Endpoint owning the shared channel.
 * @param pin Ordinary channel fraction.
 * @returns Every physical seed that remains available before matched pins replace the face.
 */
function seedPins(node: ElkNode, pin: AlignedPin): readonly AlignedPin[] {
	if (ordinaryCard(node) || pin.face === "NORTH" || pin.face === "SOUTH") return [pin];
	const header = obstacleOf(node).height;
	const position = (header + (node.height! - header) * pin.position) / node.height!;
	return [pin, { ...pin, position }];
}

/**
 * Keep external side arrivals on the frame body, as the normal frame policy does.
 * @param node Target card or frame.
 * @param pin Proposed arrival.
 * @returns Whether its face and position preserve title separation.
 */
function arrivalBelowTitle(node: ElkNode, pin: AlignedPin): boolean {
	if (ordinaryCard(node) || pin.face === "NORTH" || pin.face === "SOUTH") return true;
	return (
		facePoint(boxOf(node), pin.face, pin.position).y >=
		node.y! + obstacleOf(node).height + ROUTE_NUDGE_DISTANCE
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

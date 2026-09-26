import { EndpointOptions } from "@/transformers/semantic-renderer/lib/layout/endpoint-options";
import { centreHandicap } from "@/transformers/semantic-renderer/lib/layout/even-pins";
import type { Requested } from "@/transformers/semantic-renderer/lib/layout/route-requests";
import {
	centredPins,
	type PinFeedback,
} from "@/transformers/semantic-renderer/lib/layout/lone-pins";
import {
	APPROACH_STRAIGHT,
	ROUTE_OBSTACLE_CLEARANCE as SHAPE_CLEARANCE,
	ROUTE_NUDGE_DISTANCE,
	ROUTE_SEGMENT_PENALTY,
} from "@/transformers/semantic-renderer/config";
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import {
	CARD_ROUTE_EXPANSION,
	LABEL_ROUTE_EXPANSION,
	ROUTE_LANE,
} from "@/transformers/semantic-renderer/lib/layout/routing-clearance";
import {
	grown,
	pinPlacement,
	routingInsets,
	type Insets,
} from "@/transformers/semantic-renderer/lib/layout/frame-walls";
import {
	boxCentre,
	inflate,
	type Box,
	type Point,
} from "@/transformers/semantic-renderer/lib/geometry";
import {
	forcedLabel,
	type Connection,
} from "@/transformers/semantic-renderer/lib/layout/avoid-routes";
import {
	alignedPins,
	collectUsedPins,
	refinedPins,
	nearby,
	relationshipChannel,
	type AlignedPin,
	type AlignedPins,
} from "@/transformers/semantic-renderer/lib/layout/avoid-pins";
import {
	boxOf,
	boxesOverlap,
	facePoint,
	frameArrivalPoint,
	FACES,
	obstacleOf,
	SIDES,
	endpointFace,
	internalFrame,
	positionOnFace,
	type Face,
} from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";

type ConnectionEnd = InstanceType<AvoidEngine["ConnEnd"]>;

/** What a scene's routes are asked for, with each card's reach toward a wall to clear. */
type SceneRequest = Omit<Requested, "clearWalls"> & { readonly reach: ReadonlyMap<string, Insets> };

/**
 * The same inset on every face.
 * @param inset The inset.
 * @returns The insets.
 */
function uniformInsets(inset: number): Insets {
	return { NORTH: inset, SOUTH: inset, WEST: inset, EAST: inset };
}

/** One native obstacle scene; the router owns its shapes, shared pins and connectors. */
export class RoutingScene {
	readonly router: InstanceType<AvoidEngine["Router"]>;
	readonly nodes = new Map<string, ElkNode>();
	private readonly obstacles = new Map<string, Box>();
	private readonly shapes = new Map<string, object>();
	private readonly classes = new Map<string, number>();
	private readonly channels = new Map<string, readonly string[]>();
	private readonly closedBodies: Box[] = [];
	private aligned: AlignedPins = new Map();

	/**
	 * Configure the same obstacle routing as the accepted prototype.
	 * @param avoid The initialized libavoid module.
	 * @param endpoints Shared faces still capable of a complete rounded approach.
	 * @param closedFrames Frames whose bodies no unrelated route may enter.
	 * @param request What the routes are asked for (route-requests.ts), with each card's reach toward a wall to clear.
	 */
	constructor(
		private readonly avoid: AvoidEngine,
		private readonly endpoints: EndpointOptions,
		private readonly closedFrames: ReadonlySet<string>,
		private readonly request: SceneRequest,
	) {
		this.router = new avoid.Router(avoid.RouterFlag.OrthogonalRouting.value);
		this.router.setRoutingParameter(avoid.RoutingParameter.shapeBufferDistance, SHAPE_CLEARANCE);
		this.router.setRoutingParameter(avoid.RoutingParameter.idealNudgingDistance, ROUTE_LANE);
		this.router.setRoutingParameter(avoid.RoutingParameter.segmentPenalty, ROUTE_SEGMENT_PENALTY);
		this.router.setRoutingOption(
			avoid.RoutingOption.nudgeOrthogonalSegmentsConnectedToShapes,
			false,
		);
	}

	/**
	 * Add a measured solid obstacle; native constructors copy their arguments.
	 * @param id Scene identity.
	 * @param box Measured rectangle.
	 */
	shape(id: string, box: Box): void {
		const from = new this.avoid.Point(box.x, box.y);
		const to = new this.avoid.Point(box.x + box.width, box.y + box.height);
		const rectangle = new this.avoid.Rectangle(from, to);
		try {
			this.shapes.set(id, new this.avoid.ShapeRef(this.router, rectangle));
		} finally {
			rectangle.delete();
			from.delete();
			to.delete();
		}
		this.obstacles.set(id, box);
	}

	/**
	 * Register cards and measured title bands recursively.
	 * @param node One placed semantic node.
	 * @param hidden Whether an unrelated ancestor already blocks the whole subtree.
	 */
	visit(node: ElkNode, hidden = false): void {
		this.nodes.set(node.id, node);
		const closed = this.closedFrames.has(node.id);
		if (!hidden) this.registerNode(node, closed);
		for (const child of node.children ?? []) this.visit(child, hidden || closed);
	}

	/**
	 * Add this node's visible obstacle to the scene.
	 * @param node A placed semantic node.
	 * @param closed Whether its whole frame body blocks this relationship.
	 */
	private registerNode(node: ElkNode, closed: boolean): void {
		if (closed) this.closedBodies.push(boxOf(node));
		this.shape(node.id, closed ? boxOf(node) : grown(obstacleOf(node), this.insets(node.id)));
	}

	/**
	 * Group shared ports by relationship kind, standing, and local direction.
	 * @param edges All relationships, before native connectors are registered.
	 * @param pins Optional feedback alternatives preserving baseline attachments.
	 */
	ports(edges: readonly ElkExtendedEdge[], pins?: AlignedPins): void {
		const channels = new Map<string, Set<string>>();
		for (const edge of edges) {
			for (const id of [...edge.sources, ...edge.targets]) {
				const present = channels.get(id) ?? new Set<string>();
				present.add(relationshipChannel(edge, id));
				channels.set(id, present);
			}
		}
		for (const [id, present] of channels) this.channels.set(id, [...present].toSorted());
		this.aligned = pins ?? alignedPins(this.nodes, this.channels, edges, this.request);
	}

	/**
	 * Ask the allocator for one improvement informed by complete native routes.
	 * @param edges Settled baseline relationships.
	 * @returns A new feasible pin map, or nothing when the baseline offers every candidate.
	 */
	refinePorts(edges: readonly ElkExtendedEdge[]): AlignedPins | undefined {
		return refinedPins(this.nodes, this.channels, edges, this.request);
	}

	/**
	 * The used pins with every lone port centred, when the routes ask for it.
	 * @param edges Settled refined relationships.
	 * @returns The used pins for the last solve, or nothing when none moved.
	 */
	centrePorts(edges: readonly ElkExtendedEdge[]): PinFeedback | undefined {
		if (!this.request.centredPorts) return undefined;
		return centredPins(this.nodes, this.channels, edges, collectUsedPins(this.nodes, edges));
	}

	/**
	 * Add aligned physical alternatives under the card's ordinary shared native class.
	 * @param id Card identity.
	 * @param channel Relationship channel.
	 * @param position Ordinary proportional channel position.
	 * @returns The native endpoint shared by all relationships in this channel.
	 */
	private cardPin(id: string, channel: string, position: number): ConnectionEnd {
		const key = `${id}:any:${position}`;
		let pinClass = this.classes.get(key);
		const shape = this.shapes.get(id)!;
		if (pinClass === undefined) {
			pinClass = this.classes.size + 1;
			this.registerCardPins(
				id,
				channel,
				pinClass,
				position,
				this.aligned.get(id)?.get(channel) ?? [],
			);
			this.classes.set(key, pinClass);
		}
		return new this.avoid.ConnEnd(shape, pinClass);
	}

	/**
	 * On matched faces, register only clear aligned positions; keep seeds on other faces.
	 * @param id Native card identity.
	 * @param channel Shared relationship channel.
	 * @param pinClass Shared relationship-channel class.
	 * @param position Ordinary channel position.
	 * @param pins Clear matched alternatives.
	 */
	private registerCardPins(
		id: string,
		channel: string,
		pinClass: number,
		position: number,
		pins: readonly AlignedPin[],
	): void {
		for (const face of FACES) {
			if (!this.endpoints.allows(id, channel, face)) continue;
			if (
				!pins.some((pin) => pin.face === face) &&
				this.seedAvailable(id, channel, { face, position })
			)
				this.registerPins(id, pinClass, [SIDES[face]], position);
		}
		for (const pin of pins.filter((candidate) =>
			this.endpoints.allows(id, channel, candidate.face),
		)) {
			this.registerPins(id, pinClass, [SIDES[pin.face]], pin.position);
		}
	}

	/**
	 * Release an unused seed only where another channel has a reserved physical pin.
	 * Actual baseline attachments are always included among the selected pins.
	 * @param id Ordinary endpoint card.
	 * @param channel Seed's shared relationship channel.
	 * @param seed Candidate fallback attachment.
	 * @returns Whether no other channel owns this part of the face.
	 */
	private seedAvailable(id: string, channel: string, seed: AlignedPin): boolean {
		const box = boxOf(this.nodes.get(id)!);
		return [...(this.aligned.get(id) ?? [])].every(
			([other, pins]) =>
				other === channel || !pins.some((pin) => nearby(box, seed, pin, ROUTE_NUDGE_DISTANCE)),
		);
	}

	/**
	 * Register only labels that natural routes could not carry.
	 * @param edges The complete semantic relationships.
	 * @param selected The relationship routed alone in a scoped scene, if any.
	 */
	labels(edges: readonly ElkExtendedEdge[], selected?: string): void {
		for (const edge of edges) {
			if (!forcedLabel(edge)) continue;
			const box = boxOf(edge.labels![0]!);
			if (this.closedBodies.some((body) => boxesOverlap(box, body))) {
				if (edge.id === selected)
					throw new Error(
						`NativeRouteUnavailable: relationship ${edge.id}'s label lies inside an unrelated frame`,
					);
				continue;
			}
			this.shape(`label_${edge.id}`, inflate(box, this.labelExpansion()));
		}
	}

	/**
	 * Let the native router choose among shared face centers unless the semantic endpoint fixes a face.
	 * @param id The solid obstacle.
	 * @param side A fixed face for a title, reserved label, or self-loop end.
	 * @param position Coordinate along a fixed face; self-loop pins avoid overlapping the shared class.
	 * @returns An owned endpoint copied by the connector.
	 */
	private pin(id: string, side?: Face, position = 0.5): ConnectionEnd {
		const key = `${id}:${side ?? "any"}:${position}`;
		let pinClass = this.classes.get(key);
		const shape = this.shapes.get(id)!;
		if (pinClass === undefined) {
			pinClass = this.classes.size + 1;
			const faces = side === undefined ? Object.values(SIDES) : [SIDES[side]];
			this.registerPins(id, pinClass, faces, position);
			this.classes.set(key, pinClass);
		}
		return new this.avoid.ConnEnd(shape, pinClass);
	}

	/**
	 * Register candidate physical pins under one shared native class.
	 * @param id Native obstacle identity.
	 * @param pinClass Shared class selected by the connector.
	 * @param faces Candidate centers and outward directions.
	 * @param position Along-face position for a self-loop end.
	 */
	private registerPins(
		id: string,
		pinClass: number,
		faces: readonly (typeof SIDES)[Face][],
		position: number,
	): void {
		const shape = this.shapes.get(id)!;
		const box = this.obstacles.get(id)!;
		const inset = this.insets(id);
		for (const side of faces) {
			const { at, offset } = pinPlacement(box, inset, side, position);
			const pin = new this.avoid.ShapeConnectionPin(
				shape,
				pinClass,
				at.x,
				at.y,
				true,
				offset,
				side[2],
			);
			pin.setExclusive(false);
			if (this.request.evenPins) pin.setConnectionCost(centreHandicap(box, at, offset));
		}
	}

	/**
	 * How far a reserved label's routing box reaches past the label.
	 * @returns The label expansion when the routes ask for the full clearance, else none.
	 */
	private labelExpansion(): number {
		return this.request.labelClearance ? LABEL_ROUTE_EXPANSION : 0;
	}

	/**
	 * How far a native obstacle's routing box reaches past its visible shape.
	 * @param id Native obstacle identity.
	 * @returns Its inset on each face; a label's keeps its pins on its visible border, and arrival corridors have none.
	 */
	private insets(id: string): Insets {
		if (id.startsWith("label_")) return uniformInsets(this.labelExpansion());
		return routingInsets(this.nodes.get(id), this.request.reach.get(id));
	}

	/**
	 * Attach to a card face, a frame's own divider, or its actual outer perimeter.
	 * @param id The semantic endpoint.
	 * @param other The opposite semantic endpoint.
	 * @param source Whether this is the source, distinguishing self-loop ends.
	 * @param channel The relationship channel.
	 * @returns An owned native endpoint.
	 */
	private endpoint(id: string, other: string, source: boolean, channel: string): ConnectionEnd {
		const node = this.nodes.get(id)!;
		const target = this.nodes.get(other)!;
		const channels = this.channels.get(id)!;
		const index = channels.indexOf(channel);
		const position = (index + 0.5) / channels.length;
		if (node === target)
			return this.pin(
				id,
				source ? "EAST" : "SOUTH",
				(index + (source ? 1 / 3 : 2 / 3)) / channels.length,
			);
		if (!node.children?.length) return this.cardPin(id, channel, position);
		return this.frameEndpoint(node, target, source, position, channel);
	}

	/**
	 * Attach to the frame divider or transparent outer perimeter.
	 * @param node The semantic frame.
	 * @param target The other endpoint.
	 * @param source Whether this end has no incoming arrowhead.
	 * @param position The shared channel position on each candidate face.
	 * @param channel Shared relationship channel whose rejected faces remain unavailable.
	 * @returns An owned native endpoint.
	 */
	private frameEndpoint(
		node: ElkNode,
		target: ElkNode,
		source: boolean,
		position: number,
		channel: string,
	): ConnectionEnd {
		const solid = obstacleOf(node);
		const preferred = endpointFace(node, target);
		const { side, at } =
			source || internalFrame(node, target)
				? { side: preferred, at: facePoint(boxOf(node), preferred, position) }
				: this.arrivalPoint(node, target, position, channel);
		if (internalFrame(node, target)) return this.pin(node.id, side, position);
		const onSolid = positionOnFace(solid, side, at);
		if (onSolid !== undefined) return this.pin(node.id, side, onSolid);
		if (source) {
			const point = new this.avoid.Point(at.x, at.y);
			try {
				return new this.avoid.ConnEnd(point);
			} finally {
				point.delete();
			}
		}
		return this.frameArrival(node.id, at, side);
	}

	/**
	 * Choose the nearest frame-face center with room for the physical arrival.
	 * A neighboring card can block the side facing the source while another
	 * face remains open; the frame's placement and insets do not need to grow.
	 * @param node The destination frame.
	 * @param target The source subject.
	 * @param position The shared channel position on each candidate face.
	 * @param channel Shared relationship channel whose rejected faces remain unavailable.
	 * @returns The nearest clear endpoint, or nearest candidate for native validation if crowded.
	 */
	private arrivalPoint(
		node: ElkNode,
		target: ElkNode,
		position: number,
		channel: string,
	): { side: Face; at: Point } {
		const toward = boxCentre(boxOf(target));
		const candidates = this.arrivalCandidates(node, position, channel).toSorted(
			(one, other) =>
				Math.hypot(one.at.x - toward.x, one.at.y - toward.y) -
				Math.hypot(other.at.x - toward.x, other.at.y - toward.y),
		);
		return (
			candidates.find(({ side, at }) => this.clearArrival(node.id, side, at)) ?? candidates[0]!
		);
	}

	/**
	 * Use matched arrival pins on their faces and ordinary seeds on all other faces.
	 * @param node Destination frame.
	 * @param position Its channel's ordinary fraction.
	 * @param channel Shared channel whose rejected faces remain unavailable.
	 * @returns Frame alternatives with the same physical pins the allocator reserved.
	 */
	private arrivalCandidates(
		node: ElkNode,
		position: number,
		channel: string,
	): { side: Face; at: Point }[] {
		const pins = this.aligned.get(node.id)?.get(channel) ?? [];
		return FACES.filter((side) => this.endpoints.allows(node.id, channel, side)).flatMap((side) => {
			const matched = pins.filter((pin) => pin.face === side);
			return matched.length === 0
				? [{ side, at: frameArrivalPoint(node, side, position) }]
				: matched.map((pin) => ({ side, at: facePoint(boxOf(node), side, pin.position) }));
		});
	}

	/**
	 * Check a candidate corridor against the same buffered obstacles libavoid sees.
	 * Its own shared corridor is reusable; another frame's arrival stays protected.
	 * @param frame The destination identity.
	 * @param side Its candidate face.
	 * @param at Its perimeter endpoint.
	 * @returns Whether its head and bend footprint is unobstructed.
	 */
	private clearArrival(frame: string, side: Face, at: Point): boolean {
		const corridor = inflate(arrivalCorridor(at, side), SHAPE_CLEARANCE);
		return ![...this.obstacles].some(
			([id, box]) =>
				id !== frame &&
				id !== `${frame}:approach:${side}:${at.x}:${at.y}` &&
				boxesOverlap(corridor, inflate(box, SHAPE_CLEARANCE)),
		);
	}

	/**
	 * Reserve the physical head and bend at one shared frame-face arrival.
	 * The pin remains on the visible perimeter and points through its own
	 * corridor, so libavoid keeps the final leg square and other routes clear.
	 * @param id The semantic frame.
	 * @param at Its visible perimeter endpoint.
	 * @param side Its outward face.
	 * @returns The native endpoint shared by arrivals on this face.
	 */
	private frameArrival(id: string, at: Point, side: Face): ConnectionEnd {
		const key = `${id}:approach:${side}:${at.x}:${at.y}`;
		let pinClass = this.classes.get(key);
		if (pinClass === undefined) {
			const [x, y, direction] = SIDES[side];
			this.shape(key, arrivalCorridor(at, side));
			pinClass = this.classes.size + 1;
			this.registerPins(key, pinClass, [[1 - x, 1 - y, direction]], 0.5);
			this.classes.set(key, pinClass);
		}
		return new this.avoid.ConnEnd(this.shapes.get(key)!, pinClass);
	}

	/**
	 * Connect copied native endpoints; the router retains the connector.
	 * @param from Source endpoint.
	 * @param to Destination endpoint.
	 * @returns The router-owned connector.
	 */
	private connect(from: ConnectionEnd, to: ConnectionEnd): Connection {
		try {
			const connection = new this.avoid.ConnRef(this.router, from, to);
			connection.setRoutingType(this.avoid.ConnType.ConnType_Orthogonal);
			return connection;
		} finally {
			from.delete();
			to.delete();
		}
	}

	/**
	 * Natural relationships connect directly; a forced label has one straight reserved run.
	 * @param edge The semantic relationship.
	 * @returns One connector or both halves around a reserved label.
	 */
	relationship(edge: ElkExtendedEdge): Connection[] {
		const from = edge.sources[0]!;
		const to = edge.targets[0]!;
		const source = this.endpoint(from, to, true, relationshipChannel(edge, from));
		const target = this.endpoint(to, from, false, relationshipChannel(edge, to));
		if (forcedLabel(edge)) {
			const sourceBox = boxOf(this.nodes.get(from)!);
			const targetBox = boxOf(this.nodes.get(to)!);
			const [entry, exit] = labelFaces(edge, sourceBox, targetBox);
			return [
				this.connect(source, this.pin(`label_${edge.id}`, entry)),
				this.connect(this.pin(`label_${edge.id}`, exit), target),
			];
		}
		return [this.connect(source, target)];
	}
}

/**
 * Preserve the accepted label run's axis and semantic travel direction.
 * @param edge The relationship carrying its accepted run axis.
 * @param source Its source card.
 * @param target Its target card.
 * @returns Opposing entry and exit faces on the reserved label obstacle.
 */
function labelFaces(edge: ElkExtendedEdge, source: Box, target: Box): readonly [Face, Face] {
	const horizontal = edge.layoutOptions?.["archboard.route-label.axis"] === "x";
	const axis = horizontal ? "x" : "y";
	const faces: readonly [Face, Face] = horizontal ? ["WEST", "EAST"] : ["NORTH", "SOUTH"];
	return boxCentre(source)[axis] > boxCentre(target)[axis] ? [faces[1], faces[0]] : faces;
}

/**
 * The local footprint that gives an incoming frame arrow room to turn.
 * The scene's ordinary buffer supplies the rest of the head-and-bend run.
 * @param at The visible endpoint.
 * @param side The frame's outward face.
 * @returns A box extending outward, with room across it for the widest head.
 */
function arrivalCorridor(at: Point, side: Face): Box {
	const [x, y] = SIDES[side];
	const dx = 2 * x - 1;
	const dy = 2 * y - 1;
	const length = CARD_ROUTE_EXPANSION;
	const half = APPROACH_STRAIGHT / 2;
	return {
		x: at.x + (dx === 0 ? -half : Math.min(0, dx * length)),
		y: at.y + (dy === 0 ? -half : Math.min(0, dy * length)),
		width: dx === 0 ? 2 * half : length,
		height: dy === 0 ? 2 * half : length,
	};
}

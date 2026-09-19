import {
	ROUTE_OBSTACLE_CLEARANCE as SHAPE_CLEARANCE,
	ROUTE_NUDGE_DISTANCE,
	ROUTE_SEGMENT_PENALTY,
} from "@/transformers/semantic-renderer/config";
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { APPROACH_STRAIGHT, BEND_RADIUS_MIN } from "@/transformers/semantic-renderer/lib/design";
import {
	boxCentre,
	inflate,
	type Box,
	type Point,
} from "@/transformers/semantic-renderer/lib/geometry";
import { simplify } from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	alignedPins,
	relationshipKind,
	type AlignedPin,
	type AlignedPins,
} from "@/transformers/semantic-renderer/lib/layout/avoid-pins";
import {
	boxOf,
	boxesOverlap,
	contains,
	facePoint,
	frameArrivalPoint,
	FACES,
	obstacleOf,
	SIDES,
	type Face,
} from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";

type Connection = InstanceType<AvoidEngine["ConnRef"]>;
type ConnectionEnd = InstanceType<AvoidEngine["ConnEnd"]>;

/** One native obstacle scene; the router owns its shapes, shared pins and connectors. */
class RoutingScene {
	readonly router: InstanceType<AvoidEngine["Router"]>;
	readonly nodes = new Map<string, ElkNode>();
	private readonly obstacles = new Map<string, Box>();
	private readonly shapes = new Map<string, object>();
	private readonly classes = new Map<string, number>();
	private readonly kinds = new Map<string, readonly string[]>();
	private aligned: AlignedPins = new Map();

	/**
	 * Configure the same obstacle routing as the accepted prototype.
	 * @param avoid The initialized libavoid module.
	 */
	constructor(private readonly avoid: AvoidEngine) {
		this.router = new avoid.Router(avoid.RouterFlag.OrthogonalRouting.value);
		this.router.setRoutingParameter(avoid.RoutingParameter.shapeBufferDistance, SHAPE_CLEARANCE);
		this.router.setRoutingParameter(
			avoid.RoutingParameter.idealNudgingDistance,
			ROUTE_NUDGE_DISTANCE,
		);
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
	 */
	visit(node: ElkNode): void {
		this.nodes.set(node.id, node);
		this.shape(node.id, obstacleOf(node));
		for (const child of node.children ?? []) this.visit(child);
	}

	/**
	 * Group shared ports by semantic relationship kind at each endpoint.
	 * @param edges All relationships, before native connectors are registered.
	 */
	ports(edges: readonly ElkExtendedEdge[]): void {
		const kinds = new Map<string, Set<string>>();
		for (const edge of edges) {
			const kind = relationshipKind(edge);
			for (const id of [...edge.sources, ...edge.targets]) {
				const present = kinds.get(id) ?? new Set<string>();
				present.add(kind);
				kinds.set(id, present);
			}
		}
		for (const [id, present] of kinds) this.kinds.set(id, [...present].toSorted());
		this.aligned = alignedPins(this.nodes, this.kinds, edges);
	}

	/**
	 * Add aligned physical alternatives under the card's ordinary shared native class.
	 * @param id Card identity.
	 * @param kind Semantic relationship kind.
	 * @param position Ordinary proportional kind position.
	 * @returns The native endpoint shared by all relationships of this kind.
	 */
	private cardPin(id: string, kind: string, position: number): ConnectionEnd {
		const key = `${id}:any:${position}`;
		let pinClass = this.classes.get(key);
		const shape = this.shapes.get(id)!;
		if (pinClass === undefined) {
			pinClass = this.classes.size + 1;
			this.registerCardPins(shape, pinClass, position, this.aligned.get(id)?.get(kind) ?? []);
			this.classes.set(key, pinClass);
		}
		return new this.avoid.ConnEnd(shape, pinClass);
	}

	/**
	 * On matched faces, register only clear aligned positions; keep seeds on other faces.
	 * @param shape Native card obstacle.
	 * @param pinClass Shared relationship-kind class.
	 * @param position Ordinary kind position.
	 * @param pins Clear matched alternatives.
	 */
	private registerCardPins(
		shape: object,
		pinClass: number,
		position: number,
		pins: readonly AlignedPin[],
	): void {
		for (const face of FACES) {
			if (!pins.some((pin) => pin.face === face))
				this.registerPins(shape, pinClass, [SIDES[face]], position);
		}
		for (const pin of pins) this.registerPins(shape, pinClass, [SIDES[pin.face]], pin.position);
	}

	/**
	 * Register only labels that natural routes could not carry.
	 * @param edges The complete semantic relationships.
	 */
	labels(edges: readonly ElkExtendedEdge[]): void {
		for (const edge of edges) {
			if (!forcedLabel(edge)) continue;
			this.shape(`label_${edge.id}`, boxOf(edge.labels![0]!));
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
			this.registerPins(shape, pinClass, faces, position);
			this.classes.set(key, pinClass);
		}
		return new this.avoid.ConnEnd(shape, pinClass);
	}

	/**
	 * Register candidate physical pins under one shared native class.
	 * @param shape Native obstacle.
	 * @param pinClass Shared class selected by the connector.
	 * @param faces Candidate centers and outward directions.
	 * @param position Along-face position for a self-loop end.
	 */
	private registerPins(
		shape: object,
		pinClass: number,
		faces: readonly (typeof SIDES)[Face][],
		position: number,
	): void {
		for (const [x, y, direction] of faces) {
			const pin = new this.avoid.ShapeConnectionPin(
				shape,
				pinClass,
				x === 0.5 ? position : x,
				y === 0.5 ? position : y,
				true,
				0,
				direction,
			);
			pin.setExclusive(false);
		}
	}

	/**
	 * Attach to a card face, a frame's own divider, or its actual outer perimeter.
	 * @param id The semantic endpoint.
	 * @param other The opposite semantic endpoint.
	 * @param source Whether this is the source, distinguishing self-loop ends.
	 * @param kind The shared semantic port group.
	 * @returns An owned native endpoint.
	 */
	private endpoint(id: string, other: string, source: boolean, kind: string): ConnectionEnd {
		const node = this.nodes.get(id)!;
		const target = this.nodes.get(other)!;
		const kinds = this.kinds.get(id)!;
		const index = kinds.indexOf(kind);
		const position = (index + 0.5) / kinds.length;
		if (node === target)
			return this.pin(
				id,
				source ? "EAST" : "SOUTH",
				(index + (source ? 1 / 3 : 2 / 3)) / kinds.length,
			);
		if (!node.children?.length) return this.cardPin(id, kind, position);
		return this.frameEndpoint(node, target, source, position);
	}

	/**
	 * Attach to the frame divider or transparent outer perimeter.
	 * @param node The semantic frame.
	 * @param target The other endpoint.
	 * @param source Whether this end has no incoming arrowhead.
	 * @param position The shared kind position on each candidate face.
	 * @returns An owned native endpoint.
	 */
	private frameEndpoint(
		node: ElkNode,
		target: ElkNode,
		source: boolean,
		position: number,
	): ConnectionEnd {
		const solid = this.obstacles.get(node.id)!;
		const preferred = endpointFace(node, target);
		const { side, at } =
			source || internalFrame(node, target)
				? { side: preferred, at: facePoint(boxOf(node), preferred, position) }
				: this.arrivalPoint(node, target, position);
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
		return this.frameArrival(node.id, at, side, position);
	}

	/**
	 * Choose the nearest frame-face center with room for the physical arrival.
	 * A neighboring card can block the side facing the source while another
	 * face remains open; the frame's placement and insets do not need to grow.
	 * @param node The destination frame.
	 * @param target The source subject.
	 * @param position The shared kind position on each candidate face.
	 * @returns The nearest clear endpoint, or nearest candidate for native validation if crowded.
	 */
	private arrivalPoint(
		node: ElkNode,
		target: ElkNode,
		position: number,
	): { side: Face; at: Point } {
		const toward = boxCentre(boxOf(target));
		const candidates = FACES.map((side) => ({
			side,
			at: frameArrivalPoint(node, side, position),
		})).toSorted(
			(one, other) =>
				Math.hypot(one.at.x - toward.x, one.at.y - toward.y) -
				Math.hypot(other.at.x - toward.x, other.at.y - toward.y),
		);
		return (
			candidates.find(({ side, at }) => this.clearArrival(node.id, side, at, position)) ??
			candidates[0]!
		);
	}

	/**
	 * Check a candidate corridor against the same buffered obstacles libavoid sees.
	 * Its own shared corridor is reusable; another frame's arrival stays protected.
	 * @param frame The destination identity.
	 * @param side Its candidate face.
	 * @param at Its perimeter endpoint.
	 * @param position The shared kind position.
	 * @returns Whether its head and bend footprint is unobstructed.
	 */
	private clearArrival(frame: string, side: Face, at: Point, position: number): boolean {
		const corridor = inflate(arrivalCorridor(at, side), SHAPE_CLEARANCE);
		return ![...this.obstacles].some(
			([id, box]) =>
				id !== frame &&
				id !== `${frame}:approach:${side}:${position}` &&
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
	 * @param position The shared kind position.
	 * @returns The native endpoint shared by arrivals on this face.
	 */
	private frameArrival(id: string, at: Point, side: Face, position: number): ConnectionEnd {
		const key = `${id}:approach:${side}:${position}`;
		let pinClass = this.classes.get(key);
		if (pinClass === undefined) {
			const [x, y, direction] = SIDES[side];
			this.shape(key, arrivalCorridor(at, side));
			pinClass = this.classes.size + 1;
			this.registerPins(this.shapes.get(key)!, pinClass, [[1 - x, 1 - y, direction]], 0.5);
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
		const kind = relationshipKind(edge);
		const source = this.endpoint(from, to, true, kind);
		const target = this.endpoint(to, from, false, kind);
		if (forcedLabel(edge)) {
			const sourceBox = boxOf(this.nodes.get(from)!);
			const targetBox = boxOf(this.nodes.get(to)!);
			const returning = sourceBox.y + sourceBox.height / 2 > targetBox.y + targetBox.height / 2;
			const [entry, exit] = returning
				? (["SOUTH", "NORTH"] as const)
				: (["NORTH", "SOUTH"] as const);
			return [
				this.connect(source, this.pin(`label_${edge.id}`, entry)),
				this.connect(this.pin(`label_${edge.id}`, exit), target),
			];
		}
		return [this.connect(source, target)];
	}
}

/**
 * Locate a semantic perimeter point on a solid title face when they overlap.
 * A kind port can meet the title partway down a frame's east or west face.
 * @param box The title obstacle.
 * @param side The semantic endpoint face.
 * @param at The actual perimeter point.
 * @returns Its proportional title pin position, or nothing for a transparent perimeter.
 */
function positionOnFace(box: Box, side: Face, at: Point): number | undefined {
	const position =
		side === "EAST" || side === "WEST" ? (at.y - box.y) / box.height : (at.x - box.x) / box.width;
	const projected = facePoint(box, side, position);
	return position >= 0 &&
		position <= 1 &&
		Math.hypot(projected.x - at.x, projected.y - at.y) < 0.001
		? position
		: undefined;
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
	const length = APPROACH_STRAIGHT + BEND_RADIUS_MIN - SHAPE_CLEARANCE;
	const half = APPROACH_STRAIGHT / 2;
	return {
		x: at.x + (dx === 0 ? -half : Math.min(0, dx * length)),
		y: at.y + (dy === 0 ? -half : Math.min(0, dy * length)),
		width: dx === 0 ? 2 * half : length,
		height: dy === 0 ? 2 * half : length,
	};
}

/**
 * Whether natural label placement has requested a reserved straight run.
 * @param edge The relationship.
 * @returns Whether its measured label is a routing obstacle and waypoint.
 */
function forcedLabel(edge: ElkExtendedEdge): boolean {
	return edge.layoutOptions?.["archboard.route-label"] === "true" && Boolean(edge.labels?.length);
}

/**
 * Whether this frame endpoint refers to one of its own descendants.
 * @param node The endpoint.
 * @param target The opposite semantic endpoint.
 * @returns Whether it connects at the visible title divider.
 */
function internalFrame(node: ElkNode, target: ElkNode): boolean {
	return Boolean(node.children?.length) && contains(boxOf(node), boxOf(target));
}

/**
 * Face nearest the opposite semantic shape, without placement-engine port rules.
 * @param node The endpoint.
 * @param target The opposite semantic endpoint.
 * @returns The natural physical face.
 */
function endpointFace(node: ElkNode, target: ElkNode): Face {
	if (internalFrame(node, target)) return "SOUTH";
	return towardFace(boxOf(node), boxOf(target));
}

/**
 * Nearest cardinal face between two placed boxes.
 * @param box The endpoint's semantic bounds.
 * @param toward The opposite semantic bounds.
 * @returns The face toward the other shape's center.
 */
function towardFace(box: Box, toward: Box): Face {
	const dx = toward.x + toward.width / 2 - box.x - box.width / 2;
	const dy = toward.y + toward.height / 2 - box.y - box.height / 2;
	if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "EAST" : "WEST";
	return dy > 0 ? "SOUTH" : "NORTH";
}

/**
 * Copy a valid obstacle-free native polyline.
 * @param connection The router-owned connector.
 * @param id Relationship identity for diagnostics.
 * @returns Geometry independent of native lifetime.
 */
function pointsOf(connection: Connection, id: string): Point[] {
	if (!connection.hasValidRoute() || connection.hasCrossingObstacles())
		throw new Error(`Layout could not route relationship ${id} clear of obstacles`);
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
 * Publish only complete valid relationship routes.
 * @param edge The semantic relationship.
 * @param connections Its native route segments.
 */
function publish(edge: ElkExtendedEdge, connections: readonly Connection[]): void {
	const points = simplify(connections.flatMap((connection) => pointsOf(connection, edge.id)));
	if (points.length < 2 || points.some(invalidPoint))
		throw new Error(`Layout returned an invalid orthogonal route for relationship ${edge.id}`);
	edge.sections = [
		{
			id: `${edge.id}:route`,
			startPoint: points[0]!,
			bendPoints: points.slice(1, -1),
			endPoint: points.at(-1)!,
		},
	];
}

/**
 * Apply reserved label coordinates after placement and before native obstacles are registered.
 * @param edges Complete placed relationships.
 */
function positionReservedLabels(edges: readonly ElkExtendedEdge[]): void {
	for (const edge of edges) positionReservedLabel(edge);
}

/**
 * Apply the accepted physical position of one reserved label when both axes exist.
 * @param edge One placed relationship.
 */
function positionReservedLabel(edge: ElkExtendedEdge): void {
	const label = edge.labels?.[0];
	const options = edge.layoutOptions;
	if (!label || !options) return;
	const x = options["archboard.route-label.x"];
	const y = options["archboard.route-label.y"];
	if (x === undefined || y === undefined) return;
	Object.assign(label, { x: Number(x), y: Number(y) });
}

/**
 * Route placed cards and title bands through one native obstacle scene.
 * @param avoid The initialized libavoid module.
 * @param graph Complete globally placed semantic geometry.
 * @returns The hierarchy with finite orthogonal relationship routes.
 */
export function routeGraph(avoid: AvoidEngine, graph: ElkNode): ElkNode {
	const scene = new RoutingScene(avoid);
	try {
		const edges = graph.edges ?? [];
		positionReservedLabels(edges);
		for (const node of graph.children ?? []) scene.visit(node);
		scene.ports(edges);
		scene.labels(edges);
		const routes = new Map(edges.map((edge) => [edge.id, scene.relationship(edge)]));
		scene.router.processTransaction();
		for (const edge of edges) publish(edge, routes.get(edge.id)!);
		return graph;
	} finally {
		scene.router.delete();
	}
}

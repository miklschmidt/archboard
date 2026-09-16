// A predecessor contributes constraints to ELK, never a second pass moving cards after routing.
import type { ElkNode, ElkExtendedEdge, ElkLabel, LayoutOptions } from "elkjs/lib/elk-api";
import type { VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
	DrawingNode,
	DrawingEdge,
	MeasuredLabel,
	MeasuredArchitecture,
} from "@/runtime/semantic-renderer/lib/drawing";
import {
	nodePositionHints,
	portHint,
} from "@/runtime/semantic-renderer/lib/layout/compound-node-hints";
import type { NodeHintRoutes } from "@/runtime/semantic-renderer/lib/layout/compound-label-space";
import type { Point } from "@/runtime/semantic-renderer/lib/geometry";
import { COMPOUND_OPTIONS } from "@/runtime/semantic-renderer/lib/layout/compound-graph";
import {
	SOLVING,
	faceGeometry,
	pointOnFace,
	isNearFlank,
	sharedFlank,
	FACES,
	type Flank,
} from "@/runtime/semantic-renderer/lib/layout/reading";

/** Where the seeding pass put each attachment, and on which face, by port id. */
interface Seeded {
	readonly ports: Map<string, Point>;
	readonly portSides: Map<string, string>;
}

/** Keep the prior layer/order while allowing the engine to make room. */
const PREDECESSOR_OPTIONS: LayoutOptions = {
	"elk.layered.cycleBreaking.strategy": "INTERACTIVE",
	"elk.layered.layering.strategy": "INTERACTIVE",
	"elk.layered.crossingMinimization.strategy": "INTERACTIVE",
	"elk.layered.nodePlacement.strategy": "INTERACTIVE",
	"elk.separateConnectedComponents": "false",
};

/**
 * Preserve allocated room when text shrinks within the same depiction.
 * A former container becomes an intrinsic card when its last visible child moves.
 * @param measured Current text and minimum dimensions.
 * @param predecessor The previous drawing of the same view.
 * @returns Current text with nonshrinking card and frame dimensions.
 */
function preserveSizes(
	measured: MeasuredArchitecture,
	predecessor: ArchitectureDrawing,
): MeasuredArchitecture {
	const previous = new Map(
		[...predecessor.cards, ...predecessor.containers].map((node) => [node.measured.node.id, node]),
	);
	return {
		...measured,
		nodes: new Map(
			[...measured.nodes].map(([id, value]) => {
				const before = previous.get(id);
				return [
					id,
					before === undefined ||
					(value.headerHeight === 0) !== (before.measured.headerHeight === 0)
						? value
						: {
								...value,
								width: Math.max(value.width, before.box.width),
								height: Math.max(value.height, before.box.height),
							},
				];
			}),
		),
	};
}

/**
 * Check whether current label text still fits its allocated route box.
 * @param before Prior label and geometry.
 * @param label Current measurement, if this edge is named.
 * @returns Whether the existing label geometry can be reused.
 */
function labelFits(before: DrawingEdge["label"], label: MeasuredLabel | undefined): boolean {
	if (before === undefined || label === undefined)
		return before === undefined && label === undefined;
	return label.width <= before.box.width && label.height <= before.box.height;
}

/**
 * Reuse exact geometry when only words, emphasis or other marks changed.
 * @param content Current subjects and relationships.
 * @param measured Their current text measurements.
 * @param predecessor Geometry from the preceding reading of this view.
 * @returns Updated paint inputs on the same geometry, or undefined if layout changed.
 */
function reuseDrawing(
	content: VariantContent,
	measured: MeasuredArchitecture,
	predecessor: ArchitectureDrawing,
): ArchitectureDrawing | undefined {
	const nodes = [...predecessor.cards, ...predecessor.containers];
	if (nodes.length !== measured.nodes.size || predecessor.edges.length !== content.edges.length)
		return undefined;
	if (
		nodes.some((before) => {
			const now = measured.nodes.get(before.measured.node.id);
			return (
				now === undefined ||
				now.node.parent !== before.measured.node.parent ||
				now.width > before.box.width ||
				now.height > before.box.height ||
				now.headerHeight !== before.measured.headerHeight
			);
		})
	)
		return undefined;
	const edges = new Map(content.edges.map((edge) => [edge.id, edge]));
	if (
		predecessor.edges.some((before) => {
			const edge = edges.get(before.edge.id),
				label = measured.labels.get(before.edge.id);
			return (
				edge?.from !== before.edge.from ||
				edge.to !== before.edge.to ||
				!labelFits(before.label, label)
			);
		})
	)
		return undefined;
	/**
	 * Refresh text and semantic marks while retaining the resolved box.
	 * @param node The previously drawn subject.
	 * @returns Its latest measured content on the same geometry.
	 */
	const update = (node: DrawingNode): DrawingNode => ({
		...node,
		measured: measured.nodes.get(node.measured.node.id)!,
	});
	return {
		...predecessor,
		cards: predecessor.cards.map(update),
		containers: predecessor.containers.map(update),
		edges: predecessor.edges.map((before) => ({
			...before,
			edge: edges.get(before.edge.id)!,
			...(before.label === undefined
				? {}
				: { label: { ...before.label, measured: measured.labels.get(before.edge.id)! } }),
		})),
	};
}

/**
 * Seed current labels between their current endpoint attachments.
 * @param graph The root graph carrying the engine edge sections.
 * @param ports Preliminary attachment hints in global coordinates.
 */
function seedLabels(graph: ElkNode, ports: ReadonlyMap<string, Point>): void {
	for (const edge of graph.edges!) {
		const [from, to] = [ports.get(edge.sources[0]!), ports.get(edge.targets[0]!)];
		if (from === undefined || to === undefined) continue; // engine-attached: no port to seed between
		for (const label of edge.labels!) {
			label.x = (from.x + to.x - label.width!) / 2;
			label.y = (from.y + to.y - label.height!) / 2;
		}
	}
}

/** One allocated horizontal route corridor. */
interface RouteCorridor {
	readonly x: number;
	readonly width: number;
}

/**
 * Apply the interactive options for one containment level.
 * @param existing Options already owned by the measured graph.
 * @param crossesHierarchy Whether boundary routing needs a hierarchy-wide sweep.
 * @returns The complete predecessor layout options for this level.
 */
function predecessorLayoutOptions(
	existing: LayoutOptions | undefined,
	crossesHierarchy: boolean,
): LayoutOptions {
	if (!crossesHierarchy) return { ...existing, ...PREDECESSOR_OPTIONS };
	return {
		...existing,
		...PREDECESSOR_OPTIONS,
		"elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
		"elk.layered.crossingMinimization.semiInteractive": "true",
	};
}

/**
 * Preserve inherited attachment offsets when the face still has room for every port.
 * @param node Current measured card and ordered ports.
 * @param point Its seeded global position.
 * @param before Its previous geometry, when retained.
 * @param routes Retained routes identifying previous attachments.
 * @returns Final attachment hints, with crowded faces using the current distribution.
 */
function inheritedPorts(
	node: ElkNode,
	point: Point,
	before: DrawingNode | undefined,
	routes: NodeHintRoutes,
): Map<string, Point> {
	const result = new Map(node.ports!.map((port) => [port.id, portHint(node, port, point)]));
	if (before === undefined) return result;
	for (const side of FACES) {
		const { along: axis, across: cross } = faceGeometry(side);
		const ports = node.ports!.filter((port) => port.layoutOptions!["elk.port.side"] === side);
		const candidates = ports.map((port) => {
			const route = routes.previous.find(
				(edge) => port.id === edge.edge.id + ":from" || port.id === edge.edge.id + ":to",
			);
			if (route === undefined) return result.get(port.id)!;
			const attachment = port.id.endsWith(":from")
				? route.curve.from
				: route.curve.segments.at(-1)!.to;
			const face = pointOnFace(side, before.box, 0)[cross];
			if (Math.abs(attachment[cross] - face) > 0.01) return result.get(port.id)!;
			return { ...result.get(port.id)!, [axis]: point[axis] + attachment[axis] - before.box[axis] };
		});
		const ordered = candidates.toSorted((one, other) => one[axis] - other[axis]);
		const gap = Number(COMPOUND_OPTIONS["elk.spacing.portPort"]);
		if (
			ordered.some(
				(candidate, index) => index > 0 && candidate[axis] - ordered[index - 1]![axis] < gap,
			)
		)
			continue;
		for (const [index, port] of ports.entries()) {
			const candidate = candidates[index]!;
			if (candidate[axis] !== result.get(port.id)![axis])
				node.layoutOptions = { ...node.layoutOptions, "elk.portConstraints": "FIXED_POS" };
			result.set(port.id, candidate);
		}
	}
	return result;
}

/**
 * Seed one containment level in its actual parent coordinate system.
 * @param parent The engine parent being visited.
 * @param origin Its global predecessor or suggested position.
 * @param content Current architectural relationships.
 * @param previous Stable subjects in the predecessor.
 * @param crossesHierarchy Whether boundary routing needs a hierarchy-wide sweep.
 * @param seeded Where everything collected so far will be.
 * @param routes Current badge measurements and prior global corridors.
 */
function seedNodes(
	parent: ElkNode,
	origin: Point,
	content: VariantContent,
	previous: ReadonlyMap<string, DrawingNode>,
	crossesHierarchy: boolean,
	seeded: Seeded,
	routes: NodeHintRoutes,
): void {
	parent.layoutOptions = predecessorLayoutOptions(parent.layoutOptions, crossesHierarchy);
	const children = parent.children ?? [];
	const siblings = children.flatMap((node) => {
		const old = previous.get(node.id);
		return old === undefined ? [] : [old];
	});
	const right =
		siblings.length === 0
			? origin.x + 48
			: Math.max(...siblings.map((node) => node.box.x + node.box.width)) + 72;
	const positions = nodePositionHints(children, content, previous, right, routes);
	for (const node of children) {
		const point = positions.get(node.id)!;
		const attachments = inheritedPorts(node, point, previous.get(node.id), routes);
		for (const port of node.ports!) {
			const attachment = attachments.get(port.id)!;
			seeded.ports.set(port.id, attachment);
			seeded.portSides.set(port.id, port.layoutOptions!["elk.port.side"]!);
			port.x = attachment.x - point.x;
			port.y = attachment.y - point.y;
		}
		node.x = point.x - origin.x;
		node.y = point.y - origin.y;
		node.layoutOptions = { ...node.layoutOptions, "elk.position": `(${node.x},${node.y})` };
		if (node.children !== undefined)
			seedNodes(node, point, content, previous, crossesHierarchy, seeded, routes);
	}
}

/**
 * Keep an inherited lane or place a new lane outside both attachments.
 * @param side Shared endpoint face.
 * @param from Source attachment.
 * @param to Target attachment.
 * @param points Prior route points or the direct current endpoints.
 * @param inherited Whether the points describe an inherited route.
 * @returns The horizontal corridor coordinate.
 */
function initialLaneX(
	side: string,
	from: Point,
	to: Point,
	points: readonly Point[],
	inherited: boolean,
): number {
	const beside = isNearFlank(side);
	if (inherited)
		return beside
			? Math.min(...points.map((point) => point.x))
			: Math.max(...points.map((point) => point.x));
	const gap = Number(COMPOUND_OPTIONS["elk.spacing.edgeNode"]);
	return beside ? Math.min(from.x, to.x) - gap : Math.max(from.x, to.x) + gap;
}

/**
 * Move a parallel lane far enough to clear the one already allocated.
 * @param x Preferred horizontal coordinate.
 * @param side Shared endpoint face.
 * @param width Current label width.
 * @param parallel Previously allocated parallel corridor.
 * @returns A horizontal coordinate with enough separation.
 */
function clearParallelLane(
	x: number,
	side: string,
	width: number,
	parallel: RouteCorridor | undefined,
): number {
	if (parallel === undefined) return x;
	const spacing = Number(
		COMPOUND_OPTIONS[
			width + parallel.width > 0 ? "elk.spacing.labelLabel" : "elk.spacing.edgeEdge"
		],
	);
	const distance = (width + parallel.width) / 2 + spacing;
	return isNearFlank(side)
		? Math.min(x, parallel.x - distance)
		: Math.max(x, parallel.x + distance);
}

/**
 * Resolve the usable route from a matching predecessor edge.
 * @param before Prior drawn edge.
 * @param current Current semantic edge.
 * @returns Prior route points when both endpoints are unchanged.
 */
function inheritedRoute(
	before: DrawingEdge | undefined,
	current: VariantContent["edges"][number],
): Point[] | undefined {
	if (before === undefined || before.edge.from !== current.from || before.edge.to !== current.to)
		return undefined;
	return [before.curve.from, ...before.curve.segments.map((segment) => segment.to)];
}

/**
 * Put one edge section on the route ELK should inherit.
 * @param edge Current engine edge.
 * @param points Ordered route points.
 */
function setRoute(edge: NonNullable<ElkNode["edges"]>[number], points: readonly Point[]): void {
	edge.sections = [
		{
			id: `${edge.id}:predecessor`,
			startPoint: points[0]!,
			endPoint: points.at(-1)!,
			bendPoints: points.slice(1, -1),
		},
	];
}

/**
 * Allocate and seed one edge whose endpoints share a horizontal face.
 * @param edge Current engine edge.
 * @param current Current semantic edge.
 * @param side Shared endpoint face.
 * @param from Source attachment.
 * @param to Target attachment.
 * @param priorPoints Matching predecessor route, when one exists.
 * @param corridors Corridors already allocated during this pass.
 */
function seedHorizontalRoute(
	edge: NonNullable<ElkNode["edges"]>[number],
	current: VariantContent["edges"][number],
	side: Flank,
	from: Point,
	to: Point,
	priorPoints: readonly Point[] | undefined,
	corridors: Map<string, RouteCorridor>,
): void {
	const points = priorPoints ?? [from, to];
	const width = Math.max(0, ...edge.labels!.map((label) => label.width!));
	const key = current.from + ":" + current.to + ":" + side;
	const x = clearParallelLane(
		initialLaneX(side, from, to, points, priorPoints !== undefined),
		side,
		width,
		corridors.get(key),
	);
	corridors.set(key, { x, width });
	setRoute(edge, [from, { x, y: from.y }, { x, y: to.y }, to]);
	for (const label of edge.labels!) label.x = x - label.width! / 2;
}

/**
 * Seed one current edge with its inherited or newly allocated corridor.
 * @param edge Current engine edge.
 * @param content Current architectural relationships.
 * @param priorRoutes Prior drawn edges by identity.
 * @param ports Preliminary attachments by port id.
 * @param portSides Attachment faces by port id.
 * @param corridors Corridors already allocated during this pass.
 */
function seedRoute(
	edge: NonNullable<ElkNode["edges"]>[number],
	content: VariantContent,
	priorRoutes: ReadonlyMap<string, DrawingEdge>,
	ports: ReadonlyMap<string, Point>,
	portSides: ReadonlyMap<string, string>,
	corridors: Map<string, RouteCorridor>,
): void {
	// A joined predecessor route cannot describe only one frame-boundary fragment.
	if (edge.targets[0] !== `${edge.id}:to`) return;
	const before = priorRoutes.get(edge.id);
	const current = content.edges.find((candidate) => candidate.id === edge.id);
	if (current === undefined) return;
	const [from, to] = [ports.get(edge.sources[0]!), ports.get(edge.targets[0])];
	if (from === undefined || to === undefined) return; // engine-attached
	const side = portSides.get(edge.sources[0]!);
	const priorPoints = inheritedRoute(before, current);
	const horizontalSide = sharedFlank(side, portSides.get(edge.targets[0]));
	if (horizontalSide !== undefined) {
		seedHorizontalRoute(edge, current, horizontalSide, from, to, priorPoints, corridors);
		return;
	}
	seedTopRoute(edge, from, to, side, portSides.get(edge.targets[0]), priorPoints);
}

/**
 * Seed a left departure on its above-entry target corridor or inherited route.
 * @param edge Current relationship.
 * @param from Current source attachment.
 * @param to Current target attachment.
 * @param side Source face.
 * @param targetSide Target face.
 * @param priorPoints Matching predecessor route when available.
 */
function seedTopRoute(
	edge: ElkExtendedEdge,
	from: Point,
	to: Point,
	side: string | undefined,
	targetSide: string | undefined,
	priorPoints: readonly Point[] | undefined,
): void {
	// A departure by the beside flank can turn directly onto the corridor that
	// enters the target from behind. Seed its label on that same corridor so
	// ELK does not invent a middle lane.
	if (isNearFlank(side) && targetSide === SOLVING.forwardIn) {
		setRoute(edge, [from, { x: to.x, y: from.y }, to]);
		for (const label of edge.labels!) label.x = to.x - label.width! / 2;
		return;
	}
	if (priorPoints !== undefined) setRoute(edge, priorPoints);
}

/**
 * Read the vertical free-space guides already assigned to a relationship.
 * @param edge Current input route sections.
 * @returns Nonzero vertical segments in input coordinates.
 */
function verticalGuides(edge: ElkExtendedEdge): { from: Point; to: Point }[] {
	return (edge.sections ?? []).flatMap((route) => {
		const points = [route.startPoint, ...(route.bendPoints ?? []), route.endPoint];
		return points.slice(1).flatMap((to, index) => {
			const from = points[index]!;
			return from.x === to.x && from.y !== to.y ? [{ from, to }] : [];
		});
	});
}

/**
 * Move a label corridor outward until its measured box clears crossing guides.
 * @param x Preferred corridor coordinate.
 * @param side Shared horizontal attachment face.
 * @param label Current measured label and its input row.
 * @param corridors Other vertical guides, ordered toward the outside.
 * @returns A corridor with the same clearance ELK reserves around label dummies.
 */
function clearLabelX(
	x: number,
	side: Flank,
	label: ElkLabel,
	corridors: ReturnType<typeof verticalGuides>,
): number {
	const clearance = label.width! / 2 + Number(COMPOUND_OPTIONS["elk.spacing.edgeNode"]);
	for (const { from, to } of corridors) {
		if (label.y! + label.height! < Math.min(from.y, to.y) || label.y! > Math.max(from.y, to.y))
			continue;
		if (Math.abs(x - from.x) < clearance)
			x = isNearFlank(side) ? from.x - clearance : from.x + clearance;
	}
	return x;
}

/**
 * Keep a flank label and its whole guide clear of crossing route corridors.
 * @param edges Current route hints, in allocation order.
 * @param portSides Current endpoint faces.
 */
function clearFlankLabels(
	edges: NonNullable<ElkNode["edges"]>,
	portSides: ReadonlyMap<string, string>,
): void {
	const flanks = edges.filter(
		(candidate) =>
			candidate.labels!.length > 0 && candidate.sections?.[0]?.bendPoints?.length === 2,
	);
	// Move inner lanes before testing outer labels against them. A provisional
	// inner lane can otherwise push an outer guide through an adjacent card,
	// even though that inner lane is itself about to move clear.
	/**
	 * Order the beside flank's lanes inward first, and the return flank's likewise.
	 * @param edge A flank with an allocated corridor.
	 * @returns Its inward-first horizontal sort coordinate.
	 */
	const inwardOrder = (edge: ElkExtendedEdge): number =>
		edge.sections![0]!.bendPoints![0]!.x * (isNearFlank(portSides.get(edge.sources[0]!)) ? -1 : 1);
	for (const edge of flanks.toSorted((one, other) => inwardOrder(one) - inwardOrder(other))) {
		const side = sharedFlank(portSides.get(edge.sources[0]!), portSides.get(edge.targets[0]!));
		if (side === undefined) continue;
		const section = edge.sections![0]!;
		const corridors = edges
			.filter((other) => other !== edge)
			.flatMap(verticalGuides)
			.toSorted((one, other) =>
				isNearFlank(side) ? other.from.x - one.from.x : one.from.x - other.from.x,
			);
		let x = section.bendPoints![0]!.x;
		for (const label of edge.labels!) x = clearLabelX(x, side, label, corridors);
		for (const point of section.bendPoints!) point.x = x;
		for (const label of edge.labels!) label.x = x - label.width! / 2;
	}
}

/**
 * Restore stable node positions as parent-relative interactive input hints.
 * @param graph The measured hierarchy that ELK will solve.
 * @param content Current architectural relationships.
 * @param predecessor The preceding complete drawing.
 */
function seedPredecessor(
	graph: ElkNode,
	content: VariantContent,
	predecessor: ArchitectureDrawing,
): void {
	const previous = new Map(
		[...predecessor.cards, ...predecessor.containers].map((node) => [node.measured.node.id, node]),
	);
	const seeded: Seeded = { ports: new Map(), portSides: new Map() };
	const { ports, portSides } = seeded;
	const parents = new Map(content.nodes.map((node) => [node.id, node.parent]));
	const crossesHierarchy = content.edges.some(
		(edge) => parents.get(edge.from) !== parents.get(edge.to),
	);
	const represented = new Map(content.edges.map((edge) => [edge.id, edge]));
	const retainedRoutes = predecessor.edges.filter((before) => {
		const edge = represented.get(before.edge.id);
		return edge?.from === before.edge.from && edge.to === before.edge.to;
	});
	seedNodes(graph, { x: 0, y: 0 }, content, previous, crossesHierarchy, seeded, {
		current: graph.edges!,
		previous: retainedRoutes,
	});
	seedLabels(graph, ports);
	// Allocate current labels and parallel lanes together; only cards retain placement.
	const priorRoutes = new Map(predecessor.edges.map((edge) => [edge.edge.id, edge]));
	const routeOrder = graph.edges!.toSorted(
		(one, other) => Number(priorRoutes.has(other.id)) - Number(priorRoutes.has(one.id)),
	);
	const corridors = new Map<string, RouteCorridor>();
	for (const edge of routeOrder) seedRoute(edge, content, priorRoutes, ports, portSides, corridors);
	clearFlankLabels(routeOrder, portSides);
}

export { preserveSizes, reuseDrawing, seedPredecessor };

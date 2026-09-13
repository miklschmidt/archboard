// A predecessor contributes constraints to ELK, never a second layout pass
// that moves individual cards after their routes have been solved.
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

/** Keep the prior layer/order while allowing the engine to make room. */
const PREDECESSOR_OPTIONS: LayoutOptions = {
	"elk.layered.cycleBreaking.strategy": "INTERACTIVE",
	"elk.layered.layering.strategy": "INTERACTIVE",
	"elk.layered.crossingMinimization.strategy": "INTERACTIVE",
	"elk.layered.nodePlacement.strategy": "INTERACTIVE",
	"elk.separateConnectedComponents": "false",
};

/**
 * Preserve room already allocated to existing subjects when their text shrinks.
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
					before === undefined
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
		const from = ports.get(edge.sources[0]!)!,
			to = ports.get(edge.targets[0]!)!;
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
 * Seed one containment level in its actual parent coordinate system.
 * @param parent The engine parent being visited.
 * @param origin Its global predecessor or suggested position.
 * @param content Current architectural relationships.
 * @param previous Stable subjects in the predecessor.
 * @param crossesHierarchy Whether boundary routing needs a hierarchy-wide sweep.
 * @param ports Preliminary attachments collected by port id.
 * @param portSides Attachment faces collected by port id.
 * @param routes Current badge measurements and prior global corridors.
 */
function seedNodes(
	parent: ElkNode,
	origin: Point,
	content: VariantContent,
	previous: ReadonlyMap<string, DrawingNode>,
	crossesHierarchy: boolean,
	ports: Map<string, Point>,
	portSides: Map<string, string>,
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
		for (const port of node.ports!) {
			const attachment = portHint(node, port, point);
			ports.set(port.id, attachment);
			portSides.set(port.id, port.layoutOptions!["elk.port.side"]!);
			port.x = attachment.x - point.x;
			port.y = attachment.y - point.y;
		}
		node.x = point.x - origin.x;
		node.y = point.y - origin.y;
		node.layoutOptions = { ...node.layoutOptions, "elk.position": `(${node.x},${node.y})` };
		if (node.children !== undefined)
			seedNodes(node, point, content, previous, crossesHierarchy, ports, portSides, routes);
	}
}

/**
 * Find the horizontal attachment face shared by two endpoints.
 * @param side Source attachment face.
 * @param targetSide Target attachment face.
 * @returns Their shared horizontal face, if they have one.
 */
function sharedHorizontalSide(
	side: string | undefined,
	targetSide: string | undefined,
): "WEST" | "EAST" | undefined {
	if ((side === "WEST" || side === "EAST") && side === targetSide) return side;
	return undefined;
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
	if (inherited)
		return side === "WEST"
			? Math.min(...points.map((point) => point.x))
			: Math.max(...points.map((point) => point.x));
	const gap = Number(COMPOUND_OPTIONS["elk.spacing.edgeNode"]);
	return side === "WEST" ? Math.min(from.x, to.x) - gap : Math.max(from.x, to.x) + gap;
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
	return side === "WEST" ? Math.min(x, parallel.x - distance) : Math.max(x, parallel.x + distance);
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
	side: "WEST" | "EAST",
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
	const from = ports.get(edge.sources[0]!)!,
		to = ports.get(edge.targets[0])!;
	const side = portSides.get(edge.sources[0]!);
	const priorPoints = inheritedRoute(before, current);
	const horizontalSide = sharedHorizontalSide(side, portSides.get(edge.targets[0]));
	if (horizontalSide !== undefined) {
		seedHorizontalRoute(edge, current, horizontalSide, from, to, priorPoints, corridors);
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
	side: "WEST" | "EAST",
	label: ElkLabel,
	corridors: ReturnType<typeof verticalGuides>,
): number {
	const clearance = label.width! / 2 + Number(COMPOUND_OPTIONS["elk.spacing.edgeNode"]);
	for (const { from, to } of corridors) {
		if (label.y! + label.height! < Math.min(from.y, to.y) || label.y! > Math.max(from.y, to.y))
			continue;
		if (Math.abs(x - from.x) < clearance)
			x = side === "WEST" ? from.x - clearance : from.x + clearance;
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
	for (const edge of edges.filter(
		(candidate) =>
			candidate.labels!.length > 0 && candidate.sections?.[0]?.bendPoints?.length === 2,
	)) {
		const side = sharedHorizontalSide(
			portSides.get(edge.sources[0]!),
			portSides.get(edge.targets[0]!),
		);
		if (side === undefined) continue;
		const section = edge.sections![0]!;
		const corridors = edges
			.filter((other) => other !== edge)
			.flatMap(verticalGuides)
			.toSorted((one, other) =>
				side === "WEST" ? other.from.x - one.from.x : one.from.x - other.from.x,
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
	const ports = new Map<string, Point>();
	const portSides = new Map<string, string>();
	const parents = new Map(content.nodes.map((node) => [node.id, node.parent]));
	const crossesHierarchy = content.edges.some(
		(edge) => parents.get(edge.from) !== parents.get(edge.to),
	);
	const represented = new Map(content.edges.map((edge) => [edge.id, edge]));
	const retainedRoutes = predecessor.edges.filter((before) => {
		const edge = represented.get(before.edge.id);
		return edge?.from === before.edge.from && edge.to === before.edge.to;
	});
	seedNodes(graph, { x: 0, y: 0 }, content, previous, crossesHierarchy, ports, portSides, {
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

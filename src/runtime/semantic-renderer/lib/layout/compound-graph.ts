// Semantic containment and measured text become one compound graph. ELK owns
// the coordinates; these constraints express only the diagram's reading order.
import type { ElkExtendedEdge, ElkLabel, ElkNode, ElkPort, LayoutOptions } from "elkjs/lib/elk-api";
import type { SemanticEdge, SemanticNode, VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
	DrawingNode,
	MeasuredArchitecture,
	MeasuredNode,
} from "@/runtime/semantic-renderer/lib/drawing";
import type { Point } from "@/runtime/semantic-renderer/lib/geometry";
import { pointAt } from "@/runtime/semantic-renderer/lib/layout/curves";
import { rankNodes } from "@/runtime/semantic-renderer/lib/layout/rank";

/** Room for a route alongside a card or inside its containing frame. */
const FRAME_INSET = 48;
/** The same air separates every title from the content below it. */
const HEADER_AIR = 24;

/** Defaults apply at every hierarchy level, not only the root graph. */
const COMPOUND_OPTIONS: LayoutOptions = {
	"elk.algorithm": "layered",
	"elk.direction": "DOWN",
	"elk.edgeRouting": "ORTHOGONAL",
	"elk.edgeLabels.inline": "true",
	"elk.layered.edgeLabels.centerLabelPlacementStrategy": "TAIL_LAYER",
	"elk.hierarchyHandling": "INCLUDE_CHILDREN",
	"elk.json.shapeCoords": "ROOT",
	"elk.json.edgeCoords": "ROOT",
	"elk.randomSeed": "1",
	"elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
	"elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
	"elk.layered.mergeEdges": "false",
	"elk.layered.mergeHierarchyEdges": "false",
	"elk.spacing.nodeNode": "72",
	"elk.spacing.componentComponent": "96",
	"elk.spacing.edgeNode": "24",
	"elk.spacing.edgeEdge": "20",
	"elk.spacing.labelNode": "24",
	"elk.spacing.labelLabel": "24",
	"elk.spacing.edgeLabel": "12",
	"elk.spacing.portPort": "24",
	"elk.spacing.nodeSelfLoop": "24",
	"elk.layered.spacing.nodeNodeBetweenLayers": "24",
	"elk.layered.spacing.edgeNodeBetweenLayers": "20",
	"elk.layered.spacing.edgeEdgeBetweenLayers": "20",
};

/** The two attachment faces chosen before coordinates exist. */
type PortSides = readonly [
	"NORTH" | "SOUTH" | "WEST" | "EAST",
	"NORTH" | "SOUTH" | "WEST" | "EAST",
];

/**
 * Whether a leftward departure can descend onto the target's top face.
 * @param edge New connection between existing cards.
 * @param predecessor The geometry whose arrangement should remain recognizable.
 * @returns Whether the target center lies to the left of the source's exit.
 */
function hasTopApproach(edge: SemanticEdge, predecessor: ArchitectureDrawing | undefined): boolean {
	if (predecessor === undefined) return false;
	const from = predecessor.cards.find((node) => node.measured.node.id === edge.from);
	const to = predecessor.cards.find((node) => node.measured.node.id === edge.to);
	return from !== undefined && to !== undefined && to.box.x + to.box.width / 2 < from.box.x;
}

/**
 * Adjacent forward steps are direct; skips and returns occupy opposite flanks.
 * @param edge The connection being read.
 * @param ranks The deterministic dependency ranks, with cycles broken in document order.
 * @param nested Whether the connection crosses a containment boundary.
 * @param predecessor Existing geometry for choosing a shorter new skip attachment.
 * @returns The source and target attachment faces.
 */
function sidesOf(
	edge: SemanticEdge,
	ranks: ReadonlyMap<string, number>,
	nested: boolean,
	predecessor?: ArchitectureDrawing,
): PortSides {
	// rankNodes assigns every node before edge attachment begins.
	const distance = ranks.get(edge.to)! - ranks.get(edge.from)!;
	if (distance <= 0) return ["EAST", "EAST"];
	if (nested) return ["WEST", "WEST"];
	if (distance === 1) return ["SOUTH", "NORTH"];
	return ["WEST", hasTopApproach(edge, predecessor) ? "NORTH" : "WEST"];
}

/**
 * A distinct port for each end prevents unrelated relationships sharing a path.
 * @param id The internal endpoint id, derived from the semantic edge id.
 * @param side The face to use; ELK chooses the location on that face.
 * @param rank The dependency rank of the endpoint at the other end.
 * @returns The engine's endpoint.
 */
function portOf(id: string, side: PortSides[number], rank: number): ElkPort {
	return {
		id,
		width: 0,
		height: 0,
		layoutOptions: {
			"elk.port.side": side,
			"elk.port.index": String(side === "EAST" ? -rank : rank),
		},
	};
}

/**
 * Convert measured dimensions to the graph's fixed card or expandable frame.
 * @param measured The complete text measurement.
 * @returns A node awaiting its children and ports.
 */
function nodeOf(measured: MeasuredNode): ElkNode {
	const { node, width, height, headerHeight } = measured;
	const result: ElkNode = {
		id: node.id,
		width,
		height,
		ports: [],
		layoutOptions: { "elk.portConstraints": "FIXED_ORDER" },
	};
	if (headerHeight > 0) {
		result.children = [];
		result.layoutOptions = {
			...result.layoutOptions,
			"elk.padding": `[top=${headerHeight + HEADER_AIR},left=${FRAME_INSET},bottom=${FRAME_INSET},right=${FRAME_INSET}]`,
			"elk.nodeSize.constraints": "MINIMUM_SIZE",
			"elk.nodeSize.minimum": `(${width},${height})`,
		};
	}
	return result;
}

/**
 * Preserve the board's parent links and document order in the engine graph.
 * @param nodes The semantic nodes in their authored order.
 * @param engineNodes The measured engine nodes keyed by semantic id.
 * @returns The nodes with no parent in this view.
 */
function containNodes(
	nodes: readonly SemanticNode[],
	engineNodes: ReadonlyMap<string, ElkNode>,
): ElkNode[] {
	const roots: ElkNode[] = [];
	for (const node of nodes) {
		const engineNode = engineNodes.get(node.id);
		const parent = node.parent === undefined ? undefined : engineNodes.get(node.parent);
		if (engineNode !== undefined) {
			(parent?.children ?? roots).push(engineNode);
		}
	}
	return roots;
}

/**
 * Give the engine the complete padded label dimensions and its display lines.
 * @param edge The semantic relationship carrying these words.
 * @param measured The dimensions settled before layout.
 * @returns One label for named relationships, otherwise none.
 */
function labelsOf(edge: SemanticEdge, measured: MeasuredArchitecture): ElkLabel[] {
	const label = measured.labels.get(edge.id);
	if (label === undefined) {
		return [];
	}
	return [
		{
			id: `${edge.id}:label`,
			text: label.runs.map((run) => run.text).join("\n"),
			width: label.width,
			height: label.height,
			layoutOptions: { "elk.edgeLabels.placement": "CENTER" },
		},
	];
}

/**
 * Read the inclusion path from a subject to the root of this view.
 * @param id The subject being connected.
 * @param measured The semantic subjects present in this view.
 * @returns The subject followed by its ancestors, nearest first.
 */
function ancestryOf(id: string, measured: MeasuredArchitecture): string[] {
	const parent = measured.nodes.get(id)?.node.parent;
	return parent === undefined || !measured.nodes.has(parent)
		? [id]
		: [id, ...ancestryOf(parent, measured)];
}

/**
 * Identify only the frames an edge must leave and enter, in traversal order.
 * @param edge The semantic relationship.
 * @param measured The existing inclusion tree.
 * @returns The intervening frame ids, without their shared ancestor.
 */
function boundariesOf(edge: SemanticEdge, measured: MeasuredArchitecture): string[] {
	const from = ancestryOf(edge.from, measured);
	const to = ancestryOf(edge.to, measured);
	const common = from.find((id) => to.includes(id));
	const leaving = from.slice(1, common === undefined ? undefined : from.indexOf(common));
	const entering = to.slice(1, common === undefined ? undefined : to.indexOf(common));
	return [...leaving, ...entering.toReversed()];
}

/**
 * One explicit boundary port is shared by the two adjacent edge sections.
 * @param edge The semantic relationship that owns the crossing.
 * @param boundaries Frames in traversal order.
 * @param nodes The engine hierarchy being constructed.
 * @param side The flank used by this relationship.
 * @returns Their port ids, in the same traversal order.
 */
function boundaryPorts(
	edge: SemanticEdge,
	boundaries: readonly string[],
	nodes: ReadonlyMap<string, ElkNode>,
	side: PortSides[number],
): string[] {
	return boundaries.map((id, index) => {
		const port = portOf(`${edge.id}:boundary:${index}`, side, 0);
		nodes.get(id)?.ports?.push(port);
		return port.id;
	});
}

/**
 * Attach an endpoint to its owning engine node.
 * @param id The semantic owner of the endpoint.
 * @param port Its fully specified endpoint constraint.
 * @param nodes The engine hierarchy under construction.
 */
function attachPort(id: string, port: ElkPort, nodes: ReadonlyMap<string, ElkNode>): void {
	nodes.get(id)?.ports?.push(port);
}

/**
 * Attach one connection and its measured label to the graph.
 * @param edge The semantic relationship.
 * @param nodes The already constructed nodes, for endpoint ownership.
 * @param measured All text sizes.
 * @param ranks The semantic ordering that chooses faces.
 * @param predecessor Prior endpoint faces for unchanged relationships.
 * @returns The contiguous engine sections, all owned by one semantic edge.
 */
function edgeOf(
	edge: SemanticEdge,
	nodes: ReadonlyMap<string, ElkNode>,
	measured: MeasuredArchitecture,
	ranks: ReadonlyMap<string, number>,
	predecessor: ArchitectureDrawing | undefined,
): ElkExtendedEdge[] {
	const nested =
		measured.nodes.get(edge.from)?.node.parent !== measured.nodes.get(edge.to)?.node.parent;
	const [fromSide, toSide] =
		previousSides(edge, measured, predecessor) ?? sidesOf(edge, ranks, nested, predecessor);
	const fromPort = `${edge.id}:from`;
	const toPort = `${edge.id}:to`;
	attachPort(edge.from, portOf(fromPort, fromSide, ranks.get(edge.to) ?? 0), nodes);
	attachPort(edge.to, portOf(toPort, toSide, ranks.get(edge.from) ?? 0), nodes);
	const ports = [
		fromPort,
		...boundaryPorts(edge, boundariesOf(edge, measured), nodes, fromSide),
		toPort,
	];
	return ports.slice(1).map((target, index) => ({
		id: index === 0 ? edge.id : `${edge.id}:${index}`,
		sources: [ports[index]!],
		targets: [target],
		labels: index === 0 ? labelsOf(edge, measured) : [],
	}));
}

/**
 * Match a subject only while it remains in the same semantic container.
 * @param node The predecessor subject.
 * @param id The endpoint being matched.
 * @param measured Current containment links.
 * @returns Whether this predecessor still describes the same endpoint boundary.
 */
function sameParent(node: DrawingNode, id: string, measured: MeasuredArchitecture): boolean {
	return (
		node.measured.node.id === id &&
		node.measured.node.parent === measured.nodes.get(id)?.node.parent
	);
}

/**
 * Preserve endpoint faces when the same relationship survives a proposal.
 * @param edge Current relationship.
 * @param measured Current containment links.
 * @param predecessor The preceding drawing of this view.
 * @returns Its prior source and target faces when containment is unchanged.
 */
function previousSides(
	edge: SemanticEdge,
	measured: MeasuredArchitecture,
	predecessor: ArchitectureDrawing | undefined,
): PortSides | undefined {
	if (predecessor === undefined) return undefined;
	const before = predecessor.edges.find(
		(candidate) =>
			candidate.edge.id === edge.id &&
			candidate.edge.from === edge.from &&
			candidate.edge.to === edge.to,
	);
	if (before === undefined) return undefined;
	const nodes = [...predecessor.cards, ...predecessor.containers];
	const from = nodes.find((node) => sameParent(node, edge.from, measured)),
		to = nodes.find((node) => sameParent(node, edge.to, measured));
	if (from === undefined || to === undefined) return undefined;
	const end = pointAt(before.curve, 1);
	/**
	 * Identify the face on which an already solved endpoint lies.
	 * @param point Final endpoint coordinate.
	 * @param node Its predecessor card or frame.
	 * @returns The closest boundary face.
	 */
	const face = (point: Point, node: typeof from): PortSides[number] => {
		const distances: readonly (readonly [PortSides[number], number])[] = [
			["WEST", Math.abs(point.x - node.box.x)],
			["EAST", Math.abs(point.x - node.box.x - node.box.width)],
			["NORTH", Math.abs(point.y - node.box.y)],
			["SOUTH", Math.abs(point.y - node.box.y - node.box.height)],
		];
		return distances.toSorted((one, other) => one[1] - other[1])[0]![0];
	};
	return [face(before.curve.from, from), face(end, to)];
}

/**
 * The complete measured architecture in the engine's compound representation.
 * @param content The view's semantic content.
 * @param measured Text lines and dimensions settled before layout.
 * @param predecessor The preceding complete drawing of this view.
 * @returns One graph for one layout run.
 */
function compoundGraph(
	content: VariantContent,
	measured: MeasuredArchitecture,
	predecessor?: ArchitectureDrawing,
): ElkNode {
	const nodes = new Map([...measured.nodes].map(([id, value]) => [id, nodeOf(value)]));
	const edges = content.edges.toSorted((one, other) => one.id.localeCompare(other.id));
	const ranks = rankNodes(content.nodes, edges);
	return {
		id: "architecture:root",
		layoutOptions: { "elk.padding": "[top=24,left=24,bottom=24,right=24]" },
		children: containNodes(content.nodes, nodes),
		edges: edges.flatMap((edge) => edgeOf(edge, nodes, measured, ranks, predecessor)),
	};
}

export { COMPOUND_OPTIONS, compoundGraph };

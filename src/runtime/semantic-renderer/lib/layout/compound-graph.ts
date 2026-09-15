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
import { flankSkips } from "@/runtime/semantic-renderer/lib/layout/brackets";
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
	// Network-simplex placement centres a card over the fan it feeds and keeps
	// siblings on their layer line; post-compaction was tried and staircased a
	// plain fan (docs/design/layout-rules.md section 7).
	"elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
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
 * Faces the engine chooses: a forward skip carries no reading convention the
 * way a descent, a return or a containment call does, and a face fixed for it
 * before layout is a guess about columns the engine has not made yet. Left
 * free, the router picks the face that fits its own columns, which is what
 * removes the margin corridors on wide boards (docs/design/layout-rules.md).
 */
const FREE = "FREE";
type Faces = PortSides | typeof FREE;

/**
 * Whether a bracketing skip can descend onto the target's top face instead
 * of its west flank: in the predecessor drawing the target sits left of the
 * source, so the approach along the target's row would be a detour.
 * @param edge The skip.
 * @param predecessor The geometry whose arrangement should remain recognizable.
 * @returns True when the target centre lies left of the source's exit.
 */
function hasTopApproach(edge: SemanticEdge, predecessor: ArchitectureDrawing | undefined): boolean {
	if (predecessor === undefined) return false;
	const from = predecessor.cards.find((node) => node.measured.node.id === edge.from);
	const to = predecessor.cards.find((node) => node.measured.node.id === edge.to);
	return from !== undefined && to !== undefined && to.box.x + to.box.width / 2 < from.box.x;
}

/**
 * Adjacent forward steps are direct, returns take the right flank, one skip
 * per card brackets its chain from the west flank, and every further skip is
 * left to the engine.
 * @param edge The connection being read.
 * @param ordering The deterministic dependency ranks, with cycles broken in document order, and the bracketing skips.
 * @param nested Whether the connection crosses a containment boundary.
 * @param predecessor Existing geometry for choosing a shorter bracket attachment.
 * @returns The source and target attachment faces, or FREE for the engine to choose.
 */
function sidesOf(
	edge: SemanticEdge,
	ordering: Ordering,
	nested: boolean,
	predecessor: ArchitectureDrawing | undefined,
): Faces {
	// rankNodes assigns every node before edge attachment begins.
	const distance = ordering.ranks.get(edge.to)! - ordering.ranks.get(edge.from)!;
	if (distance <= 0) return ["EAST", "EAST"];
	if (distance === 1) return ["SOUTH", "NORTH"];
	// A skip across a frame boundary descends like any forward step: the engine
	// refuses a port-less edge across a hierarchy, and the flank it used to take
	// was a lane down the frame's edge that looped a route round the frame.
	return nested ? ["SOUTH", "NORTH"] : skipFaces(edge, ordering, predecessor);
}

/**
 * A forward skip's faces. A first render leaves a hub's skips to the engine,
 * which places the cards around them. Under a predecessor the cards are
 * pinned, and a free skip is routed as a staircase between them; there the
 * flank, with its approach read from the predecessor drawing, is the shorter,
 * straighter route.
 * @param edge The skip.
 * @param ordering The ranks and the bracketing skips.
 * @param predecessor The preceding drawing, when there is one.
 * @returns The faces, or FREE.
 */
function skipFaces(
	edge: SemanticEdge,
	ordering: Ordering,
	predecessor: ArchitectureDrawing | undefined,
): Faces {
	if (!ordering.flank.has(edge.id) && predecessor === undefined) return FREE;
	return ["WEST", hasTopApproach(edge, predecessor) ? "NORTH" : "WEST"];
}

/** The semantic ordering of one view: ranks, and which skips bracket from the flank. */
interface Ordering {
	readonly ranks: ReadonlyMap<string, number>;
	readonly flank: ReadonlySet<string>;
}

/**
 * Whether one endpoint is a frame the other sits inside. Such a relationship
 * starts or ends on the frame itself, so it is drawn from the frame's top face
 * down into the part, or from the part down onto the frame's bottom face,
 * never from the frame's outer flank as if it came from outside.
 * @param edge The connection being read.
 * @param measured The inclusion tree of this view.
 * @returns Which end holds the other, or undefined for two separate parts.
 */
function containmentOf(
	edge: SemanticEdge,
	measured: MeasuredArchitecture,
): "holds" | "held" | undefined {
	if (edge.from === edge.to) return undefined;
	if (ancestryOf(edge.to, measured).includes(edge.from)) return "holds";
	if (ancestryOf(edge.from, measured).includes(edge.to)) return "held";
	return undefined;
}

/**
 * The attachment faces of one connection: inherited from the predecessor when
 * the same relationship survives, by containment when one end holds the other,
 * else by dependency rank.
 * @param edge The connection being read.
 * @param measured The inclusion tree of this view.
 * @param ordering The deterministic dependency ranks and the bracketing skips.
 * @param predecessor The preceding drawing of this view.
 * @returns The source and target attachment faces, or FREE for the engine to choose.
 */
function facesOf(
	edge: SemanticEdge,
	measured: MeasuredArchitecture,
	ordering: Ordering,
	predecessor: ArchitectureDrawing | undefined,
): Faces {
	const inherited = previousSides(edge, measured, predecessor);
	if (inherited !== undefined) return inherited;
	const containment = containmentOf(edge, measured);
	if (containment === "holds") return ["NORTH", "NORTH"];
	if (containment === "held") return ["SOUTH", "SOUTH"];
	const nested =
		measured.nodes.get(edge.from)?.node.parent !== measured.nodes.get(edge.to)?.node.parent;
	return sidesOf(edge, ordering, nested, predecessor);
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
 * @returns The frames left, outermost last, and the frames entered, outermost first.
 */
function boundariesOf(
	edge: SemanticEdge,
	measured: MeasuredArchitecture,
): { readonly leaving: string[]; readonly entering: string[] } {
	const from = ancestryOf(edge.from, measured);
	const to = ancestryOf(edge.to, measured);
	const common = from.find((id) => to.includes(id));
	const leaving = from.slice(1, common === undefined ? undefined : from.indexOf(common));
	const entering = to.slice(1, common === undefined ? undefined : to.indexOf(common));
	return { leaving, entering: entering.toReversed() };
}

/**
 * One explicit boundary port is shared by the two adjacent edge sections: on
 * the face the route leaves its source by for every frame it leaves, and on
 * the face it reaches its target by for every frame it enters.
 * @param edge The semantic relationship that owns the crossing.
 * @param boundaries Frames left and entered, in traversal order.
 * @param boundaries.leaving The frames the route leaves, innermost first.
 * @param boundaries.entering The frames the route enters, outermost first.
 * @param nodes The engine hierarchy being constructed.
 * @param sides The faces this relationship leaves and arrives by.
 * @returns Their port ids, in traversal order.
 */
function boundaryPorts(
	edge: SemanticEdge,
	boundaries: { readonly leaving: readonly string[]; readonly entering: readonly string[] },
	nodes: ReadonlyMap<string, ElkNode>,
	sides: PortSides,
): string[] {
	// A frame is left and entered by its side. Through its top a route would
	// cross the title band, which is the frame's own and never a corridor, and
	// the engine accepts a crossing on a flank whatever faces the ends use.
	const entryFace = sides[1] === "NORTH" ? "WEST" : sides[1];
	const exitFace = sides[0] === "SOUTH" ? "WEST" : sides[0];
	const crossings = [
		...boundaries.leaving.map((id) => ({ id, side: exitFace })),
		...boundaries.entering.map((id) => ({ id, side: entryFace })),
	];
	return crossings.map(({ id, side }, index) => {
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
 * @param ordering The semantic ordering that chooses faces.
 * @param predecessor Prior endpoint faces for unchanged relationships.
 * @returns The contiguous engine sections, all owned by one semantic edge.
 */
function edgeOf(
	edge: SemanticEdge,
	nodes: ReadonlyMap<string, ElkNode>,
	measured: MeasuredArchitecture,
	ordering: Ordering,
	predecessor: ArchitectureDrawing | undefined,
): ElkExtendedEdge[] {
	const { ranks } = ordering;
	const faces = facesOf(edge, measured, ordering, predecessor);
	if (faces === FREE) {
		// Node to node: the router chooses the faces, and a crossed frame is the
		// engine's own hierarchy edge rather than a section per boundary.
		return [
			{ id: edge.id, sources: [edge.from], targets: [edge.to], labels: labelsOf(edge, measured) },
		];
	}
	const [fromSide, toSide] = faces;
	const fromPort = `${edge.id}:from`;
	const toPort = `${edge.id}:to`;
	attachPort(edge.from, portOf(fromPort, fromSide, ranks.get(edge.to) ?? 0), nodes);
	attachPort(edge.to, portOf(toPort, toSide, ranks.get(edge.from) ?? 0), nodes);
	const ports = [
		fromPort,
		...boundaryPorts(edge, boundariesOf(edge, measured), nodes, [fromSide, toSide]),
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
	// A port lies on a face, never a corner, so two faces tie only when the
	// predecessor route ended off its card; the fixed order below decides then.
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
	const ordering: Ordering = { ranks, flank: flankSkips(edges, ranks) };
	return {
		id: "architecture:root",
		layoutOptions: { "elk.padding": "[top=24,left=24,bottom=24,right=24]" },
		children: containNodes(content.nodes, nodes),
		edges: edges.flatMap((edge) => edgeOf(edge, nodes, measured, ordering, predecessor)),
	};
}

export { COMPOUND_OPTIONS, compoundGraph };

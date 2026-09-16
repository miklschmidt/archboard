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
import { pointAt } from "@/runtime/semantic-renderer/lib/layout/curves";
import { flankSkips } from "@/runtime/semantic-renderer/lib/layout/brackets";
import { rankNodes } from "@/runtime/semantic-renderer/lib/layout/rank";
import {
	besideFlankOf,
	portIndex,
	type FlankRule,
} from "@/runtime/semantic-renderer/lib/layout/flank-rules";
import {
	SOLVING,
	crossingFace,
	headerInsets,
	nearestFace,
	type Face,
	type HeaderSide,
} from "@/runtime/semantic-renderer/lib/layout/reading";

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
	"elk.spacing.labelNode": "16",
	"elk.spacing.labelLabel": "24",
	"elk.spacing.edgeLabel": "12",
	"elk.spacing.portPort": "24",
	"elk.spacing.nodeSelfLoop": "24",
	"elk.layered.spacing.nodeNodeBetweenLayers": "24",
	"elk.layered.spacing.edgeNodeBetweenLayers": "20",
	"elk.layered.spacing.edgeEdgeBetweenLayers": "20",
};

/** The two attachment faces chosen before coordinates exist, in the solving frame. */
type PortSides = readonly [Face, Face];

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
 * Adjacent forward steps are direct, returns take the return flank, a skip
 * beside its source's one chain brackets that chain from the beside flank:
 * those are reading conventions. Every other forward skip is the engine's
 * (docs/design/layout-rules.md sections 10 and 15).
 * @param edge The connection being read.
 * @param ordering The deterministic dependency ranks, with cycles broken in document order, the brackets and the free solve.
 * @param nested Whether the connection crosses a containment boundary.
 * @returns The source and target attachment faces, or FREE for the engine to choose.
 */
function sidesOf(edge: SemanticEdge, ordering: Ordering, nested: boolean): Faces {
	// rankNodes assigns every node before edge attachment begins.
	const distance = ordering.ranks.get(edge.to)! - ordering.ranks.get(edge.from)!;
	if (distance <= 0) return [ordering.rule.returnFlank, ordering.rule.returnFlank];
	if (distance === 1) return [SOLVING.forwardOut, SOLVING.forwardIn];
	// A skip across a frame boundary descends like any forward step: the engine
	// refuses a port-less edge across a hierarchy, and the flank it used to take
	// was a lane down the frame's edge that looped a route round the frame.
	return nested ? [SOLVING.forwardOut, SOLVING.forwardIn] : skipFaces(edge, ordering);
}

/**
 * A forward skip's faces. A first render gives a bracket the beside flank
 * and leaves every other skip to the engine. A skip a proposal adds takes
 * either the faces its route has in a first render of the same content, or
 * no fixed face; the proposal is settled both ways and the cheaper drawing
 * kept (`proposal-skips.ts`), never a guess from where the predecessor put a
 * card. A surviving skip never reaches here: it keeps its drawn faces.
 * @param edge The skip.
 * @param ordering The brackets, and how a proposal's added skips are attached.
 * @returns The faces, or FREE.
 */
function skipFaces(edge: SemanticEdge, ordering: Ordering): Faces {
	if (ordering.added === null) return FREE;
	if (ordering.added !== undefined) return drawnSides(edge, ordering.added) ?? FREE;
	return ruleFaces(edge, ordering);
}

/**
 * A first render's skip faces under its flank rule: the beside flank for
 * every skip, for a bracket only, or for none.
 * @param edge The skip.
 * @param ordering The brackets and the flank rule.
 * @returns The faces, or FREE.
 */
function ruleFaces(edge: SemanticEdge, ordering: Ordering): Faces {
	const { skips } = ordering.rule;
	const flanked = skips === "flanked" || (skips === "bracketed" && ordering.flank.has(edge.id));
	const beside = besideFlankOf(ordering.rule);
	return flanked ? [beside, beside] : FREE;
}

/** The semantic ordering of one view: ranks, the brackets, the flank rule, and how a proposal's added skips are attached. */
interface Ordering {
	readonly ranks: ReadonlyMap<string, number>;
	readonly flank: ReadonlySet<string>;
	readonly rule: FlankRule;
	readonly added: ArchitectureDrawing | null | undefined;
}

/**
 * Whether a relationship joins a frame to something outside it. The engine
 * attaches such a relationship itself: a fixed port on a frame's face, when a
 * proposal pins the cards, crashes the engine's layering
 * (`nodeOrder[l][0].layer`, TASK-237), and node to node it is accepted.
 * @param edge The connection being read.
 * @param measured The inclusion tree of this view.
 * @returns True when either end is a frame and neither holds the other.
 */
function framesOutside(edge: SemanticEdge, measured: MeasuredArchitecture): boolean {
	const nested =
		measured.nodes.get(edge.from)?.node.parent !== measured.nodes.get(edge.to)?.node.parent;
	return (
		!nested &&
		containmentOf(edge, measured) === undefined &&
		[edge.from, edge.to].some((id) => (measured.nodes.get(id)?.headerHeight ?? 0) > 0)
	);
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
 * The faces of a frame's own relationship, which run the way the page reads.
 * @param edge The connection being read.
 * @param measured The inclusion tree of this view.
 * @returns The faces, or nothing when neither end holds the other.
 */
function containmentSides(
	edge: SemanticEdge,
	measured: MeasuredArchitecture,
): PortSides | undefined {
	const containment = containmentOf(edge, measured);
	if (containment === "holds") return [SOLVING.forwardIn, SOLVING.forwardIn];
	if (containment === "held") return [SOLVING.forwardOut, SOLVING.forwardOut];
	return undefined;
}

/**
 * The attachment faces of one connection: inherited from the predecessor when
 * the same relationship survives, by containment when one end holds the other,
 * else by dependency rank. A frame's own relationship runs the way the page
 * reads: from the frame's back edge into the part, or from the part's front
 * onto the frame's front edge, never from a flank, which for a frame is a
 * hierarchical port on a lateral face that the engine's node placer refuses.
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
	if (framesOutside(edge, measured)) return FREE;
	const inherited = previousSides(edge, measured, predecessor) ?? containmentSides(edge, measured);
	if (inherited !== undefined) return inherited;
	const nested =
		measured.nodes.get(edge.from)?.node.parent !== measured.nodes.get(edge.to)?.node.parent;
	return sidesOf(edge, ordering, nested);
}

/**
 * A distinct port for each end prevents unrelated relationships sharing a path.
 * @param id The internal endpoint id, derived from the semantic edge id.
 * @param side The face to use; ELK chooses the location on that face.
 * @param index Its place among the ports of its face (`portIndex`).
 * @returns The engine's endpoint.
 */
function portOf(id: string, side: Face, index: number): ElkPort {
	return {
		id,
		width: 0,
		height: 0,
		layoutOptions: {
			"elk.port.side": side,
			"elk.port.index": String(index),
		},
	};
}

/**
 * A frame's padding: its title band on the header side, and room for a route
 * inside every other edge.
 * @param headerHeight The measured title band.
 * @param header Where the title band sits in the solving frame.
 * @returns The engine's padding option.
 */
function framePadding(headerHeight: number, header: HeaderSide): string {
	const { top, left } = headerInsets(header, headerHeight + HEADER_AIR, FRAME_INSET);
	return `[top=${top},left=${left},bottom=${FRAME_INSET},right=${FRAME_INSET}]`;
}

/**
 * Convert measured dimensions to the graph's fixed card or expandable frame.
 * @param measured The complete text measurement.
 * @param header Where a frame's title band sits in the solving frame.
 * @returns A node awaiting its children and ports.
 */
function nodeOf(measured: MeasuredNode, header: HeaderSide): ElkNode {
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
			"elk.padding": framePadding(headerHeight, header),
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
 * @param header Where a frame's title band sits in the solving frame.
 * @returns Their port ids, in traversal order.
 */
function boundaryPorts(
	edge: SemanticEdge,
	boundaries: { readonly leaving: readonly string[]; readonly entering: readonly string[] },
	nodes: ReadonlyMap<string, ElkNode>,
	sides: PortSides,
	header: HeaderSide,
): string[] {
	// A frame is left and entered by a side that is not its title band, which
	// is the frame's own and never a corridor; the engine accepts a crossing on
	// any face whatever faces the ends use.
	const entryFace = crossingFace(sides[1], header);
	const exitFace = crossingFace(sides[0], header);
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
 * @param header Where a frame's title band sits in the solving frame.
 * @returns The contiguous engine sections, all owned by one semantic edge.
 */
function edgeOf(
	edge: SemanticEdge,
	nodes: ReadonlyMap<string, ElkNode>,
	measured: MeasuredArchitecture,
	ordering: Ordering,
	predecessor: ArchitectureDrawing | undefined,
	header: HeaderSide,
): ElkExtendedEdge[] {
	const { ranks, rule } = ordering;
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
	const fromIndex = portIndex(rule, fromSide, ranks.get(edge.to) ?? 0);
	const toIndex = portIndex(rule, toSide, ranks.get(edge.from) ?? 0);
	attachPort(edge.from, portOf(fromPort, fromSide, fromIndex), nodes);
	attachPort(edge.to, portOf(toPort, toSide, toIndex), nodes);
	const ports = [
		fromPort,
		...boundaryPorts(edge, boundariesOf(edge, measured), nodes, [fromSide, toSide], header),
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
	return [nearestFace(before.curve.from, from.box), nearestFace(pointAt(before.curve, 1), to.box)];
}

/**
 * The faces a relationship's route has in a drawing: the face of each end's
 * card nearest the route's first and last points.
 * @param edge The relationship.
 * @param drawing A drawing that routes it.
 * @returns Its faces there, or nothing when the drawing does not route it.
 */
function drawnSides(edge: SemanticEdge, drawing: ArchitectureDrawing): PortSides | undefined {
	const route = drawing.edges.find((candidate) => candidate.edge.id === edge.id);
	const nodes = [...drawing.cards, ...drawing.containers];
	const from = nodes.find((node) => node.measured.node.id === edge.from);
	const to = nodes.find((node) => node.measured.node.id === edge.to);
	if (route === undefined || from === undefined || to === undefined) return undefined;
	return [nearestFace(route.curve.from, from.box), nearestFace(pointAt(route.curve, 1), to.box)];
}

/**
 * The complete measured architecture in the engine's compound representation,
 * in the solving frame.
 * @param content The view's semantic content.
 * @param measured Text lines and dimensions settled before layout, in the solving frame.
 * @param predecessor The preceding complete drawing of this view, in the solving frame.
 * @param header Where a frame's title band sits in the solving frame.
 * @param rule Which flank returns travel and how skips attach.
 * @param added How a proposal attaches the skips it adds: a first render to read faces from, or null for none.
 * @returns One graph for one layout run.
 */
function compoundGraph(
	content: VariantContent,
	measured: MeasuredArchitecture,
	predecessor: ArchitectureDrawing | undefined,
	header: HeaderSide,
	rule: FlankRule,
	added?: ArchitectureDrawing | null,
): ElkNode {
	const nodes = new Map([...measured.nodes].map(([id, value]) => [id, nodeOf(value, header)]));
	const edges = content.edges.toSorted((one, other) => one.id.localeCompare(other.id));
	const ranks = rankNodes(content.nodes, edges);
	const ordering: Ordering = { ranks, flank: flankSkips(edges, ranks), rule, added };
	return {
		id: "architecture:root",
		layoutOptions: { "elk.padding": "[top=24,left=24,bottom=24,right=24]" },
		children: containNodes(content.nodes, nodes),
		edges: edges.flatMap((edge) => edgeOf(edge, nodes, measured, ordering, predecessor, header)),
	};
}

export { COMPOUND_OPTIONS, compoundGraph };

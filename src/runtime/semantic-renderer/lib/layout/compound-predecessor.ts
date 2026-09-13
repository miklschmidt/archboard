// A predecessor contributes constraints to ELK, never a second layout pass
// that moves individual cards after their routes have been solved.
import type { ElkNode, ElkPort, LayoutOptions } from "elkjs/lib/elk-api";
import type { VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
	DrawingNode,
	DrawingEdge,
	MeasuredLabel,
	MeasuredArchitecture,
} from "@/runtime/semantic-renderer/lib/drawing";
import type { Point } from "@/runtime/semantic-renderer/lib/geometry";

/** Keep the prior layer/order while allowing the engine to make room. */
const PREDECESSOR_OPTIONS: LayoutOptions = {
	"elk.layered.cycleBreaking.strategy": "INTERACTIVE",
	"elk.layered.layering.strategy": "INTERACTIVE",
	"elk.layered.crossingMinimization.semiInteractive": "true",
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

/** One existing dependency reached through newly introduced subjects. */
interface Anchor {
	readonly node: DrawingNode;
	readonly distance: number;
}

/**
 * Find the closest already drawn dependency without depending on edge array order.
 * @param id Starting subject.
 * @param reverse Search its incoming rather than outgoing relationships.
 * @param content The complete current graph.
 * @param previous Existing subjects.
 * @returns The nearest stable dependency, if this component has one.
 */
function nearestAnchor(
	id: string,
	reverse: boolean,
	content: VariantContent,
	previous: ReadonlyMap<string, DrawingNode>,
): Anchor | undefined {
	const visited = new Set([id]);
	let frontier = [id];
	for (let distance = 1; frontier.length > 0; distance += 1) {
		const next = content.edges
			.filter((edge) => frontier.includes(reverse ? edge.to : edge.from))
			.map((edge) => (reverse ? edge.from : edge.to))
			.filter((candidate) => !visited.has(candidate))
			.toSorted();
		for (const candidate of next) {
			const node = previous.get(candidate);
			if (node !== undefined) return { node, distance };
			visited.add(candidate);
		}
		frontier = next;
	}
	return undefined;
}

/**
 * Suggest a layer between stable neighbors, leaving final spacing to ELK.
 * @param id Newly introduced subject.
 * @param content Current architecture.
 * @param previous Stable subjects in the predecessor.
 * @param height Current card height, used only for a new terminal chain.
 * @returns A pseudo vertical position used by interactive layer assignment.
 */
function newLayer(
	id: string,
	content: VariantContent,
	previous: ReadonlyMap<string, DrawingNode>,
	height: number,
): number {
	const before = nearestAnchor(id, true, content, previous),
		after = nearestAnchor(id, false, content, previous);
	if (before !== undefined && after !== undefined)
		return (
			(before.node.box.y * after.distance + after.node.box.y * before.distance) /
			(before.distance + after.distance)
		);
	if (before !== undefined)
		return before.node.box.y + before.distance * (before.node.box.height + 80);
	if (after !== undefined) return after.node.box.y - after.distance * (height + 80);
	return 24;
}

/**
 * Translate an endpoint face into a preliminary global attachment hint.
 * @param node The measured, position-seeded engine node.
 * @param port The relationship attachment face.
 * @param origin Its global node origin.
 * @returns A face center; ELK still owns final port distribution.
 */
function portHint(node: ElkNode, port: ElkPort, origin: Point): Point {
	const side = port.layoutOptions!["elk.port.side"];
	const width = node.width!,
		height = node.height!;
	if (side === "WEST") return { x: origin.x, y: origin.y + height / 2 };
	if (side === "EAST") return { x: origin.x + width, y: origin.y + height / 2 };
	return { x: origin.x + width / 2, y: origin.y + (side === "SOUTH" ? height : 0) };
}

/**
 * Seed labels alongside their predecessor route or new endpoint neighbors.
 * @param graph The root graph carrying the engine edge sections.
 * @param ports Preliminary attachment hints in global coordinates.
 * @param predecessor Its preceding complete drawing.
 */
function seedLabels(
	graph: ElkNode,
	ports: ReadonlyMap<string, Point>,
	predecessor: ArchitectureDrawing,
): void {
	for (const edge of graph.edges!) {
		const from = ports.get(edge.sources[0]!)!,
			to = ports.get(edge.targets[0]!)!;
		const before = predecessor.edges.find((candidate) => candidate.edge.id === edge.id)?.label;
		for (const label of edge.labels!) {
			label.x = before?.box.x ?? (from.x + to.x - label.width!) / 2;
			label.y = (from.y + to.y - label.height!) / 2;
		}
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
	/**
	 * Suggest a new side lane only for subjects absent from the predecessor.
	 * @param node The current engine subject.
	 * @param right The first free lane after its existing siblings.
	 * @returns Its global prior or suggested position.
	 */
	function positionOf(node: ElkNode, right: number): Point {
		return (
			previous.get(node.id)?.box ?? {
				x: right,
				y: newLayer(node.id, content, previous, node.height ?? 0),
			}
		);
	}
	/**
	 * Seed one containment level in its actual parent coordinate system.
	 * @param parent The engine parent being visited.
	 * @param origin Its global predecessor or suggested position.
	 */
	function visit(parent: ElkNode, origin: Point): void {
		parent.layoutOptions = { ...parent.layoutOptions, ...PREDECESSOR_OPTIONS };
		const children = parent.children ?? [];
		const siblings = children.flatMap((node) => {
			const old = previous.get(node.id);
			return old === undefined ? [] : [old];
		});
		const right =
			siblings.length === 0
				? origin.x + 48
				: Math.max(...siblings.map((node) => node.box.x + node.box.width)) + 72;
		for (const node of children) {
			const point = positionOf(node, right);
			for (const port of node.ports!) ports.set(port.id, portHint(node, port, point));
			node.x = point.x - origin.x;
			node.y = point.y - origin.y;
			node.layoutOptions = { ...node.layoutOptions, "elk.position": `(${node.x},${node.y})` };
			if (node.children !== undefined) visit(node, point);
		}
	}
	visit(graph, { x: 0, y: 0 });
	seedLabels(graph, ports, predecessor);
}

export { preserveSizes, reuseDrawing, seedPredecessor };

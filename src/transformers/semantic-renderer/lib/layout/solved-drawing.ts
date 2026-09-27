// A solved graph read as the drawing it answers: every subject once with its
// containment depth, and every relationship's route joined into the rounded
// geometry the SVG paints, with the label box the engine reserved for it.
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { VariantContent } from "@/shared/semantic-board/index";
import type {
	DrawingEdge,
	DrawingNode,
	MeasuredArchitecture,
} from "@/transformers/semantic-renderer/lib/drawing";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import { boxOf } from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import { curveThrough, pathOf, simplify } from "@/transformers/semantic-renderer/lib/layout/curves";

/**
 * Collect each semantic subject exactly once, retaining containment depth.
 * @param nodes The laid-out hierarchy.
 * @param measured The semantic meaning and precomputed text for each node.
 * @param depth The depth of this level.
 * @returns Final node geometry in parent-before-child order.
 */
function drawingNodes(
	nodes: readonly ElkNode[],
	measured: MeasuredArchitecture,
	depth: number,
): DrawingNode[] {
	return nodes.flatMap((node) => {
		const value = measured.nodes.get(node.id);
		if (value === undefined) {
			throw new Error(`Layout returned an unknown architecture node: ${node.id}`);
		}
		return [
			{ measured: value, box: boxOf(node), depth },
			...drawingNodes(node.children ?? [], measured, depth + 1),
		];
	});
}

/**
 * Join the engine's route into the same rounded geometry the SVG paints.
 * @param result One laid-out semantic edge.
 * @returns Its continuous curve, with no duplicate or collinear waypoints.
 */
function pointsOf(result: ElkExtendedEdge): Point[] {
	const sections = result.sections ?? [];
	if (sections.length !== 1) {
		throw new Error(`Layout did not return one complete route for relationship ${result.id}`);
	}
	const points = sections.flatMap((section) => [
		section.startPoint,
		...(section.bendPoints ?? []),
		section.endPoint,
	]);
	return points;
}

/**
 * Read a reserved label box; other measured labels will use clear route runs.
 * @param result The laid-out relationship.
 * @param measured The measured words and dimensions.
 * @returns Its final label when the relationship carries one.
 */
function drawingLabel(
	result: ElkExtendedEdge,
	measured: MeasuredArchitecture,
): Pick<DrawingEdge, "label"> {
	if (result.layoutOptions?.["archboard.route-label"] !== "true") return {};
	const label = measured.labels.get(result.id);
	const shape = result.labels?.[0];
	if (label === undefined || shape === undefined) return {};
	return { label: { measured: label, box: boxOf(shape) } };
}

/**
 * Match final route and label geometry to every relationship in the view.
 * @param content The semantic connections in drawing order.
 * @param laidOut The engine's complete graph.
 * @param measured Text measurement for the optional label.
 * @returns Every drawn edge; missing routes are errors, never silent omissions.
 */
function drawingEdges(
	content: VariantContent,
	laidOut: ElkNode,
	measured: MeasuredArchitecture,
): DrawingEdge[] {
	const results = new Map(laidOut.edges?.map((edge) => [edge.id, edge]));
	const labels = new Map(
		[...results].flatMap(([id, result]) => {
			const label = drawingLabel(result, measured).label;
			return label === undefined ? [] : [[id, label] as const];
		}),
	);
	const routes = new Map(
		content.edges.map((edge) => [edge.id, simplify(pointsOf(results.get(edge.id)!))]),
	);
	return content.edges
		.toSorted((one, other) => one.order - other.order)
		.map((edge) => {
			const result = results.get(edge.id);
			if (result === undefined) {
				throw new Error(`Layout did not return relationship ${edge.id}`);
			}
			const points = routes.get(edge.id)!;
			const measuredLabel = labels.get(edge.id);
			const label = measuredLabel === undefined ? {} : { label: measuredLabel };
			const curve = curveThrough(points);
			return {
				edge,
				curve,
				path: pathOf(curve),
				...label,
			};
		});
}

export { drawingEdges, drawingNodes };

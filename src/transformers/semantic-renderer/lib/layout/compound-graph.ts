import {
	LABEL_CARD_CLEARANCE,
	LABEL_LABEL_CLEARANCE,
	LABEL_ROUTE_CLEARANCE,
	RANK_GAP,
} from "@/transformers/semantic-renderer/config";
// The adapter carries only semantic containment and measured dimensions.
// Placement chooses ranks and the router chooses physical attachment faces.
import type { ElkLabel, ElkNode, LayoutOptions } from "@archboard/elk-rs";
import type { SemanticEdge, VariantContent } from "@/shared/semantic-board/index";
import type {
	MeasuredArchitecture,
	MeasuredNode,
} from "@/transformers/semantic-renderer/lib/drawing";

/** Shared diagram spacing; legacy option names remain the transport spelling. */
const COMPOUND_OPTIONS: LayoutOptions = {
	"elk.spacing.labelNode": String(LABEL_CARD_CLEARANCE),
	"elk.spacing.labelLabel": String(LABEL_LABEL_CLEARANCE),
	"elk.spacing.edgeLabel": String(LABEL_ROUTE_CLEARANCE),
	"elk.layered.spacing.nodeNodeBetweenLayers": String(RANK_GAP),
};

/**
 * Convert measured dimensions to a card or expandable frame.
 * @param measured The complete text measurement.
 * @returns The measured shape before containment is assembled.
 */
function nodeOf(measured: MeasuredNode): ElkNode {
	const { node, width, height, headerHeight } = measured;
	return {
		id: node.id,
		width,
		height,
		layoutOptions: {
			"archboard.order-group":
				node.responsibility === undefined
					? node.id
					: JSON.stringify([node.kind, node.responsibility]),
			...(headerHeight === 0 ? {} : { "archboard.header.size": String(headerHeight) }),
		},
		...(headerHeight === 0 ? {} : { children: [] }),
	};
}

/**
 * Pass the padded label dimensions already measured by the drawing host.
 * @param edge The semantic relationship.
 * @param measured All measured text.
 * @returns Its label shape when the relationship carries words.
 */
function labelsOf(edge: SemanticEdge, measured: MeasuredArchitecture): ElkLabel[] {
	const label = measured.labels.get(edge.id);
	return label === undefined
		? []
		: [
				{
					id: `${edge.id}:label`,
					text: label.runs.map((run) => run.text).join("\n"),
					width: label.width,
					height: label.height,
				},
			];
}

/**
 * Construct one whole graph without rank, flank or boundary-port policies.
 * @param content The view's semantic content.
 * @param measured Its fixed text and card dimensions.
 * @returns The hierarchy and complete semantic relationships.
 */
function compoundGraph(content: VariantContent, measured: MeasuredArchitecture): ElkNode {
	const nodes = new Map([...measured.nodes].map(([id, value]) => [id, nodeOf(value)]));
	const children: ElkNode[] = [];
	for (const node of content.nodes) {
		const parent = node.parent === undefined ? undefined : nodes.get(node.parent);
		(parent?.children ?? children).push(nodes.get(node.id)!);
	}
	return {
		id: "architecture:root",
		children,
		edges: content.edges
			.toSorted((one, other) => one.id.localeCompare(other.id))
			.map((edge) => ({
				id: edge.id,
				sources: [edge.from],
				targets: [edge.to],
				layoutOptions: { "archboard.relationship.kind": edge.kind },
				labels: labelsOf(edge, measured),
			})),
	};
}

export { COMPOUND_OPTIONS, compoundGraph };

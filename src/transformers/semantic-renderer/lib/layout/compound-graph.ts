// The graph Track and Blocks lay out (lib/blocks): semantic containment and
// measured dimensions only. Each engine chooses ranks and attachment faces.
import type { ElkLabel, ElkNode } from "@archboard/elk-rs";
import type { ChangeKind, SemanticEdge, VariantContent } from "@/shared/semantic-board/index";
import type {
	MeasuredArchitecture,
	MeasuredNode,
} from "@/transformers/semantic-renderer/lib/drawing";

/** The layout option naming the group a node is placed with (TASK-347). */
const PLACING_GROUP = "archboard.group";
/** The root layout option carrying each placing group's caption size, as `[id, width, height]` rows. */
const GROUP_CAPTIONS = "archboard.group.captions";

/**
 * Convert measured dimensions to a card or expandable frame.
 * @param measured The complete text measurement.
 * @param group The group it is placed with, if any.
 * @returns The measured shape before containment is assembled.
 */
function nodeOf(measured: MeasuredNode, group: string | undefined): ElkNode {
	const { node, width, height, headerHeight } = measured;
	return {
		id: node.id,
		width,
		height,
		layoutOptions: {
			"archboard.order": String(node.order),
			...(group === undefined ? {} : { [PLACING_GROUP]: group }),
			"archboard.order-group":
				node.responsibility === undefined
					? String(node.order)
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
 * The root options carrying each placing group's caption size, when any group places.
 * @param measured The measured architecture.
 * @returns The options, or none.
 */
function captionOptions(measured: MeasuredArchitecture): Pick<ElkNode, "layoutOptions"> {
	const captions = [...(measured.groups?.captions ?? [])].map(([id, { width, height }]) => [
		id,
		width,
		height,
	]);
	return captions.length === 0
		? {}
		: { layoutOptions: { [GROUP_CAPTIONS]: JSON.stringify(captions) } };
}

/**
 * Construct one whole graph without rank, flank or boundary-port policies.
 * @param content The view's semantic content.
 * @param measured Its fixed text and card dimensions.
 * @param standings Comparison standings used to distinguish marked relationship channels.
 * @returns The hierarchy and complete semantic relationships.
 */
function compoundGraph(
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings?: Readonly<Record<string, ChangeKind>>,
): ElkNode {
	const nodes = new Map(
		[...measured.nodes].map(([id, value]) => [id, nodeOf(value, measured.groups?.placing.get(id))]),
	);
	const children: ElkNode[] = [];
	for (const node of content.nodes.toSorted((one, other) => one.order - other.order)) {
		const parent = node.parent === undefined ? undefined : nodes.get(node.parent);
		(parent?.children ?? children).push(nodes.get(node.id)!);
	}
	return {
		id: "architecture:root",
		...captionOptions(measured),
		children,
		edges: content.edges
			.toSorted((one, other) => one.order - other.order)
			.map((edge) => {
				const standing = standings === undefined ? undefined : (standings[edge.id] ?? "unchanged");
				return {
					id: edge.id,
					sources: [edge.from],
					targets: [edge.to],
					layoutOptions: {
						"archboard.order": String(edge.order),
						"archboard.relationship.kind": edge.kind,
						...(standing === undefined ? {} : { "archboard.relationship.standing": standing }),
					},
					labels: labelsOf(edge, measured),
				};
			}),
	};
}

export { GROUP_CAPTIONS, PLACING_GROUP, compoundGraph };

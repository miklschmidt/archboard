import {
	LABEL_CARD_CLEARANCE,
	LABEL_LABEL_CLEARANCE,
	LABEL_ROUTE_CLEARANCE,
	RANK_GAP,
} from "@/transformers/semantic-renderer/config";
// The adapter carries only semantic containment and measured dimensions.
// Placement chooses ranks and the router chooses physical attachment faces.
import type { ElkLabel, ElkNode, LayoutOptions } from "@archboard/elk-rs";
import type { ChangeKind, SemanticEdge, VariantContent } from "@/shared/semantic-board/index";
import type {
	MeasuredArchitecture,
	MeasuredNode,
} from "@/transformers/semantic-renderer/lib/drawing";

/** The layout option naming the group a node is placed with (TASK-347). */
const PLACING_GROUP = "archboard.group";
/** The root layout option carrying each placing group's caption size, as `[id, width, height]` rows. */
const GROUP_CAPTIONS = "archboard.group.captions";

/** The layout option marking a card that wears a standing pin in its top-left corner (standing.ts). */
const PINNED_STANDING = "archboard.standing.pinned";

/** Shared diagram spacing; legacy option names remain the transport spelling. */
const COMPOUND_OPTIONS: LayoutOptions = {
	"elk.spacing.labelNode": String(LABEL_CARD_CLEARANCE),
	"elk.spacing.labelLabel": String(LABEL_LABEL_CLEARANCE),
	"elk.spacing.edgeLabel": String(LABEL_ROUTE_CLEARANCE),
	"elk.layered.spacing.nodeNodeBetweenLayers": String(RANK_GAP),
};

/**
 * The layout option marking a card that wears a standing pin.
 * @param standing How it stands in a comparison, if it is one.
 * @returns The option, or none for a card that wears no pin.
 */
function pinnedOptions(standing: ChangeKind | undefined): LayoutOptions {
	return standing === undefined || standing === "unchanged" ? {} : { [PINNED_STANDING]: "true" };
}

/**
 * Convert measured dimensions to a card or expandable frame.
 * @param measured The complete text measurement.
 * @param group The group it is placed with, if any.
 * @param standing How it stands in a comparison, if it is one.
 * @returns The measured shape before containment is assembled.
 */
function nodeOf(
	measured: MeasuredNode,
	group: string | undefined,
	standing: ChangeKind | undefined,
): ElkNode {
	const { node, width, height, headerHeight } = measured;
	return {
		id: node.id,
		width,
		height,
		layoutOptions: {
			"archboard.order": String(node.order),
			...(group === undefined ? {} : { [PLACING_GROUP]: group }),
			...pinnedOptions(standing),
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
 * @param standings Comparison standings used to distinguish marked relationship channels and
 * to mark the cards that wear a standing pin.
 * @returns The hierarchy and complete semantic relationships.
 */
function compoundGraph(
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings?: Readonly<Record<string, ChangeKind>>,
): ElkNode {
	const nodes = new Map(
		[...measured.nodes].map(([id, value]) => [
			id,
			nodeOf(value, measured.groups?.placing.get(id), standings?.[id]),
		]),
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

export { COMPOUND_OPTIONS, GROUP_CAPTIONS, PINNED_STANDING, PLACING_GROUP, compoundGraph };

// The graph Track and Blocks lay out (lib/blocks): semantic containment,
// measured dimensions and which children are entry points of the container
// around them. Each engine chooses ranks and attachment faces.
import type { ElkLabel, ElkNode } from "@archboard/elk-rs";
import {
	inspectContainer,
	type ChangeKind,
	type SemanticEdge,
	type VariantContent,
} from "@/shared/semantic-board/index";
import type {
	MeasuredArchitecture,
	MeasuredNode,
} from "@/transformers/semantic-renderer/lib/drawing";

/** The layout option naming the group a node is placed with (TASK-347). */
const PLACING_GROUP = "archboard.group";
/** The root layout option carrying each placing group's caption size, as `[id, width, height]` rows. */
const GROUP_CAPTIONS = "archboard.group.captions";
/**
 * The layout option marking a child a relationship from outside its container
 * reaches (ADR 0044): `true` when it is first, so no other part of the
 * container leads to it, else `false` ({@link entryPointsOf}).
 */
const ENTRY_POINT = "archboard.entry";

/**
 * Which child of a container holds each part inside it, at any depth.
 * @param parents Every node's parent, by id.
 * @param container The container's id.
 * @returns Each inside part's id with the id of the child that holds it.
 */
function childrenHolding(
	parents: ReadonlyMap<string, string | undefined>,
	container: string,
): Map<string, string> {
	const holding = new Map<string, string>();
	for (const id of parents.keys()) {
		const chain = [id];
		for (let up = parents.get(id); up !== undefined && !chain.includes(up); up = parents.get(up)) {
			if (up === container) {
				holding.set(id, chain.at(-1)!);
				break;
			}
			chain.push(up);
		}
	}
	return holding;
}

/**
 * The drawn children that are entry points of the container around them, as
 * the variant states its interface (ADR 0044), and whether each is first: no
 * other part of the container leads to it along the relationships, from source
 * to target, inside the container or round through parts outside. An entry
 * point another part leads to stands below that part, as a caller stands above
 * what it calls. Both are read off the whole variant: an entry point stays one
 * in a view that hides its caller, a child a comparison puts back is never one,
 * since the variant does not hold it, and a view holds a container's first row
 * only where the whole variant does.
 * @param laid The content laid out.
 * @param variant The whole variant, before any view narrows it.
 * @returns Each entry point's id, in id order, with true when it is first.
 */
function entryPointsOf(
	laid: VariantContent,
	variant: VariantContent,
): ReadonlyMap<string, boolean> {
	const held = new Map(variant.nodes.map((node) => [node.id, node]));
	const parents = new Map(variant.nodes.map(({ id, parent }) => [id, parent]));
	const sources = new Map<string, string[]>();
	for (const { from, to } of variant.edges) sources.set(to, [...(sources.get(to) ?? []), from]);
	const containers = new Set(laid.nodes.flatMap(({ parent }) => parent ?? []));
	const entries = [...containers].flatMap((id) => {
		const container = held.get(id);
		const inspection = container === undefined ? undefined : inspectContainer(variant, container);
		if (!inspection?.holdsParts) return [];
		const holding = childrenHolding(parents, id);
		return inspection.entryPoints.map(({ node }): [string, boolean] => {
			// Every part that leads to the entry point, walked back from what it holds.
			const open = [...holding].filter(([, child]) => child === node.id).map(([part]) => part);
			const leading = new Set<string>();
			while (open.length > 0) {
				const at = open.pop()!;
				if (leading.has(at)) continue;
				leading.add(at);
				open.push(...(sources.get(at) ?? []));
			}
			const reached = [...leading].some((part) => {
				const child = holding.get(part);
				return child !== undefined && child !== node.id;
			});
			return [node.id, !reached];
		});
	});
	return new Map(entries.toSorted(([one], [other]) => (one < other ? -1 : 1)));
}

/**
 * Convert measured dimensions to a card or expandable frame.
 * @param measured The complete text measurement.
 * @param group The group it is placed with, if any.
 * @param first Whether it is an entry point of the container around it that is first, if it is one.
 * @returns The measured shape before containment is assembled.
 */
function nodeOf(
	measured: MeasuredNode,
	group: string | undefined,
	first: boolean | undefined,
): ElkNode {
	const { node, width, height, headerHeight } = measured;
	return {
		id: node.id,
		width,
		height,
		layoutOptions: {
			"archboard.order": String(node.order),
			...(group === undefined ? {} : { [PLACING_GROUP]: group }),
			...(first === undefined ? {} : { [ENTRY_POINT]: String(first) }),
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
 * @param entries The children that are entry points of the container around them ({@link entryPointsOf}).
 * @returns The hierarchy and complete semantic relationships.
 */
function compoundGraph(
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings: Readonly<Record<string, ChangeKind>> | undefined,
	entries: ReadonlyMap<string, boolean>,
): ElkNode {
	const nodes = new Map(
		[...measured.nodes].map(([id, value]) => [
			id,
			nodeOf(value, measured.groups?.placing.get(id), entries.get(id)),
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

export { ENTRY_POINT, GROUP_CAPTIONS, PLACING_GROUP, compoundGraph, entryPointsOf };

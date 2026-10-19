// The graph Track and Blocks lay out (lib/blocks): semantic containment,
// measured dimensions, which children are entry points of the container
// around them, and which point of a flowchart's decision each of its answers
// leaves from. Each engine chooses ranks and attachment faces.
import type { ElkLabel, ElkNode } from "@archboard/elk-rs";
import { inspectContainer } from "@archboard/board/container-interface";
import { type ChangeKind } from "@archboard/board/compare-variants";
import { type SemanticEdge, type VariantContent } from "@archboard/board/content";
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
 * The layout option carrying each width a container's header can take and how
 * tall it stands there, as `[width, height]` rows, narrowest first (TASK-486).
 */
const HEADER_STEPS = "archboard.header.steps";
/**
 * The layout option marking a line that leaves its source from the source's
 * points, as out of a flowchart's decision (`MeasuredNode.pointed`): the
 * corner of the source's box Graphviz is asked to stand it under, by the
 * line's place among the source's lines ({@link pointsOf}).
 */
const FROM_POINTS = "archboard.from-points";
/**
 * The layout option on such a line that says how far in from the left and
 * right edges of its source's box the lines from its side points run down
 * (`MeasuredNode.pointed`).
 */
const POINTS_INSET = "archboard.from-points.inset";

/**
 * The layout options of each line out of a card that leaves from its points:
 * where it asks Graphviz to leave, as a compass point, and how far in from
 * the box's edges its side points' lines run down. In the relationships'
 * order, which the flowchart takes from a first layout (`flowchart.ts`
 * `inFreeOrder`), the first of two or more
 * lines asks for the bottom-left corner of the card's box, the last for the
 * bottom-right corner, and any other for the middle of its bottom. The router
 * holds each line to its point by where Graphviz then stood it
 * (`track/points.ts`).
 * @param edges The relationships, in the board's order.
 * @param measured The measured cards.
 * @returns The options, by relationship id.
 */
function pointsOf(
	edges: readonly SemanticEdge[],
	measured: MeasuredArchitecture,
): Map<string, Record<string, string>> {
	const leaving = new Map<string, string[]>();
	for (const edge of edges)
		if (measured.nodes.get(edge.from)?.pointed !== undefined)
			leaving.set(edge.from, [...(leaving.get(edge.from) ?? []), edge.id]);
	const points = new Map<string, Record<string, string>>();
	for (const [from, ids] of leaving) {
		const inset = String(measured.nodes.get(from)!.pointed);
		ids.forEach((id, index) => {
			const end = ids.length > 1 && (index === 0 || index === ids.length - 1);
			const compass = end ? (index === 0 ? "sw" : "se") : "s";
			points.set(id, { [FROM_POINTS]: compass, [POINTS_INSET]: inset });
		});
	}
	return points;
}

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
 * The layout options that carry a container's header: its height at its
 * least width, and each width it can take with its height there.
 * @param measured The measured node.
 * @param measured.headerHeight Its header's height; zero for a card.
 * @param measured.headers Its header at each width it can take, when more than one.
 * @returns The options, or none for a card.
 */
function headerOptions({ headerHeight, headers }: MeasuredNode): Record<string, string> {
	if (headerHeight === 0) return {};
	const steps = headers?.map((header) => [header.width, header.headerHeight]);
	return {
		"archboard.header.size": String(headerHeight),
		...(steps === undefined ? {} : { [HEADER_STEPS]: JSON.stringify(steps) }),
	};
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
			...headerOptions(measured),
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
 * A relationship's own layout options: its order and kind, its look where
 * lines of another look keep apart, and its standing in a comparison.
 * @param edge The relationship.
 * @param standing Its standing, when the content is compared.
 * @param byLook Whether relationships that differ in emphasis or traffic stay on separate lanes.
 * @returns The options.
 */
function edgeOptions(
	edge: SemanticEdge,
	standing: ChangeKind | "unchanged" | undefined,
	byLook: boolean,
): Record<string, string> {
	return {
		"archboard.order": String(edge.order),
		"archboard.relationship.kind": edge.kind,
		...(byLook
			? {
					"archboard.relationship.emphasis": edge.emphasis,
					"archboard.relationship.traffic": edge.traffic === undefined ? "off" : "on",
				}
			: {}),
		...(standing === undefined ? {} : { "archboard.relationship.standing": standing }),
	};
}

/**
 * Construct one whole graph without rank, flank or boundary-port policies.
 * @param content The view's semantic content.
 * @param measured Its fixed text and card dimensions.
 * @param standings Comparison standings used to distinguish marked relationship channels.
 * @param entries The children that are entry points of the container around them ({@link entryPointsOf}).
 * @param byLook Whether relationships that differ in emphasis or traffic stay on separate lanes.
 * @returns The hierarchy and complete semantic relationships.
 */
function compoundGraph(
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings: Readonly<Record<string, ChangeKind>> | undefined,
	entries: ReadonlyMap<string, boolean>,
	byLook = false,
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
	const edges = content.edges.toSorted((one, other) => one.order - other.order);
	const points = pointsOf(edges, measured);
	return {
		id: "architecture:root",
		...captionOptions(measured),
		children,
		edges: edges.map((edge) => {
			const standing = standings === undefined ? undefined : (standings[edge.id] ?? "unchanged");
			return {
				id: edge.id,
				sources: [edge.from],
				targets: [edge.to],
				layoutOptions: {
					...edgeOptions(edge, standing, byLook),
					...points.get(edge.id),
				},
				labels: labelsOf(edge, measured),
			};
		}),
	};
}

export {
	ENTRY_POINT,
	FROM_POINTS,
	POINTS_INSET,
	GROUP_CAPTIONS,
	HEADER_STEPS,
	PLACING_GROUP,
	compoundGraph,
	entryPointsOf,
};

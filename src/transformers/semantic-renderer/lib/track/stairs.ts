// Chains Graphviz stepped sideways. Every labelled line is ranked as two legs
// through its label's box, and Graphviz sets x by the sum of each edge's
// weight times its sideways run. A card with one line in and one line out
// costs the same anywhere between its two neighbours, so Graphviz splits the
// offset between a chain's two ends into one step per rank instead of one
// jog, and the chain's lines leave and enter its cards off centre. Where a
// card stepped the same way on both sides, its two lines are weighed a
// little heavier and the block is placed again, which breaks the tie and
// stands the chain on one column. The second placement is kept only where it
// brings some stepped card into line with both its neighbours and keeps
// every node on its rank and in its order: otherwise the chain's ends stood
// fast and the tie only moved its steps along, pulling a fork off its other
// lines.
import type { Graph, Viz } from "@viz-js/viz";
import {
	NEAR_MISS,
	centresOf,
	outputSchema,
	type Join,
	type Output,
} from "@/transformers/semantic-renderer/lib/track/graphviz";

/**
 * How strongly a line through a stepped card pulls its ends into line:
 * just more than the others, to break Graphviz's tie and no more.
 */
const STAIR_WEIGHT = 2;

/**
 * The line into an item and the line out of it, when it has exactly one of
 * each and is not one of several cards between the same two.
 * @param name The item.
 * @param joins Every line Graphviz ranks.
 * @returns The two lines, or nothing.
 */
function passing(name: string, joins: readonly Join[]): [Join, Join] | undefined {
	const into = joins.filter(({ head }) => head === name);
	const out = joins.filter(({ tail }) => tail === name);
	if (into.length !== 1 || out.length !== 1) return undefined;
	const [above, below] = [into[0]!.tail, out[0]!.head];
	// One of several cards between the same two is a branch, not a link.
	const sides = new Set(joins.filter(({ tail }) => tail === above).map(({ head }) => head));
	const branch = joins.some(({ tail, head }) => head === below && tail !== name && sides.has(tail));
	return branch ? undefined : [into[0]!, out[0]!];
}

/** A card with one line in and one line out, and those lines. */
interface Link {
	readonly card: string;
	readonly into: Join;
	readonly out: Join;
}

/**
 * How far a link's card stands aside from the item above it and from the
 * item below it.
 * @param link The link.
 * @param centres Every vendor node's centre.
 * @returns The two offsets, each positive to the right.
 */
function steps(link: Link, centres: ReadonlyMap<string, { x: number }>): [number, number] {
	const [above, at, below] = [link.into.tail, link.card, link.out.head].map(
		(end) => centres.get(end)?.x ?? Number.NaN,
	);
	return [above! - at!, at! - below!];
}

/**
 * Every card Graphviz stepped: a card with one line in and one line out
 * that stands more than a near miss aside from both its neighbours, the
 * same way.
 * @param joins Every line Graphviz ranks, with the edges that draw it.
 * @param centres Every vendor node's centre.
 * @param card Whether a vendor node is a card.
 * @returns The stepped cards and their lines.
 */
function stairs(
	joins: readonly Join[],
	centres: ReadonlyMap<string, { x: number }>,
	card: (name: string) => boolean,
): Link[] {
	return [...new Set(joins.map(({ head }) => head))].flatMap((name) => {
		const lines = card(name) ? passing(name, joins) : undefined;
		if (lines === undefined) return [];
		const link = { card: name, into: lines[0], out: lines[1] };
		const [above, below] = steps(link, centres);
		return Math.abs(above) > NEAR_MISS && Math.abs(below) > NEAR_MISS && above * below > 0
			? [link]
			: [];
	});
}

/**
 * The graph with the edges of some lines weighed as a stair's: only the
 * edges of weight one, so a title's or a column's hold stays as it was.
 * @param graph The block's graph.
 * @param legs The ids of the edges to weigh.
 * @returns The reweighed graph.
 */
function weighed(graph: Graph, legs: ReadonlySet<string>): Graph {
	return {
		...graph,
		edges: (graph.edges ?? []).map((edge) => {
			const id = edge.attributes?.["id"];
			return typeof id === "string" && legs.has(id) && edge.attributes?.["weight"] === 1
				? { ...edge, attributes: { ...edge.attributes, weight: STAIR_WEIGHT } }
				: edge;
		}),
	};
}

/**
 * Every node's rank and its place along it, as one comparable key: the
 * nodes rank by rank from the top, each rank left to right.
 * @param output What Graphviz answered.
 * @returns The key.
 */
function ranking(output: Output): string {
	const ranks = new Map<number, { name: string; x: number }[]>();
	for (const [name, { x, y }] of centresOf(output, { x: 0, y: 0 })) {
		const rank = Math.round(y);
		ranks.set(rank, [...(ranks.get(rank) ?? []), { name, x }]);
	}
	return JSON.stringify(
		[...ranks]
			.toSorted(([one], [other]) => one - other)
			.map(([, nodes]) => nodes.toSorted((one, other) => one.x - other.x).map(({ name }) => name)),
	);
}

/**
 * Lay a block's graph out with Graphviz, and again with every chain it
 * stepped weighed into line, keeping the second only where it lines some
 * stepped card up with both its neighbours and every node keeps its rank and
 * its order along it.
 * @param viz The initialized Graphviz instance.
 * @param graph The block's graph.
 * @param joins Every line Graphviz ranks, with the edges that draw it.
 * @param card Whether a vendor node is a card.
 * @returns What Graphviz answered.
 */
function placedChains(
	viz: Viz,
	graph: Graph,
	joins: readonly Join[],
	card: (name: string) => boolean,
): Output {
	const first = outputSchema.parse(viz.renderJSON(graph, { yInvert: true }));
	const links = stairs(joins, centresOf(first, { x: 0, y: 0 }), card);
	if (links.length === 0) return first;
	const legs = new Set(
		links.flatMap(({ into, out }) => [...(into.legs ?? []), ...(out.legs ?? [])]),
	);
	const second = outputSchema.parse(viz.renderJSON(weighed(graph, legs), { yInvert: true }));
	const centres = centresOf(second, { x: 0, y: 0 });
	const lined = links.some((link) =>
		steps(link, centres).every((step) => Math.abs(step) <= NEAR_MISS),
	);
	return lined && ranking(second) === ranking(first) ? second : first;
}

export { placedChains };

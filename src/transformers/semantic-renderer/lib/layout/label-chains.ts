// A reserved label is its own Graphviz node on a chain from its line's tail to
// its head. Graphviz breaks a cycle one edge at a time, so a cycle through the
// chain turned one half of it round: the label then ranked beyond both of its
// line's ends, and the line ran past its target and turned back through its
// label in a loop. The chains a reading-order search meets going back up are
// turned round here first, both halves together, so the label always ranks
// between its ends; a plain edge is left for Graphviz to turn, as it would.
import type { Graph, Subgraph } from "@viz-js/viz";

type VendorEdge = NonNullable<Graph["edges"]>[number];

/**
 * One relationship as Graphviz ranks it: a plain edge, or the two halves
 * through its reserved label, tail to label and label to head.
 */
interface Chain {
	readonly tail: string;
	readonly head: string;
	readonly edges: readonly VendorEdge[];
}

/**
 * Turn round every reserved label's chain that a depth-first search from
 * each node in reading order meets going back up, both halves together.
 * @param graph The Graphviz graph, changed in place before it is laid out.
 */
function orientLabelChains(graph: Graph): void {
	for (const chain of backChains(readingOrder(graph), chainsOf(graph))) reverseChain(chain);
}

/**
 * Every ranking relationship as Graphviz would break a cycle through it.
 * @param graph The Graphviz graph.
 * @returns The chains.
 */
function chainsOf(graph: Graph): Chain[] {
	const ranking = (graph.edges ?? []).filter((edge) => edge.attributes?.["constraint"] !== false);
	const second = new Map(
		ranking.filter((edge) => edge.tail.startsWith("label_")).map((edge) => [edge.tail, edge]),
	);
	return ranking
		.filter((edge) => !edge.tail.startsWith("label_"))
		.map((edge) => {
			const rest = second.get(edge.head);
			return rest === undefined
				? { tail: edge.tail, head: edge.head, edges: [edge] }
				: { tail: edge.tail, head: rest.head, edges: [edge, rest] };
		});
}

/**
 * Every node but reserved labels, frame by frame, titles first: the order
 * the search starts from.
 * @param graph The Graphviz graph.
 * @returns The nodes.
 */
function readingOrder(graph: Graph): string[] {
	const order: string[] = [];
	/**
	 * Add a cluster's nodes, then its clusters'.
	 * @param cluster The cluster.
	 */
	const collect = (cluster: Graph | Subgraph): void => {
		for (const node of cluster.nodes ?? [])
			if (!node.name.startsWith("label_")) order.push(node.name);
		for (const sub of cluster.subgraphs ?? []) collect(sub);
	};
	collect(graph);
	return order;
}

/**
 * The chains a depth-first search from each node in turn meets as back edges.
 * @param order The nodes to start from, in order.
 * @param chains Every ranking chain.
 * @returns The chains that close a cycle.
 */
function backChains(order: readonly string[], chains: readonly Chain[]): Set<Chain> {
	const out = new Map<string, Chain[]>();
	for (const chain of chains) out.set(chain.tail, [...(out.get(chain.tail) ?? []), chain]);
	const open = new Set<string>();
	const done = new Set<string>();
	const back = new Set<Chain>();
	/**
	 * Search down from one node, marking each chain back to an open node.
	 * @param node The node.
	 */
	const visit = (node: string): void => {
		open.add(node);
		for (const chain of out.get(node) ?? []) {
			if (open.has(chain.head)) back.add(chain);
			else if (!done.has(chain.head)) visit(chain.head);
		}
		open.delete(node);
		done.add(node);
	};
	for (const node of order) if (!done.has(node)) visit(node);
	return back;
}

/**
 * Turn a reserved label's chain round, both halves together; a plain edge
 * stays as it is.
 * @param chain The chain.
 */
function reverseChain(chain: Chain): void {
	const [first, rest] = chain.edges;
	if (rest === undefined) return;
	const label = first!.head;
	Object.assign(first!, { tail: chain.head, head: label });
	Object.assign(rest, { tail: label, head: chain.tail });
}

export { orientLabelChains };

// Where the label of a line entering a container is held (visual polish).
// The label stands inside the container, below its title, so it stands over
// the card the line leads into. Held below the title, the hold is an
// invisible edge down every rank between, and Graphviz keeps its chain of
// virtual nodes a node gap from each member it passes: the member stands a
// slot in from the container's wall, out of the column of the members below
// it, and the container is a slot wider than they need. Where another
// labelled line comes into the same card from inside the container, the
// label is held below that line's upper end instead, a member already below
// the title, so the hold spans only ranks a drawn line spans. The anchor
// re-ranks the block, so it is only kept where that reads no worse.
import type { Clusters } from "@/transformers/semantic-renderer/lib/blocks/clusters";
import type { Join } from "@/transformers/semantic-renderer/lib/track/graphviz";

/** A line Graphviz ranks, between the vendor nodes it joins. */
type Link = Join & { readonly labelled: boolean };

/**
 * The innermost container a line enters: a frame its lower end stands in
 * and its upper end does not. A group region is no boundary a line must go
 * round, so a line enters none.
 * @param clusters The block's clusters.
 * @param tail The line's upper end.
 * @param head Its lower end.
 * @returns The frame, or nothing.
 */
function enteredFrame(clusters: Clusters, tail: string, head: string): string | undefined {
	if (head.startsWith("title:")) return undefined;
	const theirs = new Set(clusters.around(tail));
	return clusters
		.around(head)
		.find((id) => !theirs.has(id) && clusters.block.clusters.get(id)!.kind === "frame");
}

/**
 * The upper end of another labelled line into the same card from inside the
 * container a line enters, which its label may be held below.
 * @param clusters The block's clusters.
 * @param tail The entering line's upper end.
 * @param head Its lower end.
 * @param entered The container it enters.
 * @param links Every line Graphviz ranks.
 * @returns The other line's upper end, or nothing.
 */
function anchorOf(
	clusters: Clusters,
	tail: string,
	head: string,
	entered: string,
	links: readonly Link[],
): string | undefined {
	return links.find(
		(link) =>
			link.head === head &&
			link.labelled &&
			link.tail !== tail &&
			clusters.around(link.tail).includes(entered),
	)?.tail;
}

/**
 * Whether anchoring would hold some entering line's label below another
 * line rather than below its container's title.
 * @param clusters The block's clusters.
 * @param links Every line Graphviz ranks.
 * @returns True when it would.
 */
function anchorable(clusters: Clusters, links: readonly Link[]): boolean {
	return links.some(({ tail, head, labelled }) => {
		const entered = labelled ? enteredFrame(clusters, tail, head) : undefined;
		return entered !== undefined && anchorOf(clusters, tail, head, entered, links) !== undefined;
	});
}

export { anchorable, anchorOf, enteredFrame, type Link };

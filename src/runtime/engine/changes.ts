// Diff settled states through `compareBoards`, assigning temporary
// `el:<elementId>` identities to anonymous shapes. Structural and layout
// changes produce events; cosmetic and unnamed changes stay silent.
import type { ServerElement } from "@/runtime/engine/types";
import type { BoardIdentity } from "@/runtime/engine/board";
import { compareBoards } from "@/runtime/engine/compare";
import type { ClusterChange, CompareResult, RelationChange } from "@/runtime/engine/compare";
import { headlineFor } from "@/runtime/engine/lib/change-headline";
import { narrateChange } from "@/runtime/engine/lib/change-narration";
import {
	ANON_NODE_PREFIX,
	applyIdentityPairs,
	identityPairs,
	isAnonymousNode,
	withSyntheticNodeIds,
} from "@/runtime/engine/lib/change-node-identity";
import type {
	EdgeRef,
	EdgeReroute,
	NodeFieldChange,
	NodeIdentityChange,
	NodeRef,
} from "@/runtime/engine/lib/change-refs";
import type {
	ChangeCounts,
	ChangedEdges,
	ChangedLayout,
	ChangedNodes,
	Significance,
} from "@/runtime/engine/lib/change-sections";
import {
	countsOf,
	edgeSectionsOf,
	hasCosmeticChange,
	identityChangesOf,
	layoutSectionsOf,
	nameIndexOf,
	nodeSectionsOf,
	significanceOf,
} from "@/runtime/engine/lib/change-sections";

type DeepReadonly<T> = T extends ClusterChange | RelationChange
	? Readonly<T>
	: T extends readonly (infer Item)[]
		? readonly DeepReadonly<Item>[]
		: T extends object
			? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
			: T;

/** Everything one settling of a board changed, said the way a reader can use. */
interface SemanticChange {
	significance: Significance;
	/** One sentence. Safe to speak; safe to put in a log line. */
	headline: string;
	nodes: ChangedNodes;
	edges: ChangedEdges;
	layout: ChangedLayout;
	/** Node id → reader-facing name; includes every id in this change. */
	names: Record<string, string>;
	counts: ChangeCounts;
	warnings: string[];
	/** Complete compare result; surfaces omit it unless requested. */
	detail: CompareResult;
}

/**
 * What happened to a board between two settled moments.
 *
 * Both sides are diffed under the same board identity, with anonymous shapes
 * given temporary ids and any promotion's identity transition resolved first,
 * so a promotion reads as one node changing rather than as one node leaving
 * and another arriving.
 * @param before The board's elements at the earlier moment.
 * @param after The board's elements now.
 * @param identity Which board this is, used on both sides.
 * @param key The comparison key; the board's own name unless a caller needs
 * to diff two moments under a name of its own choosing.
 * @returns The change, headline included.
 */
function diffBoardStates<const Elements extends readonly ServerElement[]>(
	before: Elements,
	after: Elements,
	identity: DeepReadonly<BoardIdentity>,
	key = identity.board,
): SemanticChange {
	const beforeNodes = withSyntheticNodeIds(before);
	const afterNodes = withSyntheticNodeIds(after);
	const pairs = identityPairs(beforeNodes, afterNodes);
	const alignedBefore = pairs.length === 0 ? beforeNodes : applyIdentityPairs(beforeNodes, pairs);
	const compared = compareBoards(
		{ key, identity, elements: alignedBefore },
		{ key, identity, elements: afterNodes },
	);
	const detail: DeepReadonly<CompareResult> = compared;

	const nodes = nodeSectionsOf(detail, identityChangesOf(pairs, detail));
	const edges = edgeSectionsOf(detail);
	const layout = layoutSectionsOf(detail);
	const counts = countsOf(nodes, edges, layout);
	const change: SemanticChange = {
		significance: significanceOf(counts, hasCosmeticChange(detail)),
		headline: "",
		nodes,
		edges,
		layout,
		names: nameIndexOf(detail),
		counts,
		warnings: [...detail.warnings],
		detail: compared,
	};
	change.headline = headlineFor(change);
	return change;
}

export {
	ANON_NODE_PREFIX,
	diffBoardStates,
	headlineFor,
	isAnonymousNode,
	narrateChange,
	withSyntheticNodeIds,
};
export type {
	EdgeRef,
	EdgeReroute,
	NodeFieldChange,
	NodeIdentityChange,
	NodeRef,
	SemanticChange,
	Significance,
};

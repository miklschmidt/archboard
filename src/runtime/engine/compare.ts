// `compare` — a structured semantic diff between two variants of a board.
//
// Two variants are separate notes in the vault, authored independently
// (ADR 0004), so their Excalidraw element ids have nothing in common. The join
// key is `customData.archboard.node` — the stable logical node id promotion
// assigns — which is what makes this a diff of the *architecture* rather than a
// diff of the drawing.
//
// GOVERNING CONSTRAINT: SUFFICIENCY, NOT NARRATABILITY.
//
// `describe` is written for a voice turn and deliberately degrades on big
// scenes. This is the opposite. The consumer is a full agent thread that will
// narrate the result itself and can ask the human a follow-up question, so the
// job here is to make sure everything needed to explain the difference between
// two boards is present. Nothing is pre-digested into prose and nothing is
// truncated to fit a budget: no sentence is composed here, and every list is
// complete. Where a limit exists at all (the pairwise relation pass) it is
// declared in `warnings` rather than applied silently.
//
// ── The layout model ───────────────────────────────────────────
//
// Rearranging a board is a statement about the design, so a pure graph diff
// throws away information the human deliberately expressed. But raw coordinate
// deltas are noise — nobody means anything by 12px, and a board that was tidied
// wholesale would produce a diff of nothing but movement. So layout is reported
// through six signals, every one of them *relative* and therefore invariant
// under panning, scaling and wholesale tidying:
//
//   cluster      which nodes sit together, as a partition of node ids
//                (proximity, layout.ts's CLUSTER_GAP — the same clusters
//                `describe` names, so the two agree)
//   containment  the smallest shape a node sits inside: an explicit boundary
//                box someone drew round a subsystem
//   group        Excalidraw group membership — grouping is the one layout act
//                that is unambiguously deliberate
//   region       whereabouts on the board, in thirds of the box round the
//                nodes *both* boards have — anchored to the join, as cluster
//                is, so an arriving or departing node cannot rename its
//                neighbours' whereabouts
//   relation     the coarse direction between two nodes (above / left-of /
//                above-left …), computed only for pairs that are edge-connected
//                or co-clustered on either side — relations among things that
//                are actually related
//   prominence   node area against the median node on its own board: whether
//                someone drew it bigger than its neighbours
//
// WHAT THIS DELIBERATELY CANNOT EXPRESS — every one of these is a change a
// human can make that comes back as "no layout change", and the narrating agent
// must not claim otherwise:
//
//   · absolute position. A board dragged wholesale, zoomed, or redrawn at a
//     different scale reports nothing. That is the point.
//   · movement below the thresholds. A nudge that neither crosses a region
//     boundary nor breaks the 160px cluster gap is invisible.
//   · tidiness. Alignment, even spacing, orthogonal edge routing, straightened
//     arrows — no signal at all.
//   · edge geometry. An edge dragged round an obstacle keeps its endpoints, so
//     it reads as unchanged.
//   · ordering inside a cluster, unless the pair is edge-connected or
//     co-clustered (co-clustered pairs are, so this mostly bites between
//     clusters).
//   · region is relative to each side's own frame, so the two sides' thirds
//     are not the same physical place; `boxAspectDiverged` warns when the two
//     frames are shaped differently enough for that to matter. Below two
//     shared nodes there is nothing to anchor the frame to and each side falls
//     back to its own node box, where one far-flung node re-frames everything.
//   · a node left exactly where it was while the board was rearranged round it.
//     Its region name moved, but nothing about the node did, so no region
//     change is reported for it — the nodes that were moved report instead.
//   · absolute size, colour and stroke, which are reported per node as
//     `cosmetic` and never counted as a semantic change.
//
// ── Elements that are not nodes ────────────────────────────────
//
// A plain shape has no stable identity across independently authored boards, so
// diffing them element-by-element would be false precision: an unlabelled
// scratch box on each side is not "the same box" in any sense the tool can
// establish. They are therefore never added/removed/changed. They are still
// reported, because they carry information a human put there:
//
//   · a per-side inventory, exhaustive for labelled shapes;
//   · a label-match hint for labelled shapes present on one side only, marked
//     as the heuristic it is;
//   · `unidentified` — elements carrying archboard metadata but no node id,
//     which are the actionable ones: they are a promotion away from comparing;
//   · they participate as containment parents, which is how "someone drew a
//     boundary round these three" survives.

import { withoutValidBridgeDecorations } from "@/runtime/board-inspection/bridge";
import { CLUSTER_GAP } from "@/runtime/engine/layout";
import type {
	ClusterChange,
	CompareResult,
	CompareSideInput,
	SideSummary,
} from "@/runtime/engine/lib/compare-contract";
import {
	buildBoard,
	hasDivergentAspect,
	reframeRegions,
} from "@/runtime/engine/lib/compare-board-model";
import type { BoardModel } from "@/runtime/engine/lib/compare-board-model";
import { diffPartitions } from "@/runtime/engine/lib/compare-diff";
import { inferReroutes, matchEdges } from "@/runtime/engine/lib/compare-edge-diff";
import { type NodeDiff, diffNodes } from "@/runtime/engine/lib/compare-node-diff";
import {
	type RelationDiff,
	diffRelations,
	relatedPairsOf,
} from "@/runtime/engine/lib/compare-relations";
import {
	divergentFrameWarning,
	joinWarnings,
	relationBudgetWarning,
} from "@/runtime/engine/lib/compare-warnings";

/**
 * What one side of the comparison is: which board, where it came from, and
 * how much of it there is.
 * @param input The board as the caller named it.
 * @param model The board as the comparison read it.
 * @returns The summary.
 */
const sideSummaryOf = (input: CompareSideInput, model: BoardModel): SideSummary => ({
	board: input.key,
	identity: input.identity,
	...(input.file ? { file: input.file } : {}),
	...(input.savedAt ? { savedAt: input.savedAt } : {}),
	elementCount: input.elements.length,
	nodeCount: model.nodes.size,
	edgeCount: model.edges.length,
	plainCount: model.plain.count,
	nodeBox: model.nodeBox,
	regionFrame: model.regionFrame,
});

/**
 * The words on a board's plain shapes, which is all a label-match hint has
 * to go on.
 * @param model The board.
 * @returns The labels.
 */
const plainLabels = (model: BoardModel): Set<string> =>
	new Set(
		model.plain.labelled.map((labelled) => labelled.label).filter((label) => label !== undefined),
	);

const LAYOUT_METHOD: Record<string, string> = {
	cluster:
		`Which other nodes this one sits within ${CLUSTER_GAP}px of, as a set of node ids. Membership, ` +
		"not position: a cluster that was dragged across the board unchanged reports nothing.",
	container:
		"The smallest shape strictly containing the node — a boundary someone drew round a subsystem. " +
		"Keyed by node id when the container is itself a node, else by its label.",
	group:
		"Excalidraw group membership, as a set of node ids. Excalidraw group ids are random per board, so " +
		"only the membership compares.",
	region:
		"Whereabouts on the board, in thirds of the box round the nodes both boards have (reported per " +
		"side as regionFrame). Anchored to the shared nodes so that a node present on only one side cannot " +
		"rename its neighbours' whereabouts; nodes on one side only are still placed in that frame, and are " +
		"clamped to an edge third when they sit outside it. Reported as a change only when the node's own " +
		"centre moved, so a region name that shifted because the frame did is not called movement. Still " +
		"relative to each side's own frame, so the two sides' thirds are not the same physical place — see " +
		"boxAspectDiverged.",
	relation:
		"Coarse direction between two nodes (above / below / left-of / right-of / above-left …), computed " +
		"only for pairs that are edge-connected or co-clustered on either side.",
	prominence:
		"Node area against the median node on its own board: smaller / typical / larger. Relative, so " +
		"a board drawn at a different scale reports nothing.",
};

const LAYOUT_CANNOT_EXPRESS = [
	"Absolute position. A board panned, zoomed or redrawn at another scale reports no layout change — deliberate.",
	`Movement below the thresholds: a nudge that neither crosses a region third nor breaks the ${CLUSTER_GAP}px cluster gap is invisible.`,
	"Tidiness: alignment, even spacing, straightened or orthogonal edges produce no signal at all.",
	"Edge geometry: an edge dragged round an obstacle keeps its endpoints and reads as unchanged.",
	"Ordering between clusters that share no edge — relations are only computed for pairs that are edge-connected or co-clustered.",
	'Region names are relative to each side\'s own frame — the box round the nodes both boards have — so "top-left" on one is not the same physical place as on the other; see boxAspectDiverged.',
	"A node that stayed exactly where it was while the board was rearranged round it reports no region change, because its region name only moved when the frame did. The nodes that were actually moved still report; read those.",
	"Where two boards share fewer than two nodes there is nothing to anchor the frame to, so each side is framed by its own nodes and one far-flung node re-frames every region on that side.",
	"Size, colour and stroke are reported per node as `cosmetic` and never counted as a change to the architecture.",
];

/**
 * The structured semantic diff between two variants of a board.
 * @param fromInput The board being compared from.
 * @param toInput The board being compared to.
 * @returns Everything a narrating agent needs to explain the difference.
 */
function compareBoards(fromInput: CompareSideInput, toInput: CompareSideInput): CompareResult {
	const from = { ...fromInput, elements: withoutValidBridgeDecorations(fromInput.elements) };
	const to = { ...toInput, elements: withoutValidBridgeDecorations(toInput.elements) };
	const A = buildBoard(from);
	const B = buildBoard(to);
	const warnings = [...A.warnings, ...B.warnings];

	// The nodes the join actually joined. Layout is only compared in terms of
	// these, so an added node cannot make its neighbours look like they moved:
	// cluster membership ignores them (see `layoutFields`) and the region frame
	// is drawn round them and nothing else.
	const sharedIds = new Set([...A.nodes.keys()].filter((id) => B.nodes.has(id)));
	reframeRegions(A, sharedIds);
	reframeRegions(B, sharedIds);

	const nodes = diffNodes({ from, to, A, B, sharedIds });
	const edgeDiff = matchEdges(A.edges, B.edges);
	const layout = diffLayout(A, B, nodes, warnings);

	// "Identical" is a claim about the architecture, so it is only ever made when
	// there was an architecture to compare: an unpromoted board differs from
	// another unpromoted board in every visible way and this diff cannot see any
	// of it.
	const comparable = nodes.shared > 0 || (A.elements.length === 0 && B.elements.length === 0);
	warnings.push(...joinWarnings(A, B, from, to, nodes.shared, comparable));

	return {
		success: true,
		from: sideSummaryOf(from, A),
		to: sideSummaryOf(to, B),
		summary: summaryOf(nodes, edgeDiff, layout, comparable),
		nodes: {
			added: nodes.added,
			removed: nodes.removed,
			changed: nodes.changed,
			unchanged: nodes.unchanged,
		},
		edges: {
			added: edgeDiff.added,
			removed: edgeDiff.removed,
			changed: edgeDiff.changed,
			unchanged: edgeDiff.unchanged,
			rerouted: inferReroutes(edgeDiff.removed, edgeDiff.added),
			unresolved: { from: A.unresolved, to: B.unresolved },
		},
		layout: {
			method: LAYOUT_METHOD,
			cannotExpress: LAYOUT_CANNOT_EXPRESS,
			clusters: { from: A.clusters, to: B.clusters, changes: layout.clusters },
			groups: { from: A.groups, to: B.groups, changes: layout.groups },
			moved: nodes.moved,
			relations: { compared: layout.relations.compared, changes: layout.relations.changes },
			boxAspectDiverged: layout.boxAspectDiverged,
		},
		plain: plainComparison(A, B),
		warnings,
	};
}

/** What the layout pass found, beyond the moves the node pass reported. */
interface LayoutDiff {
	clusters: ClusterChange[];
	groups: ClusterChange[];
	relations: RelationDiff;
	boxAspectDiverged: boolean;
}

/**
 * How the two boards lay their nodes out differently: which clusters and
 * groups changed, which pairs lie differently, and whether the two frames are
 * comparable at all.
 * @param A One board.
 * @param B The other.
 * @param nodes What the node pass found, whose layout signal count this adds to.
 * @param warnings The comparison's warnings, extended in place.
 * @returns The layout differences.
 */
function diffLayout(A: BoardModel, B: BoardModel, nodes: NodeDiff, warnings: string[]): LayoutDiff {
	const related = relatedPairsOf(A, B);
	const relations = diffRelations(A, B, related);
	if (relations.overBudget) {
		warnings.push(relationBudgetWarning(related.pairs.size));
	} else {
		nodes.layoutSignalsChanged += relations.changes.length;
	}
	// Measured on the region frames, since those are what the region names are
	// thirds of. Both are drawn round the same set of nodes, so a divergence
	// here is a real difference in how the two boards lay those nodes out.
	const boxAspectDiverged = hasDivergentAspect(A.regionFrame, B.regionFrame);
	if (boxAspectDiverged) {
		warnings.push(divergentFrameWarning());
	}
	return {
		clusters: diffPartitions(A.clusters, B.clusters),
		groups: diffPartitions(A.groups, B.groups),
		relations,
		boxAspectDiverged,
	};
}

/**
 * The comparison in numbers, and whether it found anything to compare.
 * @param nodes What the node pass found.
 * @param edges What the connector pass found.
 * @param layout What the layout pass found.
 * @param comparable Whether there was an architecture to compare.
 * @returns The summary.
 */
function summaryOf(
	nodes: NodeDiff,
	edges: ReturnType<typeof matchEdges>,
	layout: LayoutDiff,
	comparable: boolean,
): CompareResult["summary"] {
	return {
		comparable,
		identical: comparable && isIdentical(nodes, edges),
		sharedNodes: nodes.shared,
		nodesAdded: nodes.added.length,
		nodesRemoved: nodes.removed.length,
		nodesChanged: nodes.changed.length,
		nodesUnchanged: nodes.unchanged.length,
		nodesMovedOnly: nodes.unchanged.filter((u) => u.layoutChanges).length,
		edgesAdded: edges.added.length,
		edgesRemoved: edges.removed.length,
		edgesChanged: edges.changed.length,
		edgesUnchanged: edges.unchanged.length,
		layoutSignalsChanged: nodes.layoutSignalsChanged,
		...(layout.boxAspectDiverged ? {} : {}),
	};
}

/**
 * Whether nothing about the architecture differs: no node or connector added,
 * removed or changed, and no layout signal moved.
 * @param nodes What the node pass found.
 * @param edges What the connector pass found.
 * @returns True when the two boards say the same thing.
 */
function isIdentical(nodes: NodeDiff, edges: ReturnType<typeof matchEdges>): boolean {
	const touched = [
		nodes.added,
		nodes.removed,
		nodes.changed,
		edges.added,
		edges.removed,
		edges.changed,
	];
	return touched.every((list) => list.length === 0) && nodes.layoutSignalsChanged === 0;
}

/**
 * The plain shapes each board holds, and which of their labels appear on one
 * side or on both — a hint, and marked as the heuristic it is.
 * @param A One board.
 * @param B The other.
 * @returns The plain-element comparison.
 */
function plainComparison(A: BoardModel, B: BoardModel): CompareResult["plain"] {
	const labelsA = plainLabels(A);
	const labelsB = plainLabels(B);
	return {
		from: A.plain,
		to: B.plain,
		labelOnlyOnFrom: [...labelsA].filter((l) => !labelsB.has(l)).toSorted(),
		labelOnlyOnTo: [...labelsB].filter((l) => !labelsA.has(l)).toSorted(),
		labelOnBoth: [...labelsA].filter((l) => labelsB.has(l)).toSorted(),
	};
}

export type {
	CompareSideInput,
	SideSummary,
	NodeFacts,
	NodeLayout,
	FieldChange,
	ChangedNode,
	UnchangedNode,
	EdgeFacts,
	ChangedEdge,
	UnresolvedConnector,
	PlainElement,
	PlainSide,
	ClusterFacts,
	ClusterChange,
	RelationChange,
	CompareResult,
} from "@/runtime/engine/lib/compare-contract";
export { compareBoards };

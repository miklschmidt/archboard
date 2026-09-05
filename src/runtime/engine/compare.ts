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

import { withoutValidBridgeDecorations } from "../board-inspection/bridge.js";
import { CLUSTER_GAP, sameCentre } from "./layout.js";
import type {
	ChangedNode,
	CompareResult,
	CompareSideInput,
	NodeFacts,
	RelationChange,
	SideSummary,
	UnchangedNode,
} from "./lib/compare-contract.js";
import { buildBoard, hasDivergentAspect, reframeRegions } from "./lib/compare-board-model.js";
import type { BoardModel } from "./lib/compare-board-model.js";
import { formatBinding } from "./lib/compare-node-model.js";
import {
	cosmeticFields,
	diffFields,
	diffPartitions,
	inferReroutes,
	layoutFields,
	matchEdges,
	MAX_RELATION_PAIRS,
	nodeFacts,
	relationOf,
	semanticFields,
} from "./lib/compare-diff.js";

const pairKey = (x: string, y: string): string => (x < y ? `${x}\0${y}` : `${y}\0${x}`);
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

const bindingField = (binding: string | undefined): { binding: string } | Record<string, never> =>
	binding === undefined ? {} : { binding };

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

	// --- nodes ----------------------------------------------------------------
	const allNodeIds = new Set([...A.nodes.keys(), ...B.nodes.keys()]);
	const added: NodeFacts[] = [];
	const removed: NodeFacts[] = [];
	const changed: ChangedNode[] = [];
	const unchanged: UnchangedNode[] = [];
	const moved: CompareResult["layout"]["moved"] = [];
	let layoutSignalsChanged = 0;
	let shared = 0;

	for (const id of [...allNodeIds].toSorted()) {
		const a = A.nodes.get(id);
		const b = B.nodes.get(id);
		if (a && !b) {
			removed.push(nodeFacts(a, A.clusters));
			continue;
		}
		if (!a && b) {
			added.push(nodeFacts(b, B.clusters));
			continue;
		}
		if (!a || !b) {
			continue;
		}
		shared++;

		const semantic = diffFields(
			semanticFields(a, from.identity.variant),
			semanticFields(b, to.identity.variant),
		);
		const cosmetic = diffFields(cosmeticFields(a), cosmeticFields(b));
		const layout = diffFields(
			layoutFields(a, A.clusters, A.groups, sharedIds),
			layoutFields(b, B.clusters, B.groups, sharedIds),
		);
		// Anchoring the frame to the shared nodes stops arrivals and departures
		// renaming anybody's region, but a *shared* node dragged to a new extreme
		// still stretches the frame, and its stationary neighbours are handed new
		// region names for it. Region is read off the centre and nothing else, so
		// a centre that did not move is proof the new name came from the frame:
		// report it and the feed says "X moved", which is false about X.
		//
		// Only ever true when both sides are in one coordinate system — the same
		// board a moment apart, or a variant copied from its sibling — which is
		// exactly where "moved" is read as a claim about something someone did.
		// Two independently drawn variants never trip it, and there the anchored
		// frame carries the weight on its own.
		//
		// A board rearranged wholesale is untouched by this: every centre moved,
		// so nothing is suppressed and every move is still reported.
		if (layout["region"] && sameCentre(a.box, b.box)) {
			delete layout["region"];
		}
		layoutSignalsChanged += Object.keys(layout).length;
		if (Object.keys(layout).length > 0) {
			moved.push({ node: id, name: b.name, changes: layout });
		}

		if (Object.keys(semantic).length > 0) {
			changed.push({
				node: id,
				name: b.name,
				changes: semantic,
				...(Object.keys(cosmetic).length > 0 ? { cosmeticChanges: cosmetic } : {}),
				...(Object.keys(layout).length > 0 ? { layoutChanges: layout } : {}),
				from: nodeFacts(a, A.clusters),
				to: nodeFacts(b, B.clusters),
			});
		} else {
			const binding = formatBinding(b.binding);
			unchanged.push({
				node: id,
				name: b.name,
				...(b.kind ? { kind: b.kind } : {}),
				...bindingField(binding),
				...(Object.keys(layout).length > 0 ? { layoutChanges: layout } : {}),
				...(Object.keys(cosmetic).length > 0 ? { cosmeticChanges: cosmetic } : {}),
				facts: nodeFacts(b, B.clusters),
			});
		}
	}

	// --- edges ----------------------------------------------------------------
	const edgeDiff = matchEdges(A.edges, B.edges);
	const rerouted = inferReroutes(edgeDiff.removed, edgeDiff.added);

	// --- layout ---------------------------------------------------------------
	const clusterChanges = diffPartitions(A.clusters, B.clusters);
	const groupChanges = diffPartitions(A.groups, B.groups);

	// Relations, over the pairs that are actually related on either side.
	const relatedPairs = new Set<string>();
	const reason = new Map<string, Set<"edge" | "cluster">>();
	const mark = (x: string, y: string, why: "edge" | "cluster"): void => {
		if (x === y) {
			return;
		}
		if (!A.nodes.has(x) || !B.nodes.has(x) || !A.nodes.has(y) || !B.nodes.has(y)) {
			return;
		}
		const key = pairKey(x, y);
		relatedPairs.add(key);
		const set = reason.get(key) ?? new Set();
		set.add(why);
		reason.set(key, set);
	};
	for (const e of [...A.edges, ...B.edges]) {
		mark(e.from, e.to, "edge");
	}
	for (const c of [...A.clusters, ...B.clusters]) {
		if (c.members.length > 40) {
			// A 40-member blob is not a statement about any pair.
			continue;
		}
		for (let i = 0; i < c.members.length; i++) {
			for (let j = i + 1; j < c.members.length; j++) {
				const x = c.members.at(i);
				const y = c.members.at(j);
				if (x !== undefined && y !== undefined) {
					mark(x, y, "cluster");
				}
			}
		}
	}

	const relationChanges: RelationChange[] = [];
	let relationsCompared = 0;
	if (relatedPairs.size > MAX_RELATION_PAIRS) {
		warnings.push(
			`${relatedPairs.size} related node pairs is past the ${MAX_RELATION_PAIRS}-pair budget for the ` +
				"relative-direction pass, so relation changes were not computed. Every other layout signal " +
				"(cluster, container, group, region, prominence) is complete.",
		);
	} else {
		for (const key of relatedPairs) {
			const [x, y] = key.split("\0");
			const fromX = x === undefined ? undefined : A.nodes.get(x);
			const fromY = y === undefined ? undefined : A.nodes.get(y);
			const toX = x === undefined ? undefined : B.nodes.get(x);
			const toY = y === undefined ? undefined : B.nodes.get(y);
			const why = reason.get(key);
			if (x === undefined || y === undefined || !fromX || !fromY || !toX || !toY || !why) {
				continue;
			}
			const before = relationOf(fromX.box, fromY.box);
			const after = relationOf(toX.box, toY.box);
			relationsCompared++;
			if (before === after) {
				continue;
			}
			let related: "edge" | "cluster" | "edge+cluster" = "cluster";
			if (why.has("edge")) {
				related = why.has("cluster") ? "edge+cluster" : "edge";
			}
			relationChanges.push({
				a: x,
				b: y,
				from: before,
				to: after,
				related,
			});
		}
		layoutSignalsChanged += relationChanges.length;
	}

	// Measured on the region frames, since those are what the region names are
	// thirds of. Both are drawn round the same set of nodes, so a divergence
	// here is a real difference in how the two boards lay those nodes out.
	const boxAspectDiverged = hasDivergentAspect(A.regionFrame, B.regionFrame);
	if (boxAspectDiverged) {
		warnings.push(
			"The two boards frame the nodes they share differently enough (aspect ratio differs by more than half " +
				'again) that region names are not directly comparable — "top-left" on one is not the same physical ' +
				"place as on the other. Read cluster, container and relation changes instead; region changes here may " +
				"be an artefact of the frame rather than anything anyone moved.",
		);
	}

	// --- plain elements -------------------------------------------------------
	const labelsA = plainLabels(A);
	const labelsB = plainLabels(B);

	// --- warnings that are about the comparison itself ------------------------
	//
	// Whether the join found anything at all. Without it, an empty diff would be
	// indistinguishable from two identical boards, and "nothing changed" is the
	// most damaging thing to say wrongly.
	const comparable = shared > 0 || (A.elements.length === 0 && B.elements.length === 0);

	if (A.nodes.size === 0 && B.nodes.size === 0 && !comparable) {
		warnings.push(
			"Neither board has a single promoted node, so there is nothing to compare on and the empty node and " +
				'edge sections below mean "could not be compared", not "unchanged" — summary.comparable is false. ' +
				"Everything that is known is in the plain-element inventory. Promote the boxes on both boards " +
				"(`promote --kind ...`) to give them the node ids this diff joins on.",
		);
	} else if (A.nodes.size === 0 || B.nodes.size === 0) {
		const empty = A.nodes.size === 0 ? from.key : to.key;
		warnings.push(
			`"${empty}" has no promoted nodes at all, so every node on the other board reads as added or removed. ` +
				"That is an artefact of nothing having been promoted, not a statement about the architecture.",
		);
	} else if (shared === 0) {
		warnings.push(
			"The two boards share no node ids, so nothing could be joined and every node reads as added or removed. " +
				"The boards were promoted independently: re-promote with matching `--node` ids (or promote the " +
				"proposal from a copy of the current board) to make them comparable.",
		);
		const overlap = [...new Set([...A.nodes.values()].map((n) => n.name))].filter((name) =>
			[...B.nodes.values()].some((n) => n.name === name),
		);
		if (overlap.length > 0) {
			warnings.push(
				`${overlap.length} node name(s) do appear on both boards despite the ids differing — ` +
					`${overlap.slice(0, 12).join(", ")}${overlap.length > 12 ? ", …" : ""}. Same label, different node ` +
					"id: almost certainly the same architectural unit promoted twice.",
			);
		}
	}

	// "Identical" is a claim about the architecture, so it is only ever made when
	// there was an architecture to compare: an unpromoted board differs from
	// another unpromoted board in every visible way and this diff cannot see any
	// of it.
	const identical =
		comparable &&
		added.length === 0 &&
		removed.length === 0 &&
		changed.length === 0 &&
		edgeDiff.added.length === 0 &&
		edgeDiff.removed.length === 0 &&
		edgeDiff.changed.length === 0 &&
		layoutSignalsChanged === 0;

	return {
		success: true,
		from: sideSummaryOf(from, A),
		to: sideSummaryOf(to, B),
		summary: {
			comparable,
			identical,
			sharedNodes: shared,
			nodesAdded: added.length,
			nodesRemoved: removed.length,
			nodesChanged: changed.length,
			nodesUnchanged: unchanged.length,
			nodesMovedOnly: unchanged.filter((u) => u.layoutChanges).length,
			edgesAdded: edgeDiff.added.length,
			edgesRemoved: edgeDiff.removed.length,
			edgesChanged: edgeDiff.changed.length,
			edgesUnchanged: edgeDiff.unchanged.length,
			layoutSignalsChanged,
		},
		nodes: { added, removed, changed, unchanged },
		edges: {
			added: edgeDiff.added,
			removed: edgeDiff.removed,
			changed: edgeDiff.changed,
			unchanged: edgeDiff.unchanged,
			rerouted,
			unresolved: { from: A.unresolved, to: B.unresolved },
		},
		layout: {
			method: LAYOUT_METHOD,
			cannotExpress: LAYOUT_CANNOT_EXPRESS,
			clusters: { from: A.clusters, to: B.clusters, changes: clusterChanges },
			groups: { from: A.groups, to: B.groups, changes: groupChanges },
			moved,
			relations: { compared: relationsCompared, changes: relationChanges },
			boxAspectDiverged,
		},
		plain: {
			from: A.plain,
			to: B.plain,
			labelOnlyOnFrom: [...labelsA].filter((l) => !labelsB.has(l)).toSorted(),
			labelOnlyOnTo: [...labelsB].filter((l) => !labelsA.has(l)).toSorted(),
			labelOnBoth: [...labelsA].filter((l) => labelsB.has(l)).toSorted(),
		},
		warnings,
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
} from "./lib/compare-contract.js";
export { compareBoards };

import type { BoardIdentity } from "@/runtime/engine/board";
import type { ServerElement } from "@/runtime/engine/types";
import type { BoundingBox } from "@/runtime/engine/layout";
import type { ArchboardBlock, LogicalAddress } from "@/runtime/engine/metadata";

interface CompareSideInput {
	key: string;
	identity: BoardIdentity;
	elements: ServerElement[];
	file?: string;
	savedAt?: string;
}

interface SideSummary {
	board: string;
	identity: BoardIdentity;
	file?: string;
	savedAt?: string;
	elementCount: number;
	nodeCount: number;
	edgeCount: number;
	plainCount: number;
	// The box round every node on this board — a fact about the board itself.
	nodeBox: BoundingBox | null;
	// The box the region names on this side are thirds of. Drawn round the nodes
	// both boards have, so that a node present on only one side cannot rename
	// its neighbours' whereabouts; equal to `nodeBox` when the two boards share
	// fewer than two nodes and there is nothing better to anchor to.
	regionFrame: BoundingBox | null;
}

interface NodeFacts {
	node: string;
	name: string;
	label?: string;
	declaredName?: string;
	kind?: string;
	level?: string;
	variant?: string;
	binding?: LogicalAddress | string;
	bindingText?: string;
	link?: string;
	extra?: Record<string, unknown>;
	elementIds: string[];
	elementCount: number;
	types: string[];
	cosmetic: {
		type: string;
		backgroundColor?: string;
		strokeColor?: string;
		width: number;
		height: number;
	};
	layout: NodeLayout;
	degree: { in: number; out: number };
	// Node ids this one points at.
	out: string[];
	// Node ids pointing at it.
	in: string[];
}

interface NodeLayout {
	cluster: string | null;
	clusterWith: string[];
	clusterSize: number;
	container: string | null;
	group: string | null;
	region: string;
	prominence: "smaller" | "typical" | "larger";
}

interface FieldChange {
	from: unknown;
	to: unknown;
}

interface ChangedNode {
	node: string;
	name: string;
	changes: Record<string, FieldChange>;
	cosmeticChanges?: Record<string, FieldChange>;
	layoutChanges?: Record<string, FieldChange>;
	from: NodeFacts;
	to: NodeFacts;
}

interface UnchangedNode {
	node: string;
	name: string;
	kind?: string;
	binding?: string;
	// Same architecture, different placement: still "stable" as a node, but the
	// human moved it and that is a statement of its own.
	layoutChanges?: Record<string, FieldChange>;
	cosmeticChanges?: Record<string, FieldChange>;
	facts: NodeFacts;
}

interface EdgeFacts {
	from: string;
	to: string;
	label?: string;
	kind?: string;
	elementId: string;
	type: string;
	strokeStyle?: string;
	startArrowhead?: string | null;
	endArrowhead?: string | null;
	extra?: Record<string, unknown>;
	fromName: string;
	toName: string;
}

interface ChangedEdge {
	from: string;
	to: string;
	changes: Record<string, FieldChange>;
	fromFacts: EdgeFacts;
	toFacts: EdgeFacts;
}

interface UnresolvedConnector {
	elementId: string;
	type: string;
	label?: string;
	// What each end is attached to, said in whatever terms exist: a node id when
	// the end landed on a node, else the label of the plain element, else null
	// for an end bound to nothing at all.
	fromNode?: string;
	toNode?: string;
	fromLabel?: string;
	toLabel?: string;
	reason: string;
}

interface PlainElement {
	id: string;
	type: string;
	label?: string;
	region: string;
	link?: string;
	foreignCustomData?: Record<string, unknown>;
}

interface PlainSide {
	count: number;
	byType: Record<string, number>;
	labelled: PlainElement[];
	unlabelled: Record<string, number>;
	// Carrying archboard metadata but no node id: one promotion away from being
	// comparable, so worth naming individually.
	unidentified: { id: string; type: string; label?: string; archboard: ArchboardBlock }[];
}

interface ClusterFacts {
	id: string;
	region: string;
	size: number;
	// Node ids.
	members: string[];
	names: string[];
}

interface ClusterChange {
	kind: "merged" | "split" | "formed" | "dissolved" | "stable";
	// Cluster ids on the `from` side.
	from: string[];
	// Cluster ids on the `to` side.
	to: string[];
	sharedMembers: string[];
	// Node ids in the `to` clusters that were not in the `from` clusters.
	joined: string[];
	// Node ids in the `from` clusters that are not in the `to` clusters.
	left: string[];
}

interface RelationChange {
	a: string;
	b: string;
	from: string;
	to: string;
	related: "edge" | "cluster" | "edge+cluster";
}

interface CompareResult {
	success: true;
	from: SideSummary;
	to: SideSummary;
	summary: {
		// Did the join find anything to join on? False means the node and edge
		// sections say nothing because nothing could be compared — never that the
		// two boards agree.
		comparable: boolean;
		identical: boolean;
		sharedNodes: number;
		nodesAdded: number;
		nodesRemoved: number;
		nodesChanged: number;
		nodesUnchanged: number;
		nodesMovedOnly: number;
		edgesAdded: number;
		edgesRemoved: number;
		edgesChanged: number;
		edgesUnchanged: number;
		layoutSignalsChanged: number;
	};
	nodes: {
		added: NodeFacts[];
		removed: NodeFacts[];
		changed: ChangedNode[];
		unchanged: UnchangedNode[];
	};
	edges: {
		added: EdgeFacts[];
		removed: EdgeFacts[];
		changed: ChangedEdge[];
		unchanged: EdgeFacts[];
		// An inference layer over added/removed, not a replacement for it: a
		// removed and an added edge sharing exactly one endpoint, one-to-one.
		rerouted: {
			anchor: string;
			end: "source" | "target";
			was: string;
			now: string;
			anchorName: string;
			wasName: string;
			nowName: string;
		}[];
		unresolved: { from: UnresolvedConnector[]; to: UnresolvedConnector[] };
	};
	layout: {
		method: Record<string, string>;
		cannotExpress: string[];
		clusters: { from: ClusterFacts[]; to: ClusterFacts[]; changes: ClusterChange[] };
		groups: { from: ClusterFacts[]; to: ClusterFacts[]; changes: ClusterChange[] };
		moved: { node: string; name: string; changes: Record<string, FieldChange> }[];
		relations: { compared: number; changes: RelationChange[] };
		boxAspectDiverged: boolean;
	};
	plain: {
		from: PlainSide;
		to: PlainSide;
		// Label matching, and only label matching: a hint, never an identity claim.
		labelOnlyOnFrom: string[];
		labelOnlyOnTo: string[];
		labelOnBoth: string[];
	};
	warnings: string[];
}

export {
	type CompareSideInput,
	type SideSummary,
	type NodeFacts,
	type NodeLayout,
	type FieldChange,
	type ChangedNode,
	type UnchangedNode,
	type EdgeFacts,
	type ChangedEdge,
	type UnresolvedConnector,
	type PlainElement,
	type PlainSide,
	type ClusterFacts,
	type ClusterChange,
	type RelationChange,
	type CompareResult,
};

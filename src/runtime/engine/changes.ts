// Diff settled states through `compareBoards`, assigning temporary
// `el:<elementId>` identities to anonymous shapes. Structural and layout
// changes produce events; cosmetic and unnamed changes stay silent.
import type { ServerElement } from "./types.js";
import type { BoardIdentity } from "./board.js";
import { compareBoards } from "./compare.js";
import type {
	ChangedEdge,
	ChangedNode,
	ClusterChange,
	CompareResult,
	EdgeFacts,
	FieldChange,
	NodeFacts,
	RelationChange,
} from "./compare.js";
import { nodeIdOf, readElementMetadata } from "./metadata.js";
import { headlineFor, narrateChange } from "./lib/change-narration.js";

type DeepReadonly<T> = T extends ClusterChange | RelationChange
	? Readonly<T>
	: T extends readonly (infer Item)[]
		? readonly DeepReadonly<Item>[]
		: T extends object
			? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
			: T;

// Synthetic ids cannot be mistaken for promoted node ids.
const ANON_NODE_PREFIX = "el:";

const CONNECTOR_TYPES = new Set(["arrow", "line"]);

function isAnonymousNode(node: string): boolean {
	return node.startsWith(ANON_NODE_PREFIX);
}

// Return identified copies without mutating the stored board elements.
function withSyntheticNodeIds<const Elements extends readonly ServerElement[]>(
	elements: Elements,
): ServerElement[] | Extract<Elements, never> {
	const identified: ServerElement[] = [];
	for (const el of elements) {
		if (nodeIdOf(el) !== undefined) {
			identified.push(el);
			continue;
		}
		if (CONNECTOR_TYPES.has(el.type)) {
			identified.push(el);
			continue;
		}
		// Bound labels belong to their containers.
		if (el.type === "text" && typeof el.containerId === "string" && el.containerId.length > 0) {
			identified.push(el);
			continue;
		}
		const custom = el.customData ?? {};
		const block = {
			...readElementMetadata(el).archboard,
			node: `${ANON_NODE_PREFIX}${el.id}`,
		};
		identified.push({ ...el, customData: { ...custom, archboard: block } });
	}
	return identified;
}

type Significance = "none" | "cosmetic" | "layout" | "structural";

/** One node, said the way a reader can use: never a synthetic id. */
interface NodeRef {
	node: string;
	name: string;
	anonymous: boolean;
	type: string;
	kind?: string;
	binding?: string;
	link?: string;
}

interface NodeFieldChange extends NodeRef {
	changes: Record<string, FieldChange>;
}

interface NodeIdentityChange {
	/** What it is now. */
	to: NodeRef;
	/** What it was — the same shape under its old identity. */
	from: NodeRef;
	what: "promoted" | "demoted" | "renamed";
	elementIds: string[];
}

interface EdgeRef {
	from: string;
	to: string;
	fromName: string;
	toName: string;
	label?: string;
	kind?: string;
	type: string;
}

interface EdgeReroute {
	anchor: string;
	anchorName: string;
	end: "source" | "target";
	was: string;
	wasName: string;
	now: string;
	nowName: string;
}

interface SemanticChange {
	significance: Significance;
	/** One sentence. Safe to speak; safe to put in a log line. */
	headline: string;
	nodes: {
		added: NodeRef[];
		removed: NodeRef[];
		changed: NodeFieldChange[];
		identity: NodeIdentityChange[];
		/** Same node, new place: only the ones whose layout signals actually moved. */
		moved: (NodeRef & { changes: Record<string, FieldChange> })[];
	};
	edges: {
		added: EdgeRef[];
		removed: EdgeRef[];
		changed: (EdgeRef & { changes: Record<string, FieldChange> })[];
		rerouted: EdgeReroute[];
	};
	layout: {
		clusters: ClusterChange[];
		groups: ClusterChange[];
		relations: RelationChange[];
	};
	/** Node id → reader-facing name; includes every id in this change. */
	names: Record<string, string>;
	counts: {
		nodesAdded: number;
		nodesRemoved: number;
		nodesChanged: number;
		nodesMoved: number;
		identityChanges: number;
		edgesAdded: number;
		edgesRemoved: number;
		edgesChanged: number;
		edgesRerouted: number;
		layoutSignals: number;
	};
	warnings: string[];
	/** Complete compare result; surfaces omit it unless requested. */
	detail: CompareResult;
}

function refOf(facts: DeepReadonly<NodeFacts>): NodeRef {
	const anonymous = isAnonymousNode(facts.node);
	const { type } = facts.cosmetic;
	return {
		node: facts.node,
		name: anonymous ? (facts.label ?? facts.declaredName ?? `an unlabelled ${type}`) : facts.name,
		anonymous,
		type,
		...(facts.kind !== undefined ? { kind: facts.kind } : {}),
		...(facts.bindingText !== undefined ? { binding: facts.bindingText } : {}),
		...(facts.link !== undefined ? { link: facts.link } : {}),
	};
}

function edgeRefOf(edge: DeepReadonly<EdgeFacts>): EdgeRef {
	return {
		from: edge.from,
		to: edge.to,
		fromName: edge.fromName,
		toName: edge.toName,
		...(edge.label !== undefined ? { label: edge.label } : {}),
		...(edge.kind !== undefined ? { kind: edge.kind } : {}),
		type: edge.type,
	};
}

interface IdentityPair {
	previousNode: string;
	node: string;
	elementIds: string[];
}

// Stable element overlap resolves promotion's logical-id transition before
// comparison, preventing false node and cluster departures or arrivals.
const nodeByElement = <const Elements extends readonly ServerElement[]>(
	elements: Elements,
): Map<Elements[number]["id"], string> => {
	const map = new Map<string, string>();
	for (const el of elements) {
		const node = nodeIdOf(el);
		if (node !== undefined) {
			map.set(el.id, node);
		}
	}
	return map;
};

function identityPairs<const Elements extends readonly ServerElement[]>(
	before: Elements,
	after: Elements,
): IdentityPair[] {
	const was = nodeByElement(before);
	const now = nodeByElement(after);

	const candidates = new Map<string, Map<string, string[]>>();
	for (const [elementId, node] of now) {
		const previous = was.get(elementId);
		if (previous === undefined || previous.length === 0 || previous === node) {
			continue;
		}
		const byNew = candidates.get(previous) ?? new Map<string, string[]>();
		byNew.set(node, [...(byNew.get(node) ?? []), elementId]);
		candidates.set(previous, byNew);
	}

	const pairs: IdentityPair[] = [];
	const claimed = new Set<string>();
	for (const [previousNode, byNew] of candidates) {
		// Take the largest claim; a split remainder reads as added.
		const ranked = [...byNew.entries()].toSorted(
			(a: DeepReadonly<[string, string[]]>, b: DeepReadonly<[string, string[]]>) =>
				(b.at(1)?.length ?? 0) - (a.at(1)?.length ?? 0),
		);
		const first = ranked.at(0);
		if (!first) {
			continue;
		}
		const [node, elementIds] = first;
		if (claimed.has(node)) {
			continue;
		}
		claimed.add(node);
		pairs.push({ previousNode, node, elementIds });
	}
	return pairs;
}

function applyIdentityPairs<const Elements extends readonly ServerElement[]>(
	before: Elements,
	pairs: readonly DeepReadonly<IdentityPair>[],
): ServerElement[] | Extract<Elements, never> {
	const rename = new Map<string, string>();
	for (const pair of pairs) {
		rename.set(pair.previousNode, pair.node);
	}
	const aligned: ServerElement[] = [];
	for (const el of before) {
		const node = nodeIdOf(el);
		const renamed = node === undefined ? undefined : rename.get(node);
		if (renamed === undefined) {
			aligned.push(el);
			continue;
		}
		const custom = el.customData ?? {};
		aligned.push({
			...el,
			customData: {
				...custom,
				archboard: { ...readElementMetadata(el).archboard, node: renamed },
			},
		});
	}
	return aligned;
}

// Ignore the browser's shape-plus-bound-text storage transition.
const STORAGE_ARTEFACT_FIELDS = new Set(["elementCount"]);

function withoutStorageArtefacts(
	changes: Readonly<Record<string, DeepReadonly<FieldChange>>>,
): Record<string, FieldChange> {
	const kept: Record<string, FieldChange> = {};
	for (const [field, change] of Object.entries(changes)) {
		if (STORAGE_ARTEFACT_FIELDS.has(field)) {
			continue;
		}
		kept[field] = change;
	}
	return kept;
}

function changedNodeOf(changed: DeepReadonly<ChangedNode>): NodeFieldChange {
	return { ...refOf(changed.to), changes: changed.changes };
}

function changedEdgeOf(
	changed: DeepReadonly<ChangedEdge>,
): EdgeRef & { changes: Record<string, FieldChange> } {
	return { ...edgeRefOf(changed.toFacts), changes: changed.changes };
}

// Diff two moments using the same board identity on both sides.
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

	// Read each pair back out of the diff, which now holds it as one node that
	// changed rather than as a departure and an arrival.
	const identityChanges: NodeIdentityChange[] = [];
	for (const pair of pairs) {
		const changed = detail.nodes.changed.find((n) => n.node === pair.node);
		const unchanged = detail.nodes.unchanged.find((n) => n.node === pair.node);
		const toFacts = changed?.to ?? unchanged?.facts;
		const fromFacts = changed?.from ?? unchanged?.facts;
		if (toFacts === undefined || fromFacts === undefined) {
			continue;
		}
		const wasAnon = isAnonymousNode(pair.previousNode);
		const isAnon = isAnonymousNode(pair.node);
		// The old side is being read out of a record that now carries the new id,
		// so an unlabelled shape would otherwise be "named" after the id it was
		// just given — the one thing it certainly was not called before.
		const fromName =
			fromFacts.label ??
			fromFacts.declaredName ??
			(wasAnon ? `an unlabelled ${fromFacts.cosmetic.type}` : pair.previousNode);
		let what: NodeIdentityChange["what"] = "renamed";
		if (wasAnon && !isAnon) {
			what = "promoted";
		} else if (!wasAnon && isAnon) {
			what = "demoted";
		}
		identityChanges.push({
			what,
			from: { ...refOf(fromFacts), node: pair.previousNode, anonymous: wasAnon, name: fromName },
			to: refOf(toFacts),
			elementIds: pair.elementIds,
		});
	}
	const identityNodes = new Set<string>();
	for (const identityChange of identityChanges) {
		identityNodes.add(identityChange.to.node);
	}
	const { added } = detail.nodes;
	const { removed } = detail.nodes;

	const moved: SemanticChange["nodes"]["moved"] = [];
	for (const node of detail.nodes.unchanged) {
		if (!node.layoutChanges) {
			continue;
		}
		moved.push({ ...refOf(node.facts), changes: node.layoutChanges });
	}
	for (const node of detail.nodes.changed) {
		if (!node.layoutChanges) {
			continue;
		}
		moved.push({ ...refOf(node.to), changes: node.layoutChanges });
	}

	const changedNodes: NodeFieldChange[] = [];
	for (const node of detail.nodes.changed) {
		if (identityNodes.has(node.node)) {
			continue;
		}
		const changes = withoutStorageArtefacts(node.changes);
		if (Object.keys(changes).length > 0) {
			changedNodes.push(changedNodeOf({ ...node, changes }));
		}
	}
	const nodes = {
		added: added.map((facts) => refOf(facts)),
		removed: removed.map((facts) => refOf(facts)),
		// A promotion's field changes are already spelled out in the identity
		// entry, which carries both sides; repeating them as an ordinary change
		// would say the same thing twice in different words.
		changed: changedNodes,
		identity: identityChanges,
		moved,
	};
	const edges = {
		added: detail.edges.added.map((edge) => edgeRefOf(edge)),
		removed: detail.edges.removed.map((edge) => edgeRefOf(edge)),
		changed: detail.edges.changed.map((edge) => changedEdgeOf(edge)),
		rerouted: [...detail.edges.rerouted],
	};
	const clusters: ClusterChange[] = [];
	for (const cluster of detail.layout.clusters.changes) {
		if (cluster.kind !== "stable") {
			clusters.push(cluster);
		}
	}
	const groups: ClusterChange[] = [];
	for (const group of detail.layout.groups.changes) {
		if (group.kind !== "stable") {
			groups.push(group);
		}
	}
	const layout = {
		clusters,
		groups,
		relations: [...detail.layout.relations.changes],
	};

	const structural =
		nodes.added.length +
		nodes.removed.length +
		nodes.changed.length +
		nodes.identity.length +
		edges.added.length +
		edges.removed.length +
		edges.changed.length +
		edges.rerouted.length;
	const layoutSignals =
		moved.length + layout.clusters.length + layout.groups.length + layout.relations.length;
	const cosmetic =
		detail.nodes.unchanged.some((n) => n.cosmeticChanges) ||
		detail.nodes.changed.some((n) => n.cosmeticChanges);

	let significance: Significance = "none";
	if (structural > 0) {
		significance = "structural";
	} else if (layoutSignals > 0) {
		significance = "layout";
	} else if (cosmetic) {
		significance = "cosmetic";
	}

	const names: Record<string, string> = {};
	const remember = (facts: DeepReadonly<NodeFacts>): void => {
		names[facts.node] = refOf(facts).name;
	};
	for (const facts of detail.nodes.added) {
		remember(facts);
	}
	for (const facts of detail.nodes.removed) {
		remember(facts);
	}
	for (const node of detail.nodes.changed) {
		remember(node.from);
		remember(node.to);
	}
	for (const node of detail.nodes.unchanged) {
		remember(node.facts);
	}

	const change: SemanticChange = {
		significance,
		headline: "",
		nodes,
		edges,
		layout,
		names,
		counts: {
			nodesAdded: nodes.added.length,
			nodesRemoved: nodes.removed.length,
			nodesChanged: nodes.changed.length,
			nodesMoved: moved.length,
			identityChanges: nodes.identity.length,
			edgesAdded: edges.added.length,
			edgesRemoved: edges.removed.length,
			edgesChanged: edges.changed.length,
			edgesRerouted: edges.rerouted.length,
			layoutSignals,
		},
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

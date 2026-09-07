import type { Box } from "@/runtime/engine/layout";
import type {
	ClusterChange,
	ClusterFacts,
	FieldChange,
	NodeFacts,
} from "@/runtime/engine/lib/compare-contract";
import { bindingIdentity, formatBinding } from "@/runtime/engine/lib/compare-node-model";
import type { EdgeModel, NodeModel } from "@/runtime/engine/lib/compare-node-model";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

/**
 * A value as text that two of them can be compared by: keys in order, and
 * fields nobody set left out.
 * @param v The value.
 * @returns The canonical text.
 */
const canonical = (v: unknown): string => {
	if (!isRecord(v)) {
		// `undefined` has no JSON spelling; nothing else here is missing one.
		return v === undefined ? "null" : JSON.stringify(v);
	}
	if (Array.isArray(v)) {
		return `[${v.map((value) => canonical(value)).join(",")}]`;
	}
	const entries = Object.entries(v)
		.filter(([, val]) => val !== undefined)
		.toSorted(([x], [y]) => (x < y ? -1 : 1));
	return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${canonical(val)}`).join(",")}}`;
};
/**
 * What one connector says, which is what a comparison reports changing: its
 * words, its kind, and how it is drawn.
 * @param e The connector.
 * @returns Its fields.
 */
const edgeFields = (e: EdgeModel): Record<string, unknown> => ({
	label: e.label,
	kind: e.kind,
	connector: e.type,
	strokeStyle: e.strokeStyle,
	startArrowhead: e.startArrowhead,
	endArrowhead: e.endArrowhead,
	...(e.extra ? { extra: e.extra } : {}),
});

/**
 * Whether two values say the same thing.
 * @param a One value.
 * @param b The other.
 * @returns True when they are the same, key order aside.
 */
function sameJson(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}
	if (a === undefined || b === undefined) {
		return false;
	}
	return canonical(a) === canonical(b);
}

/**
 * Everything a report says about one node: what it is, what it is drawn as,
 * where it sits, and what it joins.
 * @param m The node.
 * @param clusters The board's proximity clusters, for who it sits with.
 * @returns The facts.
 */
function nodeFacts(m: NodeModel, clusters: ClusterFacts[]): NodeFacts {
	return {
		node: m.node,
		name: m.name,
		...statedFields(m),
		elementIds: m.elements.map((el) => el.id),
		elementCount: m.elements.length,
		types: [...new Set(m.elements.map((el) => el.type))],
		cosmetic: cosmeticFacts(m),
		layout: layoutFacts(m, clusters),
		degree: { in: m.in.length, out: m.out.length },
		out: [...m.out].toSorted(),
		in: [...m.in].toSorted(),
	};
}

/**
 * The fields a node states only when it has them, so a report never carries
 * an empty one.
 * @param m The node.
 * @returns The fields it states.
 */
function statedFields(m: NodeModel): Partial<NodeFacts> {
	return { ...namedFields(m), ...boundFields(m) };
}

/**
 * What a node calls itself, where it says so.
 * @param m The node.
 * @returns The name fields it states.
 */
function namedFields(m: NodeModel): Partial<NodeFacts> {
	return {
		...(m.label ? { label: m.label } : {}),
		...(m.declaredName ? { declaredName: m.declaredName } : {}),
		...(m.kind ? { kind: m.kind } : {}),
		...(m.level ? { level: m.level } : {}),
		...(m.variant ? { variant: m.variant } : {}),
	};
}

/**
 * What a node points at, where it points at anything.
 * @param m The node.
 * @returns The binding, link and metadata fields it states.
 */
function boundFields(m: NodeModel): Partial<NodeFacts> {
	const bindingText = formatBinding(m.binding);
	return {
		...(m.binding !== undefined ? { binding: m.binding } : {}),
		...(bindingText !== undefined ? { bindingText } : {}),
		...(m.link ? { link: m.link } : {}),
		...(Object.keys(m.extra).length > 0 ? { extra: m.extra } : {}),
	};
}

/**
 * How a node is drawn, as a report says it.
 * @param m The node.
 * @returns The shape, its colours and its size.
 */
function cosmeticFacts(m: NodeModel): NodeFacts["cosmetic"] {
	return {
		type: m.primary.type,
		...(m.primary.backgroundColor ? { backgroundColor: m.primary.backgroundColor } : {}),
		...(m.primary.strokeColor ? { strokeColor: m.primary.strokeColor } : {}),
		width: Math.round(m.box.w),
		height: Math.round(m.box.h),
	};
}

/**
 * Where a node sits, as a report says it.
 * @param m The node.
 * @param clusters The board's proximity clusters.
 * @returns Its cluster, its companions, and what contains it.
 */
function layoutFacts(m: NodeModel, clusters: ClusterFacts[]): NodeFacts["layout"] {
	const cluster = clusters.find((c) => c.id === m.clusterId);
	return {
		cluster: m.clusterId,
		// Who it sits with, not where: the set is what compares across boards.
		clusterWith: cluster ? cluster.members.filter((n) => n !== m.node) : [],
		clusterSize: cluster ? cluster.size : 0,
		container: m.container,
		group: m.group,
		region: m.region,
		prominence: m.prominence,
	};
}

/**
 * Which fields differ between two sides, and what each was and became.
 * @param from The fields on one side.
 * @param to The fields on the other.
 * @returns One entry per field that differs.
 */
function diffFields(
	from: Record<string, unknown>,
	to: Record<string, unknown>,
): Record<string, FieldChange> {
	const changes: Record<string, FieldChange> = {};
	for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
		if (!sameJson(from[key], to[key])) {
			changes[key] = { from: from[key] ?? null, to: to[key] ?? null };
		}
	}
	return changes;
}

/**
 * What a node means, as the fields a comparison reports: its name, kind and
 * level, what it binds to, and how many elements draw it.
 * @param m The node.
 * @param boardVariant The variant this board is, which decides whether the
 * node's own variant is an anomaly worth reporting.
 * @returns The fields.
 */
function semanticFields(m: NodeModel, boardVariant: string): Record<string, unknown> {
	return {
		label: labelWorthReporting(m),
		declaredName: m.declaredName,
		kind: m.kind,
		level: m.level,
		// NOT the node's raw `variant`. Promotion stamps every node with the
		// variant it was promoted under, so on `payments` every node says "current"
		// and on `payments@option-a` every node says "option-a" — comparing that is
		// comparing the two filenames, and it would report all six nodes as changed
		// and leave nothing for "what is stable". What is worth diffing is
		// *disagreement*: a node still claiming the variant it was copied from,
		// which means it was never re-promoted. The raw value is in the facts on
		// both sides either way.
		variantAnomaly: m.variant && m.variant !== boardVariant ? m.variant : undefined,
		binding: bindingIdentity(m.binding),
		link: m.link,
		elementCount: m.elements.length,
		...(Object.keys(m.extra).length > 0 ? { extra: m.extra } : {}),
	};
}

/**
 * A node's label, when it says something its declared name does not: a label
 * that merely repeats the name is not a second fact to compare.
 * @param m The node.
 * @returns The label, or undefined.
 */
function labelWorthReporting(m: NodeModel): string | undefined {
	const declared = m.declaredName?.toLocaleLowerCase();
	if (!m.label || m.label.toLocaleLowerCase() === declared) {
		return undefined;
	}
	return m.label;
}

/**
 * How a node is drawn, as the fields a comparison reports separately from
 * what it means.
 * @param m The node.
 * @returns The fields.
 */
function cosmeticFields(m: NodeModel): Record<string, unknown> {
	return {
		shape: m.primary.type,
		backgroundColor: m.primary.backgroundColor,
		strokeColor: m.primary.strokeColor,
		width: Math.round(m.box.w),
		height: Math.round(m.box.h),
	};
}

/**
 * Where a node sits, as the fields a comparison reports: who it sits with,
 * who it is grouped with, and what contains it.
 * @param m The node.
 * @param clusters The board's proximity clusters.
 * @param groups The board's explicit groups.
 * @param shared The nodes both boards hold.
 * @returns The fields.
 */
function layoutFields(
	m: NodeModel,
	clusters: ClusterFacts[],
	groups: ClusterFacts[],
	shared: Set<string>,
): Record<string, unknown> {
	// A cluster is named by its membership, never by its synthetic id — the ids
	// are per-side and comparing them would report a change every time a cluster
	// changed rank. What is compared is the set of *other nodes* it sits with,
	// which is what "together" actually means.
	//
	// Restricted to nodes that exist on both boards: a node that only ever
	// existed on one side joining this cluster is a fact about that node, and it
	// is reported in that node's own facts. Counting it here as well would make
	// every neighbour of an added node look like it had been moved.
	/**
	 * The other nodes in one cluster or group.
	 * @param list The clusters or groups to look in.
	 * @param id Which one.
	 * @param onlyShared Whether to count only nodes both boards hold.
	 * @returns The companions, or none when the cluster is not there.
	 */
	const companions = (list: ClusterFacts[], id: string | null, onlyShared: boolean): string[] => {
		const found = list.find((c) => c.id === id);
		if (!found) {
			return [];
		}
		return found.members.filter((n) => n !== m.node && (!onlyShared || shared.has(n)));
	};
	return {
		cluster: companions(clusters, m.clusterId, true),
		// A group compares the same way — by who is in it — but unrestricted.
		// Proximity is incidental, so a new neighbour must not read as movement;
		// grouping is an explicit act *about* the nodes named in it, so being
		// grouped with a node that is new is exactly the statement being made.
		group: m.group ? companions(groups, m.group, false) : null,
		container: m.container,
		region: m.region,
		prominence: m.prominence,
	};
}

/**
 * What happened to each cluster, for both proximity clusters and explicit
 * groups.
 *
 * The correspondence is by shared membership: a `to` cluster fed by two `from`
 * clusters is a merge, a `from` cluster whose members land in two `to`
 * clusters is a split, and a cluster made only of new nodes was formed.
 * @param from The clusters on one side.
 * @param to The clusters on the other.
 * @returns One change per cluster on either side.
 */
function diffPartitions(from: ClusterFacts[], to: ClusterFacts[]): ClusterChange[] {
	const fromOf = clusterOfNode(from);
	const toOf = clusterOfNode(to);

	const changes: ClusterChange[] = [];
	const seenFrom = new Set<string>();

	for (const t of to) {
		const sources = sourcesOf(t, fromOf);
		for (const s of sources) {
			seenFrom.add(s);
		}
		changes.push(sources.size === 0 ? formed(t) : changeInto(t, sources, from, toOf));
	}

	for (const f of from) {
		if (!seenFrom.has(f.id)) {
			changes.push({
				kind: "dissolved",
				from: [f.id],
				to: [],
				sharedMembers: [],
				joined: [],
				left: f.members,
			});
		}
	}

	return changes;
}

/**
 * Which cluster each node is in.
 * @param clusters The clusters.
 * @returns The cluster id by node.
 */
function clusterOfNode(clusters: ClusterFacts[]): Map<string, string> {
	const of = new Map<string, string>();
	for (const cluster of clusters) {
		for (const member of cluster.members) {
			of.set(member, cluster.id);
		}
	}
	return of;
}

/**
 * The clusters on the other side that fed this one.
 * @param t The cluster.
 * @param fromOf Which cluster each node was in before.
 * @returns The source cluster ids.
 */
function sourcesOf(t: ClusterFacts, fromOf: ReadonlyMap<string, string>): Set<string> {
	const sources = new Set<string>();
	for (const member of t.members) {
		const source = fromOf.get(member);
		if (source !== undefined) {
			sources.add(source);
		}
	}
	return sources;
}

/**
 * A cluster made only of nodes that were in none before.
 * @param t The cluster.
 * @returns The change.
 */
function formed(t: ClusterFacts): ClusterChange {
	return { kind: "formed", from: [], to: [t.id], sharedMembers: [], joined: t.members, left: [] };
}

/**
 * What became of the clusters that fed one: merged when several did, split
 * when one lost members elsewhere, stable when nobody moved.
 * @param t The cluster.
 * @param sources The clusters that fed it.
 * @param from The clusters on the other side.
 * @param toOf Which cluster each node is in now.
 * @returns The change.
 */
function changeInto(
	t: ClusterFacts,
	sources: ReadonlySet<string>,
	from: ClusterFacts[],
	toOf: ReadonlyMap<string, string>,
): ClusterChange {
	const sourceMembers = membersOf(sources, from);
	const joined = t.members.filter((n) => !sourceMembers.has(n));
	const left = [...sourceMembers].filter((n) => toOf.get(n) !== t.id);
	const scattered = [...sources].some((s) => scatters(s, from, toOf));
	return {
		kind: kindOf(sources.size, scattered, joined.length + left.length),
		from: [...sources].toSorted(),
		to: [t.id],
		sharedMembers: t.members.filter((n) => sourceMembers.has(n)).toSorted(),
		joined: joined.toSorted(),
		left: left.toSorted(),
	};
}

/**
 * Every node the source clusters held.
 * @param sources The source cluster ids.
 * @param from The clusters on the other side.
 * @returns Their members.
 */
function membersOf(sources: ReadonlySet<string>, from: ClusterFacts[]): Set<string> {
	const members = new Set<string>();
	for (const cluster of from) {
		if (sources.has(cluster.id)) {
			for (const member of cluster.members) {
				members.add(member);
			}
		}
	}
	return members;
}

/**
 * Whether one source cluster lost members to more than one cluster.
 * @param id The source cluster.
 * @param from The clusters on the other side.
 * @param toOf Which cluster each node is in now.
 * @returns True when its members ended up apart.
 */
function scatters(id: string, from: ClusterFacts[], toOf: ReadonlyMap<string, string>): boolean {
	const cluster = from.find((x) => x.id === id);
	if (!cluster) {
		return false;
	}
	return new Set(cluster.members.map((n) => toOf.get(n) ?? "·gone")).size > 1;
}

/**
 * What to call this change.
 * @param sourceCount How many clusters fed it.
 * @param scattered Whether any source lost members elsewhere.
 * @param moved How many nodes joined or left.
 * @returns The kind.
 */
function kindOf(sourceCount: number, scattered: boolean, moved: number): ClusterChange["kind"] {
	if (sourceCount > 1) {
		return "merged";
	}
	return !scattered && moved === 0 ? "stable" : "split";
}

/**
 * Coarse direction from one box to another: which way a human would point.
 *
 * The dominant axis names the relation and the other axis qualifies it when it
 * is at least half as large, so a box diagonally up-left reads as "above-left"
 * rather than as an arbitrary pick between the two.
 * @param a The box the direction is from.
 * @param b The box it is toward.
 * @returns The relation, as the word a report uses.
 */
function relationOf(a: Box, b: Box): string {
	const dx = b.x + b.w / 2 - (a.x + a.w / 2);
	const dy = b.y + b.h / 2 - (a.y + a.h / 2);
	const adx = Math.abs(dx);
	const ady = Math.abs(dy);
	if (adx < 1 && ady < 1) {
		return "on-top-of";
	}
	const names = directionNames(dx, dy);
	const dominant = adx >= ady ? names.horizontal : names.vertical;
	const weaker = Math.min(adx, ady);
	return weaker >= Math.max(adx, ady) * 0.5 ? names.corner : dominant;
}

/**
 * What each axis of a direction is called. A is left-of b when b is further
 * right, and the corner names the two together.
 * @param dx How far right b is.
 * @param dy How far down b is.
 * @returns The horizontal, vertical and corner names.
 */
function directionNames(
	dx: number,
	dy: number,
): { horizontal: string; vertical: string; corner: string } {
	const horizontal = dx > 0 ? "left-of" : "right-of";
	const vertical = dy > 0 ? "above" : "below";
	return { horizontal, vertical, corner: `${vertical}-${dx > 0 ? "left" : "right"}` };
}

// The pairwise pass is the only place with a budget, and it is declared rather
// than applied silently. Users create boards interactively, so this is
// generous by two orders of magnitude for anything real.
const MAX_RELATION_PAIRS = 20_000;

export {
	nodeFacts,
	diffFields,
	edgeFields,
	semanticFields,
	cosmeticFields,
	layoutFields,
	diffPartitions,
	relationOf,
	MAX_RELATION_PAIRS,
};

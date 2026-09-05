import type { Box } from "../layout.js";
import type {
	ChangedEdge,
	ClusterChange,
	ClusterFacts,
	CompareResult,
	EdgeFacts,
	FieldChange,
	NodeFacts,
} from "./compare-contract.js";
import { bindingIdentity, formatBinding } from "./compare-node-model.js";
import type { EdgeModel, NodeModel } from "./compare-node-model.js";

const canonical = (v: unknown): string => {
	if (v === null || typeof v !== "object") {
		return JSON.stringify(v) ?? "null";
	}
	if (Array.isArray(v)) {
		return `[${v.map((value) => canonical(value)).join(",")}]`;
	}
	const entries = Object.entries(v as Record<string, unknown>)
		.filter(([, val]) => val !== undefined)
		.toSorted(([x], [y]) => (x < y ? -1 : 1));
	return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${canonical(val)}`).join(",")}}`;
};
const edgeFields = (e: EdgeModel): Record<string, unknown> => ({
	label: e.label,
	kind: e.kind,
	connector: e.type,
	strokeStyle: e.strokeStyle,
	startArrowhead: e.startArrowhead,
	endArrowhead: e.endArrowhead,
	...(e.extra ? { extra: e.extra } : {}),
});

function sameJson(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}
	if (a === undefined || b === undefined) {
		return false;
	}
	return canonical(a) === canonical(b);
}

function nodeFacts(m: NodeModel, clusters: ClusterFacts[]): NodeFacts {
	const cluster = clusters.find((c) => c.id === m.clusterId);
	const bindingText = formatBinding(m.binding);
	return {
		node: m.node,
		name: m.name,
		...(m.label ? { label: m.label } : {}),
		...(m.declaredName ? { declaredName: m.declaredName } : {}),
		...(m.kind ? { kind: m.kind } : {}),
		...(m.level ? { level: m.level } : {}),
		...(m.variant ? { variant: m.variant } : {}),
		...(m.binding !== undefined ? { binding: m.binding } : {}),
		...(bindingText !== undefined ? { bindingText } : {}),
		...(m.link ? { link: m.link } : {}),
		...(Object.keys(m.extra).length > 0 ? { extra: m.extra } : {}),
		elementIds: m.elements.map((el) => el.id),
		elementCount: m.elements.length,
		types: [...new Set(m.elements.map((el) => el.type))],
		cosmetic: {
			type: m.primary.type,
			...(m.primary.backgroundColor ? { backgroundColor: m.primary.backgroundColor } : {}),
			...(m.primary.strokeColor ? { strokeColor: m.primary.strokeColor } : {}),
			width: Math.round(m.box.w),
			height: Math.round(m.box.h),
		},
		layout: {
			cluster: m.clusterId,
			// Who it sits with, not where: the set is what compares across boards.
			clusterWith: cluster ? cluster.members.filter((n) => n !== m.node) : [],
			clusterSize: cluster ? cluster.size : 0,
			container: m.container,
			group: m.group,
			region: m.region,
			prominence: m.prominence,
		},
		degree: { in: m.in.length, out: m.out.length },
		out: [...m.out].toSorted(),
		in: [...m.in].toSorted(),
	};
}

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

function semanticFields(m: NodeModel, boardVariant: string): Record<string, unknown> {
	const label =
		m.label && m.label.toLocaleLowerCase() !== m.declaredName?.toLocaleLowerCase()
			? m.label
			: undefined;
	return {
		label,
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

function cosmeticFields(m: NodeModel): Record<string, unknown> {
	return {
		shape: m.primary.type,
		backgroundColor: m.primary.backgroundColor,
		strokeColor: m.primary.strokeColor,
		width: Math.round(m.box.w),
		height: Math.round(m.box.h),
	};
}

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

// Partition diff, used for both proximity clusters and explicit groups. The
// correspondence is by shared membership: a `to` cluster fed by two `from`
// clusters is a merge, a `from` cluster whose members land in two `to` clusters
// is a split, and a cluster made only of new nodes was formed.
function diffPartitions(from: ClusterFacts[], to: ClusterFacts[]): ClusterChange[] {
	const fromOf = new Map<string, string>();
	for (const c of from) {
		for (const n of c.members) {
			fromOf.set(n, c.id);
		}
	}
	const toOf = new Map<string, string>();
	for (const c of to) {
		for (const n of c.members) {
			toOf.set(n, c.id);
		}
	}

	const changes: ClusterChange[] = [];
	const seenFrom = new Set<string>();

	for (const t of to) {
		const sources = new Set(t.members.map((n) => fromOf.get(n)).filter(Boolean) as string[]);
		const shared = t.members.filter((n) => fromOf.has(n));
		for (const s of sources) {
			seenFrom.add(s);
		}

		if (sources.size === 0) {
			changes.push({
				kind: "formed",
				from: [],
				to: [t.id],
				sharedMembers: [],
				joined: t.members,
				left: [],
			});
			continue;
		}
		const sourceMembers = new Set<string>();
		for (const s of sources) {
			const c = from.find((x) => x.id === s);
			if (!c) {
				continue;
			}
			for (const n of c.members) {
				sourceMembers.add(n);
			}
		}
		const joined = t.members.filter((n) => !sourceMembers.has(n));
		const left = [...sourceMembers].filter((n) => toOf.get(n) !== t.id);
		// Did any source cluster lose members to a different `to` cluster?
		const splitSources = [...sources].filter((s) => {
			const c = from.find((x) => x.id === s);
			return c !== undefined && new Set(c.members.map((n) => toOf.get(n) ?? "·gone")).size > 1;
		});
		let kind: ClusterChange["kind"] = "split";
		if (sources.size > 1) {
			kind = "merged";
		} else if (splitSources.length === 0 && joined.length === 0 && left.length === 0) {
			kind = "stable";
		}
		changes.push({
			kind,
			from: [...sources].toSorted(),
			to: [t.id],
			sharedMembers: shared.toSorted(),
			joined: joined.toSorted(),
			left: left.toSorted(),
		});
	}

	for (const f of from) {
		if (seenFrom.has(f.id)) {
			continue;
		}
		changes.push({
			kind: "dissolved",
			from: [f.id],
			to: [],
			sharedMembers: [],
			joined: [],
			left: f.members,
		});
	}

	return changes;
}

// Coarse direction from a to b: which way a human would point. The dominant
// axis names the relation and the other axis qualifies it when it is at least
// half as large, so a box diagonally up-left reads as "above-left" and not as
// an arbitrary pick between the two.
function relationOf(a: Box, b: Box): string {
	const ax = a.x + a.w / 2,
		ay = a.y + a.h / 2;
	const bx = b.x + b.w / 2,
		by = b.y + b.h / 2;
	const dx = bx - ax,
		dy = by - ay;
	const adx = Math.abs(dx),
		ady = Math.abs(dy);
	if (adx < 1 && ady < 1) {
		return "on-top-of";
	}
	// A is left-of b when b is further right.
	const horizontal = dx > 0 ? "left-of" : "right-of";
	const vertical = dy > 0 ? "above" : "below";
	if (adx >= ady) {
		return ady >= adx * 0.5
			? `${vertical}-${horizontal === "left-of" ? "left" : "right"}`
			: horizontal;
	}
	return adx >= ady * 0.5 ? `${vertical}-${horizontal === "left-of" ? "left" : "right"}` : vertical;
}

// The pairwise pass is the only place with a budget, and it is declared rather
// than applied silently. Users create boards interactively, so this is
// generous by two orders of magnitude for anything real.
const MAX_RELATION_PAIRS = 20_000;

// ---------------------------------------------------------------------------
// Edge matching
// ---------------------------------------------------------------------------

const edgeKey = (e: EdgeFacts): string => `${e.from}\0${e.to}`;

const bucketEdges = (list: EdgeModel[]): Map<string, EdgeModel[]> => {
	const map = new Map<string, EdgeModel[]>();
	for (const edge of list) {
		const key = edgeKey(edge);
		const entries = map.get(key) ?? [];
		entries.push(edge);
		map.set(key, entries);
	}
	return map;
};

const byAnchor = (list: EdgeFacts[], end: "source" | "target"): Map<string, EdgeFacts[]> => {
	const map = new Map<string, EdgeFacts[]>();
	for (const edge of list) {
		const anchor = end === "source" ? edge.from : edge.to;
		const entries = map.get(anchor) ?? [];
		entries.push(edge);
		map.set(anchor, entries);
	}
	return map;
};

function matchEdges(
	from: EdgeModel[],
	to: EdgeModel[],
): {
	added: EdgeFacts[];
	removed: EdgeFacts[];
	changed: ChangedEdge[];
	unchanged: EdgeFacts[];
} {
	const fromMap = bucketEdges(from);
	const toMap = bucketEdges(to);

	const added: EdgeFacts[] = [];
	const removed: EdgeFacts[] = [];
	const changed: ChangedEdge[] = [];
	const unchanged: EdgeFacts[] = [];

	for (const key of new Set([...fromMap.keys(), ...toMap.keys()])) {
		const lefts = [...(fromMap.get(key) ?? [])];
		const rights = [...(toMap.get(key) ?? [])];

		// Parallel edges between the same pair: match by label first, so renaming
		// one of two arrows does not read as one removed and one added.
		for (let i = lefts.length - 1; i >= 0; i--) {
			const left = lefts.at(i);
			if (!left) {
				continue;
			}
			const j = rights.findIndex((right) => (right.label ?? "") === (left.label ?? ""));
			if (j === -1) {
				continue;
			}
			const [l] = lefts.splice(i, 1);
			const [r] = rights.splice(j, 1);
			if (!l || !r) {
				continue;
			}
			const changes = diffFields(edgeFields(l), edgeFields(r));
			if (Object.keys(changes).length === 0) {
				unchanged.push(r);
			} else {
				changed.push({ from: r.from, to: r.to, changes, fromFacts: l, toFacts: r });
			}
		}
		// Whatever is left pairs up positionally: same endpoints, different label.
		while (lefts.length > 0 && rights.length > 0) {
			const l = lefts.shift();
			const r = rights.shift();
			if (!l || !r) {
				break;
			}
			const changes = diffFields(edgeFields(l), edgeFields(r));
			if (Object.keys(changes).length === 0) {
				unchanged.push(r);
			} else {
				changed.push({ from: r.from, to: r.to, changes, fromFacts: l, toFacts: r });
			}
		}
		removed.push(...lefts);
		added.push(...rights);
	}

	return { added, removed, changed, unchanged };
}

// Reroutes: a removed edge and an added edge that share exactly one endpoint,
// one-to-one on that endpoint. An inference, offered alongside added/removed
// rather than instead of it, because "A now points at C instead of B" is the
// sentence a human would say and reconstructing it from two lists is work the
// consumer should not have to redo.
function inferReroutes(
	removed: EdgeFacts[],
	added: EdgeFacts[],
): CompareResult["edges"]["rerouted"] {
	const out: CompareResult["edges"]["rerouted"] = [];
	for (const end of ["source", "target"] as const) {
		const rem = byAnchor(removed, end);
		const add = byAnchor(added, end);
		for (const [anchor, rs] of rem) {
			const as = add.get(anchor);
			if (!as || rs.length !== 1 || as.length !== 1) {
				continue;
			}
			const r = rs.at(0);
			const a = as.at(0);
			if (!r || !a) {
				continue;
			}
			const was = end === "source" ? r.to : r.from;
			const now = end === "source" ? a.to : a.from;
			if (was === now) {
				continue;
			}
			out.push({
				anchor,
				end,
				was,
				now,
				anchorName: end === "source" ? a.fromName : a.toName,
				wasName: end === "source" ? r.toName : r.fromName,
				nowName: end === "source" ? a.toName : a.fromName,
			});
		}
	}
	return out;
}

export {
	nodeFacts,
	diffFields,
	semanticFields,
	cosmeticFields,
	layoutFields,
	diffPartitions,
	relationOf,
	MAX_RELATION_PAIRS,
	matchEdges,
	inferReroutes,
};

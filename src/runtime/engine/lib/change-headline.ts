// One sentence naming the most consequential thing in a change.
//
// Ranked, not summed: a headline that tried to mention everything would be
// unreadable in the one place it is used, which is a line the agent may end up
// speaking. Everything else is still in `narrateChange` and in `detail`.

import type { SemanticChange } from "@/runtime/engine/changes";
import type { DeepReadonly } from "@/runtime/engine/lib/change-phrasing";
import { andMore, changeRank, list, namedBy, quoted } from "@/runtime/engine/lib/change-phrasing";

/** What to say when the diff holds nothing this model has words for. */
const NOTHING = "nothing this model can name changed";

/** One candidate headline, or nothing when its kind of change did not happen. */
type Headline = (change: DeepReadonly<SemanticChange>) => string | undefined;

/**
 * A shape that became, stopped being, or was renamed as a node — the loudest
 * thing that can happen, because it changes what the board is claiming.
 * @param change The whole change.
 * @returns The headline, or undefined when no identity moved.
 */
function identityHeadline(change: DeepReadonly<SemanticChange>): string | undefined {
	if (change.nodes.identity.length === 0) {
		return undefined;
	}
	const first = change.nodes.identity.at(0);
	if (!first) {
		return NOTHING;
	}
	const kind =
		first.what === "promoted" && first.to.kind !== undefined ? ` to a ${first.to.kind}` : "";
	return `${quoted(first.to.name)} ${first.what}${kind}${andMore(change.counts.identityChanges)}`;
}

/**
 * A connector that kept one end and moved the other.
 * @param change The whole change.
 * @returns The headline, or undefined when nothing was rerouted.
 */
function rerouteHeadline(change: DeepReadonly<SemanticChange>): string | undefined {
	if (change.edges.rerouted.length === 0) {
		return undefined;
	}
	const r = change.edges.rerouted.at(0);
	if (!r) {
		return NOTHING;
	}
	const side = r.end === "source" ? "incoming" : "outgoing";
	return `${quoted(r.anchorName)}'s ${side} edge now goes to ${quoted(r.nowName)}, not ${quoted(r.wasName)}`;
}

/**
 * A connector that is gone: a relationship somebody withdrew.
 * @param change The whole change.
 * @returns The headline, or undefined when nothing was cut.
 */
function edgeCutHeadline(change: DeepReadonly<SemanticChange>): string | undefined {
	if (change.edges.removed.length === 0) {
		return undefined;
	}
	const cut = change.edges.removed.at(0);
	if (!cut) {
		return NOTHING;
	}
	const more = andMore(change.edges.removed.length);
	return `the edge ${quoted(cut.fromName)} → ${quoted(cut.toName)} was cut${more}`;
}

/**
 * Nodes that left the board.
 * @param change The whole change.
 * @returns The headline, or undefined when nothing was removed.
 */
function nodesGoneHeadline(change: DeepReadonly<SemanticChange>): string | undefined {
	const { removed } = change.nodes;
	if (removed.length === 0) {
		return undefined;
	}
	const verb = removed.length === 1 ? "is" : "are";
	return `${list(removed.map((x) => quoted(x.name)))} ${verb} gone from the board`;
}

/**
 * Nodes that arrived on the board.
 * @param change The whole change.
 * @returns The headline, or undefined when nothing was added.
 */
function nodesAddedHeadline(change: DeepReadonly<SemanticChange>): string | undefined {
	const { added } = change.nodes;
	if (added.length === 0) {
		return undefined;
	}
	return `${list(added.map((x) => quoted(x.name)))} appeared on the board`;
}

/**
 * A connector that was drawn: a relationship somebody asserted.
 * @param change The whole change.
 * @returns The headline, or undefined when no edge was added.
 */
function edgeAddedHeadline(change: DeepReadonly<SemanticChange>): string | undefined {
	if (change.edges.added.length === 0) {
		return undefined;
	}
	const a = change.edges.added.at(0);
	if (!a) {
		return NOTHING;
	}
	const more = andMore(change.edges.added.length);
	return `a new edge ${quoted(a.fromName)} → ${quoted(a.toName)}${more}`;
}

/**
 * A node whose fields moved while it stayed itself.
 * @param change The whole change.
 * @returns The headline, or undefined when no node changed.
 */
function nodeChangedHeadline(change: DeepReadonly<SemanticChange>): string | undefined {
	if (change.nodes.changed.length === 0) {
		return undefined;
	}
	const ch = change.nodes.changed.at(0);
	if (!ch) {
		return NOTHING;
	}
	const fields = Object.keys(ch.changes).join(", ");
	return `${quoted(ch.name)} changed: ${fields}${andMore(change.nodes.changed.length)}`;
}

/**
 * The board regrouping itself, which says who belongs with whom.
 * @param change The whole change.
 * @returns The headline, or undefined when no cluster moved.
 */
function clusterHeadline(change: DeepReadonly<SemanticChange>): string | undefined {
	if (change.layout.clusters.length === 0) {
		return undefined;
	}
	const cl = change.layout.clusters.at(0);
	if (!cl) {
		return NOTHING;
	}
	const who = [...cl.joined, ...cl.left];
	const movers =
		who.length > 0
			? `, ${list(who.map((node) => namedBy(change.names, node)))} moved between clusters`
			: "";
	return `the grouping changed — a cluster ${cl.kind}${movers}`;
}

/**
 * Nodes that only moved.
 *
 * Not every "moved" is equally meaningful, so the ones that name a
 * relationship are headlined when there are any, and bare repositioning only
 * when there are none.
 * @param change The whole change.
 * @returns The headline, or undefined when nothing moved.
 */
function movedHeadline(change: DeepReadonly<SemanticChange>): string | undefined {
	if (change.counts.nodesMoved === 0) {
		return undefined;
	}
	const ordered = [...change.nodes.moved].toSorted((a, b) => changeRank(a) - changeRank(b));
	const deliberate = ordered.filter((m) => changeRank(m) === 0);
	const subjects = (deliberate.length > 0 ? deliberate : ordered).map((m) => quoted(m.name));
	return `${list(subjects)} moved`;
}

// In the order a reader cares about: what the board now claims, then what it
// connects, then what is on it, then how it is arranged.
const HEADLINES: readonly Headline[] = [
	identityHeadline,
	rerouteHeadline,
	edgeCutHeadline,
	nodesGoneHeadline,
	nodesAddedHeadline,
	edgeAddedHeadline,
	nodeChangedHeadline,
	clusterHeadline,
	movedHeadline,
];

/**
 * One sentence naming the most consequential thing in the change.
 * @param change The whole change.
 * @returns The headline, always a sentence, even when there is nothing to say.
 */
function headlineFor(change: DeepReadonly<SemanticChange>): string {
	for (const candidate of HEADLINES) {
		const headline = candidate(change);
		if (headline !== undefined) {
			return headline;
		}
	}
	return change.significance === "cosmetic" ? "only appearance changed" : NOTHING;
}

export { headlineFor };

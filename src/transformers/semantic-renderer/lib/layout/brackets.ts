// Which forward skips a card brackets from its west flank: the one beside its
// own chain, from a card that is not a hub. Every other skip is left to the
// engine on a first render (docs/design/layout-rules.md).

import type { SemanticEdge } from "@/shared/semantic-board/index";

/**
 * How many forward skips one card may bracket from its west flank. One skip
 * beside its own chain reads as a bracket; a fan of them from a hub is a set
 * of lanes down the margin, so the rest are the engine's to attach.
 */
const FLANK_BUDGET = 1;
/**
 * How many forward relationships a card may have and still bracket a skip:
 * a chain with one skip beside it reads as a bracket, a hub is a fan.
 */
const HUB_DEGREE = 3;

/** A forward skip, by id and the rank distance it spans. */
interface Skip {
	readonly id: string;
	readonly distance: number;
}

/**
 * The rank distance a relationship spans, positive when forward.
 * @param edge The relationship.
 * @param ranks The dependency ranks.
 * @returns rank(to) minus rank(from).
 */
function spanOf(edge: SemanticEdge, ranks: ReadonlyMap<string, number>): number {
	return (ranks.get(edge.to) ?? 0) - (ranks.get(edge.from) ?? 0);
}

/**
 * How many forward relationships leave each card.
 * @param edges The relationships.
 * @param ranks The dependency ranks.
 * @returns Forward out-degree by source id.
 */
function forwardDegrees(
	edges: readonly SemanticEdge[],
	ranks: ReadonlyMap<string, number>,
): Map<string, number> {
	const degrees = new Map<string, number>();
	for (const edge of edges.filter((candidate) => spanOf(candidate, ranks) > 0))
		degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
	return degrees;
}

/** One forward step out of a card: where it goes and which relationship it is. */
interface Step {
	readonly to: string;
	readonly id: string;
}

/**
 * The forward steps of a view: each card's successors down the ranks.
 * @param edges The relationships.
 * @param ranks The dependency ranks.
 * @returns Successors by card id.
 */
function forwardSteps(
	edges: readonly SemanticEdge[],
	ranks: ReadonlyMap<string, number>,
): Map<string, Step[]> {
	const forward = new Map<string, Step[]>();
	for (const edge of edges.filter((candidate) => spanOf(candidate, ranks) > 0))
		forward.set(edge.from, [...(forward.get(edge.from) ?? []), { to: edge.to, id: edge.id }]);
	return forward;
}

/**
 * Whether a skip runs beside its own chain: the one other forward step out of
 * its source leads, step by step, to the skip's target. That is the bracket a
 * reader recognises; a skip to a card in another column is not one, and a
 * flank lane there is a corridor.
 * @param edge The skip.
 * @param forward Each card's forward steps.
 * @returns True when the source's single chain reaches the target.
 */
function bracketsChain(edge: SemanticEdge, forward: ReadonlyMap<string, readonly Step[]>): boolean {
	const chain = (forward.get(edge.from) ?? []).filter((step) => step.id !== edge.id);
	return chain.length === 1 && reaches(chain[0]!.to, edge.to, forward);
}

/**
 * Whether forward steps lead from one card to another.
 * @param from Where to start.
 * @param to The card looked for.
 * @param forward Each card's forward steps.
 * @returns True when some chain of steps arrives.
 */
function reaches(from: string, to: string, forward: ReadonlyMap<string, readonly Step[]>): boolean {
	const seen = new Set<string>();
	const pending = [from];
	while (pending.length > 0) {
		const at = pending.pop()!;
		if (at === to) return true;
		if (seen.has(at)) continue;
		seen.add(at);
		pending.push(...(forward.get(at) ?? []).map((step) => step.to));
	}
	return false;
}

/**
 * Whether a skip is a bracket: two or more ranks, from a card that is not a
 * hub, beside that card's one chain to the same target.
 * @param edge The relationship.
 * @param distance The ranks it spans.
 * @param degrees Forward out-degree by card.
 * @param forward Each card's forward steps.
 * @returns True for a bracket.
 */
function isBracket(
	edge: SemanticEdge,
	distance: number,
	degrees: ReadonlyMap<string, number>,
	forward: ReadonlyMap<string, readonly Step[]>,
): boolean {
	return (
		distance >= 2 && (degrees.get(edge.from) ?? 0) < HUB_DEGREE && bracketsChain(edge, forward)
	);
}

/**
 * The forward skips of the cards that are not hubs, grouped by source.
 * @param edges The relationships.
 * @param ranks The dependency ranks.
 * @returns Each such source's skips.
 */
function skipsBySource(
	edges: readonly SemanticEdge[],
	ranks: ReadonlyMap<string, number>,
): Map<string, Skip[]> {
	const degrees = forwardDegrees(edges, ranks);
	const forward = forwardSteps(edges, ranks);
	const bySource = new Map<string, Skip[]>();
	for (const edge of edges) {
		const distance = spanOf(edge, ranks);
		if (!isBracket(edge, distance, degrees, forward)) continue;
		bySource.set(edge.from, [...(bySource.get(edge.from) ?? []), { id: edge.id, distance }]);
	}
	return bySource;
}

/**
 * The forward skips drawn as west-flank brackets: per card that is not a hub,
 * the nearest by rank distance (then by id), up to the budget.
 * @param edges The relationships, in id order.
 * @param ranks The dependency ranks.
 * @returns The ids of the bracketing skips.
 */
function flankSkips(
	edges: readonly SemanticEdge[],
	ranks: ReadonlyMap<string, number>,
): Set<string> {
	return new Set(
		[...skipsBySource(edges, ranks).values()].flatMap((skips) =>
			skips
				.toSorted((one, other) => one.distance - other.distance || one.id.localeCompare(other.id))
				.slice(0, FLANK_BUDGET)
				.map((skip) => skip.id),
		),
	);
}

export { flankSkips };

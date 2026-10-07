// Change coupling: which parts of a board change together (ADR 0045).
//
// Two parts are coupled when the commits of a period that changed both pass
// code-maat's filters: at least 5 shared commits, and a degree of at least
// 30%, where the degree is the shared commits over the mean of the two parts'
// own commits. The commits are the ones hotspots count, from the same walk, so
// large commits are already out. The thresholds are fixed, so two answers
// compare and the design note's measurement reproduces.
//
// Only two parts bound into one repository can share a commit. A pair whose
// declarations overlap is left out: each shared commit is one change counted
// twice. Path-wide readings keep the path overlap exclusion.
//
// A pair is unjoined when nothing the variant draws joins it. A relationship
// or a flow step joins the parts at its two ends, in either direction. A part
// inside an end counts as at that end, because a relationship that ends on a
// container is a dependency drawn at a higher level (ADR 0044). A container
// counts as at an end inside it too: a relationship between a part inside it
// and a part outside it crosses the container's edge, and ADR 0044 counts it
// among the container's callers or outgoing relationships. A part inside the
// other is joined by that containment.

import type { AttributedCommits } from "@/runtime/history-lens/lib/attribution";
import type { WalkedCommit } from "@/runtime/history-lens/lib/commits";
import type { ReadPart } from "@/runtime/history-lens/lib/parts";
import type { CoupledPair } from "@/shared/locality/index";
import type { VariantContent } from "@/shared/semantic-board/index";

/**
 * code-maat's `--min-shared-revs`: the fewest commits a coupled pair shares.
 */
const MIN_SHARED_COMMITS = 5;
/**
 * code-maat's `--min-coupling`: the lowest degree of a coupled pair, in percent.
 */
const MIN_DEGREE_PERCENT = 30;

/**
 * One part the lens read, with the commits that count for it, newest first.
 */
interface CountedPart {
	readonly attribution?: AttributedCommits["attribution"];
	readonly sites?: AttributedCommits["sites"];
	readonly part: ReadPart;
	readonly counted: readonly WalkedCommit[];
}

/**
 * Two ends that the variant draws joined: a relationship's, or a step's.
 */
interface Joint {
	readonly from: string;
	readonly to: string;
}

/**
 * Whether a bound path is the other one or below it.
 * @param inner A normalized bound path.
 * @param outer Another; the empty string is the whole repository.
 * @returns True when every file under `inner` is under `outer`.
 */
function isUnder(inner: string, outer: string): boolean {
	return outer === "" || inner === outer || inner.startsWith(`${outer}/`);
}

/**
 * Whether two bound paths overlap: one path, or one below the other.
 * @param left A normalized bound path.
 * @param right Another.
 * @returns True when a file can be under both.
 */
function overlaps(left: string, right: string): boolean {
	return isUnder(left, right) || isUnder(right, left);
}

/**
 * Whether two precise symbols own any of the same declarations.
 * @param left The first symbol reading.
 * @param right The second symbol reading.
 * @returns True for shared or nested declarations.
 */
function sharedDeclaration(left: CountedPart, right: CountedPart): boolean {
	return (left.sites ?? []).some((one) =>
		(right.sites ?? []).some(
			(other) => one.path === other.path && relatedSymbols(one.symbol, other.symbol),
		),
	);
}

/**
 * Whether declaration names express identical or nested ownership.
 * @param one A declaration name.
 * @param other Another declaration name.
 * @returns True for one declaration or a containing declaration.
 */
function relatedSymbols(one: string, other: string): boolean {
	return one === other || one.startsWith(`${other}.`) || other.startsWith(`${one}.`);
}

/**
 * Whether a path owns any declaration that a precise symbol reads.
 * @param symbol The precise reading.
 * @param path The path-wide reading.
 * @returns True when the path includes the declaration.
 */
function ownsSymbol(symbol: CountedPart, path: CountedPart): boolean {
	return (symbol.sites ?? []).some((site) => isUnder(site.path, path.part.path));
}

/**
 * Exclude shared declaration ownership, rather than every shared directory.
 * @param left The first reading.
 * @param right The second reading.
 * @returns Whether their ownership overlaps.
 */
function ownershipOverlaps(left: CountedPart, right: CountedPart): boolean {
	const a = left.attribution?.mode === "symbol";
	const b = right.attribution?.mode === "symbol";
	if (a) return b ? sharedDeclaration(left, right) : ownsSymbol(left, right);
	if (b) return ownsSymbol(right, left);
	return overlaps(left.part.path, right.part.path);
}

/**
 * Each node and every container above it, the node first.
 * @param content The variant's nodes.
 * @returns For each node id, itself and its containers.
 */
function lineages(content: Pick<VariantContent, "nodes">): Map<string, Set<string>> {
	const parentOf = new Map(content.nodes.map((node) => [node.id, node.parent]));
	return new Map(
		content.nodes.map((node) => {
			const chain = new Set<string>();
			for (let at: string | undefined = node.id; at !== undefined && !chain.has(at);) {
				chain.add(at);
				at = parentOf.get(at);
			}
			return [node.id, chain];
		}),
	);
}

/**
 * The ends each node counts as at: itself, every container above it, and
 * every part inside it.
 * @param lineage Each node with its containers.
 * @returns For each node id, the ids it counts as at.
 */
function reaches(lineage: ReadonlyMap<string, ReadonlySet<string>>): Map<string, Set<string>> {
	const reach = new Map([...lineage].map(([id, chain]) => [id, new Set(chain)]));
	for (const [id, chain] of lineage) for (const above of chain) reach.get(above)?.add(id);
	return reach;
}

/**
 * Whether the variant joins two parts: one holds the other, or a relationship
 * or a step runs between them, between their containers, or between parts
 * inside them.
 * @param left One part's id.
 * @param right The other's.
 * @param reach Each node with what it counts as at.
 * @param joints Every relationship and step of the variant.
 * @returns True when the pair is joined.
 */
function isJoined(
	left: string,
	right: string,
	reach: ReadonlyMap<string, ReadonlySet<string>>,
	joints: readonly Joint[],
): boolean {
	const atLeft = reach.get(left) ?? new Set([left]);
	const atRight = reach.get(right) ?? new Set([right]);
	// The other part among the ones a part counts as at holds it or is held by it.
	if (atLeft.has(right)) return true;
	return joints.some(
		({ from, to }) =>
			(atLeft.has(from) && atRight.has(to)) || (atLeft.has(to) && atRight.has(from)),
	);
}

/**
 * How the answer names a part.
 * @param part The part.
 * @returns Its subject.
 */
function subjectOf(part: ReadPart): CoupledPair["subjects"][number] {
	return { kind: "node", id: part.node.id, name: part.node.name };
}

/**
 * The coupled pairs among the parts the lens read.
 * @param parts Every part read, in the variant's order, with the commits that count for it.
 * @param content The variant's content, for what joins two parts.
 * @returns The pairs that pass the filters, highest degree first, then most
 * shared commits, then in the variant's order.
 */
function couplePairs(
	parts: readonly CountedPart[],
	content: Pick<VariantContent, "nodes" | "edges" | "flows">,
): CoupledPair[] {
	const reach = reaches(lineages(content));
	const joints: Joint[] = [...content.edges, ...content.flows.flatMap((flow) => flow.steps)];
	const pairs: CoupledPair[] = [];
	parts.forEach((left, at) => {
		const ids = new Set(left.counted.map((commit) => commit.commit));
		for (const right of parts.slice(at + 1)) {
			if (left.part.repo !== right.part.repo || ownershipOverlaps(left, right)) continue;
			const shared = right.counted.filter((commit) => ids.has(commit.commit));
			const total = left.counted.length + right.counted.length;
			// shared / mean ≥ 30% without a fraction: shared × 2 × 100 ≥ 30 × total.
			if (shared.length < MIN_SHARED_COMMITS) continue;
			if (shared.length * 200 < MIN_DEGREE_PERCENT * total) continue;
			pairs.push({
				subjects: [subjectOf(left.part), subjectOf(right.part)],
				repo: left.part.repo,
				commits: shared.map((commit) => commit.commit),
				shared: shared.length,
				// Whole percent, cut as code-maat prints it.
				degree: Math.floor((shared.length * 200) / total),
				unjoined: !isJoined(left.part.node.id, right.part.node.id, reach, joints),
			});
		}
	});
	// A stable sort keeps the variant's order among equals.
	return pairs.toSorted((one, other) => other.degree - one.degree || other.shared - one.shared);
}

export { type CountedPart, couplePairs };

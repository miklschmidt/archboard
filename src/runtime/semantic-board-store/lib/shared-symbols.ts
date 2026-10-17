// What the vault can say about one definition drawn twice (TASK-494).
//
// The archboard skill says to link another board with a drill-down on a part
// the board draws anyway, and never to duplicate its parts. Nothing enforced
// it, and a copy drifts: the two flows that restate one service stop agreeing,
// and a task board that copies the board it changes outlives the change.
//
// Two distinct parts that bind the same repository, path and symbol draw one
// definition twice. Only a binding that names a symbol counts: a bare file or
// directory can be shared correctly, such as one OpenTofu root applied for
// test and for production. It belongs to the vault checker for the reason the
// drill-down checks do (see `drill-down.ts`): no single board can see it.
//
// What counts as a part, and what stays quiet:
//
//   - a part is a board and a node id. The id continues across the variants of
//     one board, so a draft branched from the current variant restates its
//     parts without duplicating them;
//   - only the variants somebody can still edit are read (`content-checks.ts`),
//     because the repair, a drill-down or a removal, is a content edit that
//     the store refuses on history and on a shelved proposal;
//   - two parts of one board are a pair only where one variant carries both;
//   - a pair is quiet when either part drills down to the other's board: that
//     is the link the skill asks for. A drill-down is read as a link-checker
//     reads it, so a former name of the board and the vault's own repository
//     identity both open it.

import type { DrillDown, SemanticBoard, SemanticNode } from "@/shared/semantic-board/index";
import type { SharedSymbol, VaultDiagnostic } from "@/shared/semantic-policy/index";
import { contentCheckedVariants } from "@/runtime/semantic-board-store/lib/content-checks";
import type { DrillLookup } from "@/runtime/semantic-board-store/lib/drill-down";
import { nodeSubject } from "@/runtime/semantic-board-store/lib/subject";

/** A board as read, and the file it was read from. */
interface ReadBoard {
	readonly board: SemanticBoard;
	readonly file: string;
}

/** One part that binds a symbol, across the live variants that carry it. */
interface BoundPart {
	readonly board: string;
	readonly file: string;
	readonly node: SemanticNode;
	readonly variants: string[];
	readonly drills: DrillDown[];
}

/** The definition two parts bind. */
type Definition = SharedSymbol["binding"];

/** One node of a live variant that binds a symbol. */
interface BoundNode {
	readonly board: string;
	readonly file: string;
	readonly variant: string;
	readonly node: SemanticNode;
	readonly definition: Definition;
}

/**
 * Every node of a live variant that binds a symbol, in reading order.
 * @param read Every board the vault holds.
 * @returns The nodes, each with the definition it binds.
 */
function boundNodes(read: readonly ReadBoard[]): BoundNode[] {
	return read.flatMap(({ board, file }) =>
		contentCheckedVariants(board).flatMap((variant) =>
			variant.content.nodes.flatMap((node) => {
				const { repo, path, symbol } = node.binding ?? {};
				return repo === undefined || path === undefined || symbol === undefined
					? []
					: [
							{
								board: board.name,
								file,
								variant: variant.id,
								node,
								definition: { repo, path, symbol },
							},
						];
			}),
		),
	);
}

/**
 * The value at a key, made and kept when the map has none.
 * @param map The map.
 * @param key The key.
 * @param make Makes the value.
 * @returns The value.
 */
function intern<K, V>(map: Map<K, V>, key: K, make: () => V): V {
	const have = map.get(key);
	if (have !== undefined) return have;
	const made = make();
	map.set(key, made);
	return made;
}

/**
 * The parts that bind each definition, a part being a board and a node id
 * whatever number of live variants carry it.
 * @param read Every board the vault holds.
 * @returns For each definition, its parts, in reading order.
 */
function partsByDefinition(
	read: readonly ReadBoard[],
): Map<string, { definition: Definition; parts: Map<string, BoundPart> }> {
	const found = new Map<string, { definition: Definition; parts: Map<string, BoundPart> }>();
	for (const bound of boundNodes(read)) {
		const { repo, path, symbol } = bound.definition;
		const entry = intern(found, JSON.stringify([repo, path, symbol]), () => ({
			definition: bound.definition,
			parts: new Map<string, BoundPart>(),
		}));
		const part = intern(entry.parts, JSON.stringify([bound.board, bound.node.id]), () => ({
			board: bound.board,
			file: bound.file,
			node: bound.node,
			variants: [],
			drills: [],
		}));
		part.variants.push(bound.variant);
		if (bound.node.drillDown !== undefined) part.drills.push(bound.node.drillDown);
	}
	return found;
}

/**
 * Whether a part drills down to the board of another.
 * @param part The part that may carry the link.
 * @param other The part whose board it may open.
 * @param lookup Where each drill-down leads.
 * @returns True when one of the part's links opens the other's board.
 */
function opens(part: BoundPart, other: BoundPart, lookup: DrillLookup): boolean {
	return part.drills.some((drill) => {
		const answer = lookup(drill);
		return answer.kind === "found" && answer.target.name === other.board;
	});
}

/**
 * Whether a pair says nothing. Two parts of one board are drawn twice only
 * where one variant carries both: a draft that replaces a part under a new id
 * never draws the old one beside it. Two parts of two boards are the link the
 * skill asks for when one of them drills down to the board of the other.
 * @param a One part.
 * @param b The other.
 * @param lookup Where each drill-down leads.
 * @returns True when the pair stays quiet.
 */
function quiet(a: BoundPart, b: BoundPart, lookup: DrillLookup): boolean {
	return a.board === b.board
		? !a.variants.some((variant) => b.variants.includes(variant))
		: opens(a, b, lookup) || opens(b, a, lookup);
}

/**
 * A part as the warning's fields name it.
 * @param part The part.
 * @returns Its board, id, name and live variants.
 */
function describePart(part: BoundPart): SharedSymbol["parts"][number] {
	return {
		board: part.board,
		id: part.node.id,
		name: part.node.name,
		variants: part.variants,
	};
}

/**
 * A part as the warning's sentence names it.
 * @param part The part's fields.
 * @returns Its name, board and live variants.
 */
function partWords(part: SharedSymbol["parts"][number]): string {
	return `${JSON.stringify(part.name)} on board ${JSON.stringify(part.board)} (${part.variants.join(", ")})`;
}

/**
 * The warning for one pair of parts that bind one definition.
 * @param definition What they both bind.
 * @param a The part the warning sits on.
 * @param b The other part.
 * @returns The diagnostic.
 */
function pairWarning(definition: Definition, a: BoundPart, b: BoundPart): VaultDiagnostic {
	const [first, second] = [describePart(a), describePart(b)];
	return {
		severity: "warning",
		code: "SHARED_SYMBOL",
		file: a.file,
		board: a.board,
		variant: first.variants[0],
		path: `variants.${first.variants[0]}.content.nodes.${a.node.id}.binding`,
		subject: nodeSubject(a.node),
		sharedSymbol: { binding: definition, parts: [first, second] },
		message:
			`Node ${partWords(first)} and node ${partWords(second)} both bind symbol ` +
			`${JSON.stringify(definition.symbol)} in ${JSON.stringify(definition.path)} of ` +
			`${JSON.stringify(definition.repo)}, so the board draws one definition twice and the ` +
			"copies will drift apart. Draw it on one board and link that board with a drillDown on " +
			"the part the other draws anyway, or, if they are not the same thing, bind each to the " +
			"code it stands for.",
	};
}

/**
 * Every pair of distinct parts that bind one definition and are not quiet, as
 * one warning each.
 * @param read Every board the vault holds, in reading order.
 * @param lookup Where each drill-down leads.
 * @returns The warnings, in reading order.
 */
function sharedSymbolDiagnostics(
	read: readonly ReadBoard[],
	lookup: DrillLookup,
): VaultDiagnostic[] {
	return [...partsByDefinition(read).values()].flatMap(({ definition, parts }) => {
		const bound = [...parts.values()];
		return bound.flatMap((a, at) =>
			bound
				.slice(at + 1)
				.filter((b) => !quiet(a, b, lookup))
				.map((b) => pairWarning(definition, a, b)),
		);
	});
}

export { sharedSymbolDiagnostics };

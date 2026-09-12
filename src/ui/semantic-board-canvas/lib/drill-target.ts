// Where a node's drill-down leads, once the board it names has been read.
//
// A link between two boards is a link between two independent histories, so it
// is resolved rather than assumed: a named variant that is not there is
// reported, never quietly swapped for whichever variant happens to be current.
// A link that landed on a different architecture from the one it named would be
// worse than a link that refuses (ADR 0023).

import {
	resolveVariant,
	type DrillDown,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import { readBoard } from "@/ui/semantic-board-canvas/lib/board-document";

/** Where a drill-down leads, once the target board has been read. */
type DrillResolution =
	| { readonly kind: "ready"; readonly board: SemanticBoard; readonly variant: SemanticVariant }
	| { readonly kind: "no-variant"; readonly asked: string }
	| { readonly kind: "no-current" }
	| { readonly kind: "unreadable"; readonly problem: string };

/**
 * Which variant of the target board a drill-down opens.
 *
 * A named target that is not there is reported, never quietly swapped for
 * whichever variant happens to be current. The two boards are two independent
 * histories, and a link that landed on a different architecture from the one it
 * named would be worse than a link that refuses (ADR 0023).
 * @param target What the node's drill-down names.
 * @param document The target board, as its route answered.
 * @returns The variant to open, or why there is none.
 */
function resolveDrillDown(target: DrillDown, document: unknown): DrillResolution {
	const reading = readBoard(document);
	if (!reading.ok) {
		return { kind: "unreadable", problem: reading.problem };
	}
	const asked = target.variant;
	if (asked.kind === "current") {
		const current = resolveVariant(reading.board);
		return current === undefined
			? { kind: "no-current" }
			: { kind: "ready", board: reading.board, variant: current };
	}
	const named = reading.board.variants.find((variant) => variant.name === asked.name);
	return named === undefined
		? { kind: "no-variant", asked: asked.name }
		: { kind: "ready", board: reading.board, variant: named };
}

/**
 * How a drill-down's variant is spelled in the words a person reads.
 * @param target What the node's drill-down names.
 * @returns The variant as it was asked for.
 */
function drillDownAsked(target: DrillDown): string {
	return target.variant.kind === "current" ? "whichever variant is current" : target.variant.name;
}

export { drillDownAsked, resolveDrillDown, type DrillResolution };

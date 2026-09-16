// Which flank a return travels and how a forward skip attaches.
//
// A step to the next rank descends and a return climbs a flank; those are
// reading conventions. Which flank the returns take, and whether a skip over
// a rank takes the other flank, is not: every rule measured on 2026-09-16 drew
// some boards better and others worse (docs/design/layout-rules.md section 21).
// A first render is settled under each rule here and the scorecard keeps one;
// a proposal keeps its predecessor's.

import type { FlankRuleName } from "@/runtime/semantic-renderer/lib/drawing";
import {
	SOLVING,
	isFlank,
	opposite,
	type Face,
	type Flank,
} from "@/runtime/semantic-renderer/lib/layout/reading";

/**
 * How a forward skip over a rank attaches: a skip beside its source's one
 * chain brackets it from the beside flank and the rest are the engine's
 * (`brackets.ts`), every skip takes the beside flank, or every skip is the
 * engine's.
 */
type SkipAttachment = "bracketed" | "flanked" | "free";

/** One flank rule. */
interface FlankRule {
	readonly name: FlankRuleName;
	/** The flank a return travels. */
	readonly returnFlank: Flank;
	readonly skips: SkipAttachment;
}

/**
 * The rules a first render is settled under, in order of preference when the
 * scorecard cannot separate two drawings: today's first.
 */
const FLANK_RULES: readonly FlankRule[] = [
	{ name: "bracketed", returnFlank: SOLVING.returnFlank, skips: "bracketed" },
	{ name: "flanked", returnFlank: SOLVING.returnFlank, skips: "flanked" },
	{ name: "mirrored", returnFlank: SOLVING.besideFlank, skips: "flanked" },
	{ name: "returns-left", returnFlank: SOLVING.besideFlank, skips: "free" },
];

/**
 * The rule of a name.
 * @param name The rule's name.
 * @returns The rule.
 */
function flankRule(name: FlankRuleName): FlankRule {
	return FLANK_RULES.find((rule) => rule.name === name)!;
}

/**
 * The flank a skip takes under a rule: the one returns do not.
 * @param rule The rule.
 * @returns The beside flank.
 */
function besideFlankOf(rule: FlankRule): Flank {
	return rule.returnFlank === SOLVING.returnFlank ? SOLVING.besideFlank : SOLVING.returnFlank;
}

/**
 * Where a port sits among the ports of its face. The farther back a return
 * reaches, the farther out its lane, so ports on the return flank count down;
 * the rest count up by the rank at the other end. A rule with its flanks
 * swapped is the mirror of one without, and a mirror reverses which way the
 * engine walks every face, so the order is the mirrored face's, reversed.
 * @param rule The flank rule.
 * @param side The port's face.
 * @param rank The dependency rank of the endpoint at the other end.
 * @returns The engine's port index.
 */
function portIndex(rule: FlankRule, side: Face, rank: number): number {
	const swapped = rule.returnFlank !== SOLVING.returnFlank;
	const face = swapped && isFlank(side) ? opposite(side) : side;
	const index = face === SOLVING.returnFlank ? -rank : rank;
	return swapped ? -index : index;
}

export { FLANK_RULES, besideFlankOf, flankRule, portIndex, type FlankRule };

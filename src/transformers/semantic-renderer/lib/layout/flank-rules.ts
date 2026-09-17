// Which flank a return travels and how a forward skip attaches.
//
// A step to the next rank descends and a return climbs a flank; those are
// reading conventions. Which flank the returns take, and whether a skip over
// a rank takes the other flank, is not: every rule measured on 2026-09-16 drew
// some boards better and others worse (docs/design/layout-rules.md section 21).
// A first render is settled under each rule here and the scorecard keeps one;
// a proposal keeps its predecessor's.
//
// Where each end of a relationship attaches along its face is here too, since
// the flanks a rule chooses and the order the engine walks them are the same
// question.

import type { FlankRuleName } from "@/transformers/semantic-renderer/lib/drawing";
import {
	SOLVING,
	isFlank,
	opposite,
	walksBackward,
	type Face,
	type Flank,
} from "@/transformers/semantic-renderer/lib/layout/reading";

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
 * Which of the relationships between one pair of subjects a port belongs to.
 *
 * A port's place on its face is the rank of the subject at the other end, so
 * two relationships between the same pair are ranked alike at both ends and
 * take the same index on both faces. The engine walks a source's face and its
 * target's in opposite senses, so the same index at both ends draws the pair
 * in reverse order to a reader and the two lines must cross. A seat gives each
 * of them its own index, mirrored between the two faces so the order a reader
 * sees is the same at both ends.
 */
interface Seat {
	/** Its place among the relationships sharing its endpoints, in the board's own order. */
	readonly place: number;
	/** How many relationships share those endpoints. */
	readonly shared: number;
	/** The widest such group on the board: the room every rank leaves for seats. */
	readonly room: number;
}

/** A relationship, as seating reads it. */
interface Joined {
	readonly id: string;
	readonly from: string;
	readonly to: string;
}

/** The one seat of a board where nothing shares a pair of endpoints. */
const ALONE: Seat = { place: 0, shared: 1, room: 1 };

/**
 * Whether a relationship has a sister: another relationship between the same
 * two subjects, which it must stay in one order with wherever the two are
 * drawn alongside each other.
 * @param seat The relationship's seat.
 * @returns True when more than one relationship joins that pair of subjects.
 */
function hasSister(seat: Seat): boolean {
	return seat.shared > 1;
}

/**
 * Seat every relationship among the ones sharing its endpoints. The order is
 * the order the relationships are given in, which the graph has already put in
 * the board's own id order, so what a board was authored in cannot reach here.
 * The pairs are held two maps deep rather than under a joined key, so no
 * separator has to be a character an id cannot hold.
 * @param edges Every relationship of one view.
 * @returns The seat of each relationship, by its id.
 */
function seatsOf(edges: readonly Joined[]): Map<string, Seat> {
	const sources = new Map<string, Map<string, string[]>>();
	for (const edge of edges) {
		const targets = sources.get(edge.from) ?? new Map<string, string[]>();
		sources.set(edge.from, targets);
		const group = targets.get(edge.to) ?? [];
		group.push(edge.id);
		targets.set(edge.to, group);
	}
	const groups = [...sources.values()].flatMap((targets) => [...targets.values()]);
	const room = Math.max(...groups.map((group) => group.length), 1);
	const seats = new Map<string, Seat>();
	for (const group of groups) {
		group.forEach((id, place) => seats.set(id, { place, shared: group.length, room }));
	}
	return seats;
}

/**
 * Where a relationship sits within the room its rank leaves, as the engine
 * reads the face it attaches to. A forward step's two faces are walked in
 * opposite senses, so a seat counts from the other end of a face walked
 * backwards and the pair keeps one order for a reader.
 * @param side The port's face.
 * @param seat The relationship's seat.
 * @returns Its offset within the room.
 */
function seatPlace(side: Face, seat: Seat): number {
	return walksBackward(side) ? seat.shared - 1 - seat.place : seat.place;
}

/**
 * Where a port sits among the ports of its face. The farther back a return
 * reaches, the farther out its lane, so ports on the return flank count down;
 * the rest count up by the rank at the other end. A rule with its flanks
 * swapped is the mirror of one without, and a mirror reverses which way the
 * engine walks every face, so the order is the mirrored face's, reversed.
 *
 * Every rank leaves room beside it for the seats of the relationships that
 * share a pair of endpoints, so seating can never reorder two ranks; a board
 * with no such pair leaves room for one and is indexed exactly as it was.
 * @param rule The flank rule.
 * @param side The port's face.
 * @param rank The dependency rank of the endpoint at the other end.
 * @param seat Which of the relationships sharing this pair of endpoints it is.
 * @returns The engine's port index.
 */
function portIndex(rule: FlankRule, side: Face, rank: number, seat: Seat = ALONE): number {
	const swapped = rule.returnFlank !== SOLVING.returnFlank;
	const face = swapped && isFlank(side) ? opposite(side) : side;
	const index = face === SOLVING.returnFlank ? -rank : rank;
	return (swapped ? -index : index) * seat.room + seatPlace(side, seat);
}

export {
	ALONE,
	FLANK_RULES,
	besideFlankOf,
	flankRule,
	hasSister,
	portIndex,
	seatsOf,
	type FlankRule,
	type Seat,
};

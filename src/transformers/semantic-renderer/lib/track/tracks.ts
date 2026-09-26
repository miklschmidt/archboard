// Tracks (TASK-349). Each channel's units — a trunk, or a lone net that turns —
// get tracks in the order that crosses least, each on the highest track below
// every overlapping unit above it. Two units that overlap stand in the order
// they are given tracks, so an order's cost is the sum over every overlapping
// pair of what the earlier one costs above the later one.
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";

/** The cost of an order that runs two lines down one column: never taken when avoidable. */
const STACKED = 100;

/** What a channel assigns a track to: a run between pins that rise from it and pins that drop from it. */
interface Unit {
	readonly tops: readonly number[];
	readonly bottoms: readonly number[];
	readonly low: number;
	readonly high: number;
	readonly order: number;
}

/**
 * Whether two units' runs overlap, so they cannot share a track.
 * @param one A unit.
 * @param other Another unit.
 * @returns True when they overlap.
 */
function overlap(one: Unit, other: Unit): boolean {
	return one.low - LANE / 2 < other.high + LANE / 2 && other.low - LANE / 2 < one.high + LANE / 2;
}

/**
 * How many of some pins fall strictly inside a unit's run.
 * @param pins The pins' x.
 * @param unit The unit.
 * @returns How many would cross its track.
 */
function inside(pins: readonly number[], unit: Unit): number {
	return pins.filter((x) => x > unit.low && x < unit.high).length;
}

/**
 * How many crossings one unit above another costs; a lower pin within a lane
 * of an upper one would run two lines down one column, or closer than a lane
 * beside each other, which is never allowed.
 * @param above The unit on the higher track.
 * @param below The unit on the lower track.
 * @returns The cost.
 */
function costAbove(above: Unit, below: Unit): number {
	const stacked = below.tops.some((top) =>
		above.bottoms.some((bottom) => Math.abs(top - bottom) < LANE),
	);
	return stacked ? STACKED : inside(below.tops, above) + inside(above.bottoms, below);
}

/**
 * How much a unit would rather be above the units it overlaps than below them.
 * @param unit The unit.
 * @param units Every turning unit in its channel.
 * @returns The balance of its preferences.
 */
function preferenceOf(unit: Unit, units: readonly Unit[]): number {
	return units.reduce(
		(sum, other) =>
			other === unit || !overlap(unit, other)
				? sum
				: sum + Math.sign(costAbove(other, unit) - costAbove(unit, other)),
		0,
	);
}

/**
 * Whether one unit must be above another: below it, the other would run a
 * line down the column of one of its own.
 * @param above The unit that would be higher.
 * @param below The unit that would be lower.
 * @returns True when the other order would stack two lines in one column.
 */
function mustBeAbove(above: Unit, below: Unit): boolean {
	return (
		overlap(above, below) && costAbove(below, above) >= STACKED && costAbove(above, below) < STACKED
	);
}

/**
 * The units in their preferred order, except that no unit is placed before
 * a unit that must be above it.
 * @param preferred The units, most wanting to be high first.
 * @returns The order to give tracks in.
 */
function keepingStacks<U extends Unit>(preferred: readonly U[]): U[] {
	const waiting = [...preferred];
	const ordered: U[] = [];
	while (waiting.length > 0) {
		const ready = waiting.findIndex(
			(unit) => !waiting.some((other) => other !== unit && mustBeAbove(other, unit)),
		);
		ordered.push(...waiting.splice(Math.max(ready, 0), 1));
	}
	return ordered;
}

/**
 * What moving the unit at one place of an order to another place saves: each
 * overlapping unit it passes then stands on the other side of it.
 * @param order The order.
 * @param from The unit's place.
 * @param to The place it would take.
 * @returns The saving, or nothing when it would pass a unit that must stay on its side.
 */
function saving(order: readonly Unit[], from: number, to: number): number | undefined {
	const unit = order[from]!;
	const up = to < from;
	const passed = order
		.slice(up ? to : from + 1, up ? from : to + 1)
		.filter((other) => overlap(unit, other));
	const [higher, lower] = up
		? [(other: Unit) => other, () => unit]
		: [() => unit, (other: Unit) => other];
	if (passed.some((other) => mustBeAbove(higher(other), lower(other)))) return undefined;
	return passed.reduce(
		(sum, other) =>
			sum + costAbove(higher(other), lower(other)) - costAbove(lower(other), higher(other)),
		0,
	);
}

/**
 * Improve an order one move at a time: a unit moves up or down past others
 * wherever that crosses fewer lines, until no move saves any.
 * @param order The order, changed in place.
 */
function leastCrossing(order: Unit[]): void {
	for (let moved = true; moved;) {
		moved = false;
		for (let from = 0; from < order.length; from += 1) {
			const savings = order.map((_, to) => (to === from ? 0 : saving(order, from, to)));
			const best = savings.reduce<number>(
				(chosen, one, to) => ((one ?? 0) > savings[chosen]! ? to : chosen),
				from,
			);
			if (best === from) continue;
			order.splice(best, 0, ...order.splice(from, 1));
			moved = true;
		}
	}
}

/**
 * Stack a channel's units on tracks: the order that crosses least, each unit
 * on the highest track below every overlapping unit above it.
 * @param units The units that turn.
 * @returns Each unit's track.
 */
function stackUnits<U extends Unit>(units: readonly U[]): Map<U, number> {
	const preference = new Map(units.map((unit) => [unit, preferenceOf(unit, units)]));
	const ordered = keepingStacks(
		units.toSorted(
			(one, other) =>
				preference.get(other)! - preference.get(one)! ||
				one.low - other.low ||
				one.order - other.order,
		),
	);
	leastCrossing(ordered);
	const tracks = new Map<U, number>();
	for (const unit of ordered) {
		const above = [...tracks].filter(([other]) => overlap(unit, other)).map(([, track]) => track);
		tracks.set(unit, above.length === 0 ? 0 : Math.max(...above) + 1);
	}
	return tracks;
}

/**
 * A unit that is no net: a run between pins that rise from its track and pins that drop from it.
 * @param tops The x of the lines that leave it upward.
 * @param bottoms The x of the lines that leave it downward.
 * @param order Its tie-break.
 * @returns The unit.
 */
function unitAcross(tops: readonly number[], bottoms: readonly number[], order: number): Unit {
	return {
		tops,
		bottoms,
		low: Math.min(...tops, ...bottoms),
		high: Math.max(...tops, ...bottoms),
		order,
	};
}

export { stackUnits, unitAcross, type Unit };

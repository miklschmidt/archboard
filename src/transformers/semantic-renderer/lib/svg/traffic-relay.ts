// How a board's traffic keeps time (ADR 0027).
//
// A line carries a steady train of pulses: one every `spacing` units, every one
// flying a fixed multiple of the line's authored speed. Lines that keep the same time hand their
// pulses on. When a card has lines going out that carry the same speed and
// volume as a line coming in, the pulse that sinks into the card leaves on every
// one of them, after the time it would take to run the shorter way round the
// card's edge, so a reader follows one pulse down the board and sees the lines
// keep step. Nothing of the pulse is drawn in the card. Where the time differs,
// nothing is handed on and the line keeps a rhythm of its own.
//
// Everything here is a function of the board, so one board draws the same bytes
// every time.
import { type SemanticEdge } from "@archboard/board/content";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";

/**
 * The least distance between two pulses on a line, in diagram units: closer
 * than this and a train of them blurs into one lit line, however much traffic
 * its author asked for.
 */
const MIN_SPACING = 36;

/**
 * How many times faster a pulse flies than the speed its author gave. The
 * authored speed still says which lines run hotter, and the distance between
 * two pulses still follows it: speed over volume, as the author stated them.
 */
const PULSE_PACE = 2;

/**
 * The slowest and fastest a pulse flies, in diagram units a second, whatever its
 * author asked for: slower and a line reads as still, faster and nobody follows
 * a pulse, and a spacing over a speed this large is a duration a browser cannot
 * keep.
 */
const SPEED_LIMITS = { slowest: 8, fastest: 600 } as const;

type Traffic = NonNullable<SemanticEdge["traffic"]>;

/** One line that carries traffic, as the rhythm is worked out. */
interface Lane {
	/** The relationship's id. */
	readonly id: string;
	/** The card its pulses leave. */
	readonly from: string;
	/** The card its pulses sink into. */
	readonly to: string;
	readonly traffic: Traffic;
	/** Where the line starts, on the card it leaves. */
	readonly start: Point;
	/** Where the line ends, on the card it reaches. */
	readonly end: Point;
	/** How long the whole line is. */
	readonly length: number;
	/** How long the part of the line the pulses ride is: none, when it is too short to ride. */
	readonly ride: number;
}

/** How one line's pulses move. */
interface Rhythm {
	/** How fast every pulse flies, in diagram units a second. */
	readonly speed: number;
	/** The distance from one pulse to the next along the line. */
	readonly spacing: number;
	/**
	 * Where the pulses are at time zero: a pulse is `phase` along the line then,
	 * and one more every `spacing` before it. Each moves on at `speed`.
	 */
	readonly phase: number;
}

/**
 * How far a pulse goes in a card, at the speed it flies on the lines, between
 * where a line comes in and where the next leaves.
 * @param card The card's id.
 * @param from Where the line comes in.
 * @param to Where the next line leaves.
 * @returns The distance.
 */
type AcrossCard = (card: string, from: Point, to: Point) => number;

/**
 * Whether the pulses that sink into a card carry on out of a line there: it
 * leaves the card the first one arrives at, and keeps the same speed and volume.
 * @param arriving The line the pulses come in on.
 * @param leaving The line they might leave on.
 * @returns Whether they do.
 */
function handsOn(arriving: Lane, leaving: Lane): boolean {
	return (
		arriving.id !== leaving.id &&
		arriving.to === leaving.from &&
		arriving.traffic.speed === leaving.traffic.speed &&
		arriving.traffic.volume === leaving.traffic.volume
	);
}

/**
 * A small deterministic generator of a number from 0 to 1: FNV-1a over the seed
 * to start it, one round of mulberry32 to read it.
 * @param seed What the number is drawn from.
 * @returns The number.
 */
function seeded(seed: string): number {
	let state = 0x811c9dc5;
	for (let index = 0; index < seed.length; index += 1) {
		state = Math.imul(state ^ seed.charCodeAt(index), 0x01000193);
	}
	state = (state + 0x6d2b79f5) | 0;
	let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
	mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
	return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
}

/**
 * A number held to the range `[0, period)`.
 * @param value The number.
 * @param period The period.
 * @returns The number it is the same as, within one period.
 */
function within(value: number, period: number): number {
	return ((value % period) + period) % period;
}

/**
 * The lanes that keep each other's time: those a pulse can be followed along
 * from one to the next, whichever way.
 * @param lanes Every lane.
 * @returns The groups, each in the order its lanes were given.
 */
function chains(lanes: readonly Lane[]): Lane[][] {
	const head = lanes.map((_, index) => index);
	/**
	 * The index that stands for a lane's group.
	 * @param index The lane's index.
	 * @returns The group's index.
	 */
	const find = (index: number): number => {
		let root = index;
		while (head[root] !== root) root = head[root]!;
		head[index] = root;
		return root;
	};
	lanes.forEach((arriving, from) => {
		lanes.forEach((leaving, to) => {
			if (handsOn(arriving, leaving)) head[find(from)] = find(to);
		});
	});
	const groups = new Map<number, Lane[]>();
	lanes.forEach((lane, index) => {
		const root = find(index);
		groups.set(root, [...(groups.get(root) ?? []), lane]);
	});
	return [...groups.values()];
}

/**
 * The distance between two pulses on every line of a chain: what the authored
 * speed and volume say, no further apart than the shortest line of the chain is
 * long, so that every line is carrying a pulse at every moment.
 * @param chain The lanes that keep one another's time.
 * @returns The spacing.
 */
function spacingOf(chain: readonly Lane[]): number {
	const { speed, volume } = chain[0]!.traffic;
	const shortest = Math.min(...chain.filter(({ ride }) => ride > 0).map(({ ride }) => ride));
	return Math.max(MIN_SPACING, Math.min(speed / volume, shortest));
}

/**
 * Where the pulses of every lane of a chain are at time zero.
 *
 * A pulse sinks into the end of a line, is held in its card for as long as the way
 * round the card's edge takes, and leaves the start of each line that takes it
 * on, so a line's pulses lie the line and the way round behind its feeder's. A
 * chain starts where nothing feeds it: the lanes leaving one card start together,
 * in a place drawn from that card's id, so that the cards of a board are not all
 * in step. A line that two others feed follows the first in the order the lanes
 * were given.
 * @param chain The lanes that keep one another's time.
 * @param spacing How far apart their pulses are.
 * @param across How far a pulse goes in a card.
 * @returns The phase of each lane, by id.
 */
function phasesOf(
	chain: readonly Lane[],
	spacing: number,
	across: AcrossCard,
): Map<string, number> {
	const phases = new Map<string, number>();
	const queue: Lane[] = [];
	/**
	 * Start the lanes a lane's pulses carry on into, behind it.
	 * @param lane The lane whose pulses are handed on.
	 */
	const handOn = (lane: Lane): void => {
		for (const next of chain) {
			if (phases.has(next.id) || !handsOn(lane, next)) continue;
			// The pulse is a line's length behind where it began when it reaches the card.
			const arrived = within(phases.get(lane.id)! - lane.length, spacing);
			phases.set(next.id, within(arrived - across(lane.to, lane.end, next.start), spacing));
			queue.push(next);
		}
	};
	const unfed = chain.filter((lane) => !chain.some((other) => handsOn(other, lane)));
	// A chain that closes on itself has nothing that starts it: its first lane does.
	const starts = unfed.length > 0 ? unfed : [chain[0]!];
	for (const start of [...starts, ...chain]) {
		if (phases.has(start.id)) continue;
		phases.set(start.id, seeded(start.from) * spacing);
		queue.push(start);
		for (let next = queue.shift(); next !== undefined; next = queue.shift()) handOn(next);
	}
	return phases;
}

/**
 * How every lane's pulses move.
 * @param lanes The lines of a board that carry traffic, in the order they are drawn.
 * @param across How far a pulse goes in a card.
 * @returns Each lane's rhythm, by id.
 */
function relayRhythms(lanes: readonly Lane[], across: AcrossCard): Map<string, Rhythm> {
	const rhythms = new Map<string, Rhythm>();
	for (const chain of chains(lanes)) {
		const speed = Math.min(
			Math.max(chain[0]!.traffic.speed * PULSE_PACE, SPEED_LIMITS.slowest),
			SPEED_LIMITS.fastest,
		);
		const spacing = spacingOf(chain);
		const phases = phasesOf(chain, spacing, across);
		for (const { id } of chain) rhythms.set(id, { speed, spacing, phase: phases.get(id)! });
	}
	return rhythms;
}

export { PULSE_PACE, relayRhythms, type AcrossCard, type Lane, type Rhythm };

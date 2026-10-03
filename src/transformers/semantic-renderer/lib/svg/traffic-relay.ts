// How a board's traffic keeps time (ADR 0027).
//
// A line carries a steady train of pulses: one every `spacing` units, every one
// flying a fixed multiple of the line's authored speed. Lines that keep the same time hand their
// pulses on. When a card has lines going out that carry the same speed and
// volume as a line coming in, the pulse that sinks into the card runs round its
// edge and leaves on every one of them, so a reader follows one pulse through
// the card and down the board. Where the time differs, nothing is handed on and
// the line keeps a rhythm of its own.
//
// Everything here is a function of the board, so one board draws the same bytes
// every time.
import { type SemanticEdge } from "@/shared/semantic-board/index";
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

/** The shortest way round a card worth drawing: ports closer than this hand a pulse on directly. */
const MIN_CROSSING = 8;

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

/** The way a pulse takes across a card, from where a line ends to where the next begins. */
interface Across {
	/** How long it is. */
	readonly length: number;
	/** The way, as path data, when it is drawn. */
	readonly path?: string;
}

/**
 * How a pulse crosses a card.
 * @param card The card's id.
 * @param from Where the line comes in.
 * @param to Where the next line leaves.
 * @returns The way across.
 */
type AcrossCard = (card: string, from: Point, to: Point) => Across;

/**
 * A pulse's way across a card, at the same speed as on the lines. The card's
 * edge carries it.
 */
interface Crossing {
	/** The card, which holds the crossing. */
	readonly card: string;
	/** The line it leaves the card on. */
	readonly onto: string;
	/** The way, as path data. */
	readonly path: string;
	/** How long it is. */
	readonly length: number;
	/** How its pulses move along it. */
	readonly rhythm: Rhythm;
}

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
 * Where the pulses of every lane of a chain are at time zero, and the ways they
 * cross the cards between lanes.
 *
 * A pulse sinks into the end of a line, runs round its card's edge at the speed
 * it flies everywhere, and leaves the start of each line that takes it on, so a
 * line's pulses lie the line and the way round behind its feeder's. A
 * chain starts where nothing feeds it: the lanes leaving one card start together,
 * in a place drawn from that card's id, so that the cards of a board are not all
 * in step. A line that two others feed follows the first in the order the lanes
 * were given.
 * @param chain The lanes that keep one another's time.
 * @param pulses How far apart their pulses are, and how fast they fly.
 * @param pulses.spacing How far apart.
 * @param pulses.speed How fast.
 * @param across How a pulse crosses a card.
 * @returns The phase of each lane, by id, and the crossings.
 */
function phasesOf(
	chain: readonly Lane[],
	pulses: { readonly spacing: number; readonly speed: number },
	across: AcrossCard,
): { phases: Map<string, number>; crossings: Crossing[] } {
	const { spacing, speed } = pulses;
	const phases = new Map<string, number>();
	const crossings: Crossing[] = [];
	const queue: Lane[] = [];
	/**
	 * Start the lanes a lane's pulses carry on into, behind it.
	 * @param lane The lane whose pulses are handed on.
	 */
	const handOn = (lane: Lane): void => {
		for (const next of chain) {
			if (phases.has(next.id) || !handsOn(lane, next)) continue;
			const way = across(lane.to, lane.end, next.start);
			// The crossing's pulses are the lane's, a line's length behind where it
			// began: its first point is where the lane ends.
			const phase = within(phases.get(lane.id)! - lane.length, spacing);
			phases.set(next.id, within(phase - way.length, spacing));
			queue.push(next);
			if (way.path !== undefined && way.length >= MIN_CROSSING) {
				crossings.push({
					card: lane.to,
					onto: next.id,
					path: way.path,
					length: way.length,
					rhythm: { speed, spacing, phase },
				});
			}
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
	return { phases, crossings };
}

/**
 * How every lane's pulses move, and how they cross the cards.
 * @param lanes The lines of a board that carry traffic, in the order they are drawn.
 * @param across How a pulse crosses a card.
 * @returns Each lane's rhythm, by id, and the crossings.
 */
function relayRhythms(
	lanes: readonly Lane[],
	across: AcrossCard,
): {
	rhythms: Map<string, Rhythm>;
	crossings: Crossing[];
} {
	const rhythms = new Map<string, Rhythm>();
	const crossings: Crossing[] = [];
	for (const chain of chains(lanes)) {
		const speed = Math.min(
			Math.max(chain[0]!.traffic.speed * PULSE_PACE, SPEED_LIMITS.slowest),
			SPEED_LIMITS.fastest,
		);
		const spacing = spacingOf(chain);
		const placed = phasesOf(chain, { spacing, speed }, across);
		for (const { id } of chain) rhythms.set(id, { speed, spacing, phase: placed.phases.get(id)! });
		crossings.push(...placed.crossings);
	}
	return { rhythms, crossings };
}

export {
	PULSE_PACE,
	relayRhythms,
	type Across,
	type AcrossCard,
	type Crossing,
	type Lane,
	type Rhythm,
};

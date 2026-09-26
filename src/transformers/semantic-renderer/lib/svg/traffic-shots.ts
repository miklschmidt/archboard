// When a relationship's traffic fires and how fast its shots fly (ADR 0027).
//
// A line fires its volume's worth of shots a second on average, at irregular
// moments, and each shot crosses at a multiple of the authored speed: a rail
// gun, not a conveyor. The moments come from a small generator seeded by the
// relationship's id, so one board draws the same bytes every time.
import { type SemanticEdge } from "@/shared/semantic-board/index";
import { TRAFFIC_GAP_LIMITS_MS } from "@/shared/timing/timing";

/**
 * How many times faster than its authored speed a shot flies. The authored
 * speed still says which lines run hotter; this makes every one of them a shot
 * rather than a stroll: at the default speed a 300-unit line is crossed in a
 * quarter of a second.
 */
const SHOT_SPEED_MULTIPLE = 15;

/** The slowest and fastest a shot flies, in diagram units a second, whatever its author asked for. */
const SHOT_SPEED_LIMITS = { slowest: 10, fastest: 1e6 } as const;

/** How many shots one cycle of launches holds before it repeats. */
const SHOTS_PER_CYCLE = 8;

/**
 * The shortest and longest gap between two launches, as shares of the mean gap
 * before the cycle is rescaled to keep its mean.
 */
const LAUNCH_JITTER = { shortest: 0.3, longest: 1.7 } as const;

/** How one relationship's traffic fires. */
interface ShotSchedule {
	/** How fast every shot flies, in diagram units a second. */
	readonly speed: number;
	/**
	 * The seconds between one launch and the next, over one cycle, in launch
	 * order: they average one over the traffic's volume, and repeat.
	 */
	readonly gaps: readonly number[];
	/** How long one cycle takes, in seconds: the gaps added up. */
	readonly cycle: number;
}

/**
 * A number between two others.
 * @param value The number.
 * @param low The least it may be.
 * @param high The most it may be.
 * @returns It, held between them.
 */
function clamp(value: number, low: number, high: number): number {
	return Math.min(Math.max(value, low), high);
}

/**
 * A small deterministic generator of numbers from 0 to 1: FNV-1a over the seed
 * to start it, mulberry32 to run it.
 * @param seed What the sequence is drawn from.
 * @returns The next number, each time it is called.
 */
function seeded(seed: string): () => number {
	let state = 0x811c9dc5;
	for (let index = 0; index < seed.length; index += 1) {
		state = Math.imul(state ^ seed.charCodeAt(index), 0x01000193);
	}
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
}

/**
 * When one relationship's traffic fires and how fast its shots fly.
 * @param traffic The authored speed and volume.
 * @param seed The relationship's id: what its irregular launches are drawn from.
 * @returns The schedule.
 */
function shotSchedule(traffic: NonNullable<SemanticEdge["traffic"]>, seed: string): ShotSchedule {
	const next = seeded(seed);
	const shares = Array.from(
		{ length: SHOTS_PER_CYCLE },
		() => LAUNCH_JITTER.shortest + (LAUNCH_JITTER.longest - LAUNCH_JITTER.shortest) * next(),
	);
	const mean =
		clamp(1000 / traffic.volume, TRAFFIC_GAP_LIMITS_MS.shortest, TRAFFIC_GAP_LIMITS_MS.longest) /
		1000;
	const scale = (mean * SHOTS_PER_CYCLE) / shares.reduce((sum, share) => sum + share, 0);
	const gaps = shares.map((share) => share * scale);
	return {
		speed: clamp(
			traffic.speed * SHOT_SPEED_MULTIPLE,
			SHOT_SPEED_LIMITS.slowest,
			SHOT_SPEED_LIMITS.fastest,
		),
		gaps,
		cycle: mean * SHOTS_PER_CYCLE,
	};
}

export { shotSchedule, type ShotSchedule };

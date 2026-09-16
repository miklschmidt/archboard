import { type SemanticEdge } from "@/shared/semantic-board/index";
import { coord } from "@/transformers/semantic-renderer/lib/geometry";
import { tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";

/**
 * The class every moving mark carries.
 *
 * One hook, for one rule: the stylesheet hides the whole layer when the reader
 * has asked for reduced motion. CSS cannot stop a SMIL animation, so hiding
 * what it moves is how the preference is honoured in a file that has no viewer
 * around it.
 */
const PULSE_CLASS = "ab-pulse";

/** An ordinary dot's radius. */
const PULSE_RADIUS = 2.6;

/** A dot's radius where several share one line, so the train reads as heavier. */
const TRAIN_RADIUS = 3;

/** One connection's routed path and explicit illustrated traffic. */
interface Pulse {
	readonly path: string;
	readonly colour: string;
	readonly traffic: NonNullable<SemanticEdge["traffic"]>;
}

/**
 * A steady stream measured directly along the final SVG path.
 * Round-capped zero-length dashes are dots, spaced speed/volume units apart.
 * Advancing the pattern by one spacing every 1/volume seconds gives fixed
 * distance per second on straight and curved routes, already populated at load.
 * One path handles any volume without allocating one element per dot.
 * @param pulse Route, line ink and authored traffic.
 * @returns The animated traffic path, retained in exported SVGs.
 */
function travellingPulses(pulse: Pulse): string {
	const { path, colour, traffic } = pulse;
	const spacing = Math.max(
		Number.MIN_VALUE,
		Math.min(Number.MAX_VALUE, traffic.speed / traffic.volume),
	);
	const interval = Math.min(Number.MAX_VALUE, 1 / traffic.volume);
	// SMIL timecounts require decimal spelling; SVG geometric numbers may use exponents.
	const seconds = interval.toLocaleString("en-US", {
		useGrouping: false,
		maximumSignificantDigits: 21,
	});
	return wrap(
		"path",
		{
			class: PULSE_CLASS,
			d: path,
			fill: "none",
			stroke: colour,
			"stroke-width": PULSE_RADIUS * 2,
			"stroke-linecap": "round",
			"stroke-dasharray": `0 ${spacing}`,
			"pointer-events": "none",
		},
		tag("animate", {
			attributeName: "stroke-dashoffset",
			from: 0,
			to: -spacing,
			dur: `${seconds}s`,
			repeatCount: "indefinite",
			calcMode: "linear",
		}),
	);
}

/** One message's turn on the shared cycle, as a fraction of the whole. */
interface Turn {
	/** Where the turn starts, between 0 and 1. */
	readonly start: number;
	/** Where it ends, between 0 and 1. */
	readonly finish: number;
	/** How much of it is spent fading in and out. */
	readonly ramp: number;
}

/**
 * A dot that waits its turn, crosses, and waits again.
 *
 * Every message of an exchange shares one clock, so a reader sees the exchange
 * told in order rather than a dozen dots moving at once. A message's dot sits
 * still at the start of the line until its turn comes — `keyPoints` holds it at
 * 0, runs it to 1 across the turn, then holds it at 1 — and its opacity fades
 * in and out inside the turn so that it does not flash.
 * @param crossing The line, its colour and the size of its dots.
 * @param crossing.path The path the dot rides.
 * @param crossing.colour What colour it is.
 * @param crossing.radius How big it is.
 * @param cycle How long the whole exchange's clock takes, in seconds.
 * @param turn When this message's dot crosses.
 * @returns The markup for one dot.
 */
function timedPulse(
	crossing: { readonly path: string; readonly colour: string; readonly radius: number },
	cycle: number,
	turn: Turn,
): string {
	const duration = `${coord(cycle)}s`;
	const { start, finish, ramp } = turn;
	return wrap(
		"circle",
		{
			class: PULSE_CLASS,
			r: crossing.radius,
			fill: crossing.colour,
			opacity: 0,
			"pointer-events": "none",
		},
		tag("animateMotion", {
			dur: duration,
			repeatCount: "indefinite",
			keyPoints: "0;0;1;1",
			keyTimes: `0;${ratio(start)};${ratio(finish)};1`,
			calcMode: "linear",
			path: crossing.path,
		}) +
			tag("animate", {
				attributeName: "opacity",
				dur: duration,
				repeatCount: "indefinite",
				values: "0;0;1;1;0;0",
				keyTimes:
					`0;${ratio(start)};${ratio(start + ramp)};` +
					`${ratio(finish - ramp)};${ratio(finish)};1`,
			}),
	);
}

/**
 * A point on the cycle, as SMIL spells a key time.
 *
 * Clamped and fixed to three places because `keyTimes` must be non-decreasing
 * and end at 1: a value rounded past its neighbour, or a hair over 1, is a
 * document a browser drops the whole animation from rather than one it repairs.
 * @param value Where on the cycle, between 0 and 1.
 * @returns The key time.
 */
function ratio(value: number): string {
	return Math.min(Math.max(value, 0), 1).toFixed(3);
}

export { PULSE_CLASS, PULSE_RADIUS, TRAIN_RADIUS, timedPulse, travellingPulses };

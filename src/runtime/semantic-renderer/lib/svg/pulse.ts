// The travelling dot: the mark that says a line carries traffic rather than
// merely existing.
//
// Forked from PR Lens's `svg/pulse.ts`. Both grammars draw it from here,
// because a reader moving between them is reading one language — an
// architecture relationship and a sequence message differ in what they connect,
// not in how they live.
//
// Nothing about motion is on a board. Which lines move is decided from the
// meaning the schema already carries — what kind of relationship it is, how
// much attention it asks for, what a step repeats — because presentation is the
// renderer's (ADR 0023) and an authored `animated` flag would be an agent
// deciding how its architecture looks.
//
// A line running behind the drawing's clock says so with a negative `begin`,
// which starts its motion that far into its own turn. A positive delay would
// describe the same steady state and lie for the seconds after load: an
// animation has no effect before it begins, so a dot waiting for its turn would
// sit at the canvas origin, in the corner, in full view.

import { coord } from "@/runtime/semantic-renderer/lib/geometry";
import { lines, tag, wrap } from "@/runtime/semantic-renderer/lib/svg/primitives";

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

/** One line's worth of travelling dots. */
interface Pulse {
	/** The path the dots ride, in the same coordinates the line was drawn in. */
	readonly path: string;
	/** What colour they are, which is the line's own. */
	readonly colour: string;
	/** How many ride this line at once, spread evenly around the turn. */
	readonly count: number;
	/** How long one trip takes, in seconds. */
	readonly duration: number;
	/** How far this line runs behind the drawing's clock, in seconds. */
	readonly lag: number;
}

/**
 * The dots riding one line.
 *
 * They are drawn without an id and without pointer events on purpose: a pane
 * hit-tests subjects, and a dot is not one. Putting it in the way of a click
 * would make a relationship pickable only between crossings.
 * @param pulse The line, its colour, and how many dots at what pace.
 * @returns The markup, or nothing when no dot rides this line.
 */
function travellingPulses(pulse: Pulse): string {
	const { path, colour, count, duration, lag } = pulse;
	if (count < 1) {
		return "";
	}
	const radius = count > 1 ? TRAIN_RADIUS : PULSE_RADIUS;
	return lines(
		Array.from({ length: count }, (_, index) => {
			const behind = (lag + (duration / count) * index) % duration;
			return wrap(
				"circle",
				{ class: PULSE_CLASS, r: radius, fill: colour, "pointer-events": "none" },
				tag("animateMotion", {
					dur: `${coord(duration)}s`,
					begin: behind === 0 ? undefined : `${coord(behind - duration)}s`,
					repeatCount: "indefinite",
					path,
				}),
			);
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

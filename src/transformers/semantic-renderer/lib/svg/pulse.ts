import type { Curve } from "@/transformers/semantic-renderer/lib/layout/curves";
import { coord } from "@/transformers/semantic-renderer/lib/geometry";
import {
	FRONT,
	PULSE_LENGTH,
	TAIL,
	HEAD,
	barHeight,
	gradientOf,
	maskOf,
	pulseBreadth,
	pulseLook,
	tailFor,
	type Look,
} from "@/transformers/semantic-renderer/lib/svg/beam-light";
import { tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	legsOf,
	plain,
	routeLength,
	shortenedBy,
	type Leg,
} from "@/transformers/semantic-renderer/lib/svg/route-legs";
import type { Rhythm } from "@/transformers/semantic-renderer/lib/svg/traffic-relay";

// How a pulse is drawn, for every diagram that has one: a beam of light
// (`beam-light.ts`).
//
// The light is a gradient painted onto a bar that slides along each straight or
// bending piece of the route, and a soft mask in the shape of that piece lets it
// through, so the beam follows every bend of its line. The sliding is one
// transform, which a browser runs off the main thread. A train of pulses is one
// repeating gradient, so a line costs one animation for each piece of its route
// however many pulses it carries.
//
// Lines in an architecture carry a steady train of beams, the edges of cards
// carry them round, and the messages of a sequence carry one each in turn, so a
// reader learns one mark.

/**
 * The class every moving mark carries.
 *
 * One hook, for one rule: the stylesheet hides the whole layer when the reader
 * has asked for reduced motion. CSS cannot stop a SMIL animation, so hiding
 * what it moves is how the preference is honoured in a file that has no viewer
 * around it.
 */
const PULSE_CLASS = "ab-pulse";

/** The part of a line a pulse rides. */
interface Ride {
	/** The route. */
	readonly curve: Curve;
	/** How long it is. */
	readonly length: number;
}

/** The air between the base of an arrowhead and the pulse that sinks into it. */
const AIR = 1;

/**
 * How far short of its line's end a pulse's head stops: the base of the
 * arrowhead, and a little air.
 * @param headReach How far back from the line's end its arrowhead reaches.
 * @returns The distance.
 */
function standoffOf(headReach: number): number {
	return headReach + AIR;
}

/**
 * SMIL timecounts require decimal spelling; SVG geometric numbers may use exponents.
 * @param seconds A duration.
 * @returns Its timecount.
 */
function timecount(seconds: number): string {
	return `${seconds.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 21 })}s`;
}

/**
 * A point on the cycle, as SMIL spells a key time.
 *
 * Clamped and fixed to six places because `keyTimes` must be non-decreasing
 * and end at 1: a value rounded past its neighbour, or a hair over 1, is a
 * document a browser drops the whole animation from rather than one it repairs.
 * A cycle is seconds long, so six places hold a pulse's place to a hair.
 * @param value Where on the cycle, between 0 and 1.
 * @returns The key time.
 */
function ratio(value: number): string {
	return Math.min(Math.max(value, 0), 1).toFixed(6);
}

/**
 * A number held to one period.
 * @param value The number.
 * @param period The period.
 * @returns The number it is the same as, within `[0, period)`.
 */
function within(value: number, period: number): number {
	return ((value % period) + period) % period;
}

/**
 * One piece of a pulse: the mask in the shape of a piece of the route, and the
 * bar of light that slides behind it.
 * @param leg The piece.
 * @param bar The bar: how it sits in the piece's frame, and what it is painted with.
 * @param bar.mask The piece's mask.
 * @param bar.gradient The id of the gradient the bar is painted with.
 * @param bar.shift How far along its frame the bar starts.
 * @param bar.from How far along its frame the bar's left edge is, before it moves.
 * @param bar.width How wide the bar is.
 * @param bar.height How high the bar is.
 * @param bar.motion How the bar slides.
 * @returns The markup.
 */
function legMarkup(
	leg: Leg,
	bar: {
		mask: string;
		gradient: string;
		shift: number;
		from: number;
		width: number;
		height: number;
		motion: string;
	},
): string {
	const shift = bar.shift === 0 ? "" : ` translate(${plain(bar.shift, 2)} 0)`;
	return wrap(
		"g",
		{ mask: `url(#${bar.mask})` },
		wrap(
			"g",
			{ transform: `${leg.frame}${shift}` },
			wrap(
				"rect",
				{
					x: plain(bar.from, 2),
					y: plain(-bar.height / 2, 2),
					width: plain(bar.width, 2),
					height: plain(bar.height, 2),
					fill: `url(#${bar.gradient})`,
				},
				bar.motion,
			),
		),
	);
}

/**
 * A pulse as a group: its gradient and the masks of its pieces, then the pieces.
 * @param gradient The gradient the bars are painted with.
 * @param gradient.markup The gradient's markup.
 * @param pieces Each piece's mask and markup.
 * @returns The group.
 */
function pulseGroup(
	gradient: { markup: string },
	pieces: readonly { mask: { markup: string }; markup: string }[],
): string {
	return wrap(
		"g",
		{ class: PULSE_CLASS, "pointer-events": "none" },
		wrap("defs", {}, gradient.markup + pieces.map(({ mask }) => mask.markup).join("")) +
			pieces.map(({ markup }) => markup).join(""),
	);
}

/**
 * A line's traffic: a steady train of pulses. They are `spacing` apart and fly
 * at `speed`, and the train is where `phase` says at time zero, so a still
 * picture shows what the line carries. The train is one gradient that starts
 * over every spacing and slides along each piece of the route by one spacing
 * every spacing's time, so it never has a seam.
 * @param train The ink and size of the line, the route, and how its pulses move.
 * @param train.look The colours of the pulse and the width of its line.
 * @param train.ride The part of the line the pulses ride.
 * @param train.rhythm Their speed, spacing and place at time zero.
 * @returns The pulses, retained in exported SVGs.
 */
function steadyPulses(train: { look: Look; ride: Ride; rhythm: Rhythm }): string {
	const { look, ride, rhythm } = train;
	const period = Number(coord(rhythm.spacing));
	const core = pulseBreadth(look.lineWidth);
	const gradient = gradientOf(look, period, tailFor(period), true);
	const motion = tag("animateTransform", {
		attributeName: "transform",
		type: "translate",
		from: "0 0",
		to: `${plain(period)} 0`,
		dur: timecount(period / rhythm.speed),
		repeatCount: "indefinite",
		calcMode: "linear",
	});
	const pieces = legsOf(ride.curve).map((leg) => {
		const mask = maskOf(leg, core);
		const bar = {
			mask: mask.id,
			gradient: gradient.id,
			// The gradient's far end, where its front fades, sits a front's reach
			// past the head, which is on the phase.
			shift: within(rhythm.phase - leg.along + FRONT, period) - period,
			from: -period - 1,
			width: leg.length + 2 * period + 2,
			height: barHeight(leg, core),
			motion,
		};
		return { mask, markup: legMarkup(leg, bar) };
	});
	return pulseGroup(gradient, pieces);
}

/**
 * How a message's bar slides along one piece of its route: out of sight before
 * its light has reached the piece, across it at the clock's speed, and out of
 * sight again after the last of it has left.
 * @param leg The piece.
 * @param turn When and how fast the pulse flies.
 * @param turn.speed How fast it flies.
 * @param turn.cycle How long the clock takes, in seconds.
 * @param turn.start When its head leaves the start of the line, in seconds into the cycle.
 * @returns The slide as a SMIL element.
 */
function slideOf(leg: Leg, turn: { speed: number; cycle: number; start: number }): string {
	const { speed, cycle, start } = turn;
	const span = FRONT + HEAD + TAIL;
	/**
	 * How far the bar has slid at a moment: where the end of the gradient is in
	 * the piece's frame, less the gradient's own length. The head is `speed`
	 * times as far along the route as the time since the pulse set off.
	 * @param time The moment, in seconds into the cycle.
	 * @returns The slide.
	 */
	const slideAt = (time: number): number => (time - start) * speed - leg.along + FRONT - span;
	/**
	 * The moment the bar has slid so far: the other way round from `slideAt`.
	 * @param slide How far it has slid.
	 * @returns The moment, in seconds into the cycle.
	 */
	const momentOf = (slide: number): number => start + (slide + leg.along - FRONT + span) / speed;
	const from = Math.max(0, momentOf(-span - 1));
	const to = Math.min(cycle, momentOf(leg.length + 1));
	const slides = [slideAt(from), slideAt(from), slideAt(to), slideAt(to)];
	return tag("animateTransform", {
		attributeName: "transform",
		type: "translate",
		values: slides.map((x) => `${plain(x, 2)} 0`).join(";"),
		keyTimes: ["0", ratio(from / cycle), ratio(to / cycle), "1"].join(";"),
		dur: timecount(cycle),
		repeatCount: "indefinite",
		calcMode: "linear",
	});
}

/**
 * A message's pulse: one that crosses its line once in every turn of the clock
 * and is out of sight the rest of the time, so an exchange is told in order.
 * It comes out of the line's start, flies to its end at the clock's speed and
 * drains into it, which is how a pulse leaves one card and sinks into the next
 * in an architecture.
 * @param crossing The ink and size of the line, the route, and when and how fast the pulse flies.
 * @param crossing.look The colours of the pulse and the width of its line.
 * @param crossing.ride The line the pulse rides.
 * @param crossing.speed How fast it flies, in diagram units a second.
 * @param crossing.cycle How long the whole exchange's clock takes, in seconds.
 * @param crossing.start When its head leaves the start of the line, in seconds into the cycle.
 * @returns The pulse's markup.
 */
function turnPulse(crossing: {
	look: Look;
	ride: Ride;
	speed: number;
	cycle: number;
	start: number;
}): string {
	const { look, ride, speed, cycle, start } = crossing;
	const core = pulseBreadth(look.lineWidth);
	const span = FRONT + HEAD + TAIL;
	const gradient = gradientOf(look, span, TAIL, false);
	const pieces = legsOf(ride.curve).map((leg) => {
		const mask = maskOf(leg, core);
		const bar = {
			mask: mask.id,
			gradient: gradient.id,
			shift: 0,
			from: 0,
			width: span,
			height: barHeight(leg, core),
			motion: slideOf(leg, { speed, cycle, start }),
		};
		return { mask, markup: legMarkup(leg, bar) };
	});
	return pulseGroup(gradient, pieces);
}

/**
 * The part of a route a pulse rides: the route with the base of its arrowhead
 * taken off its end, so a pulse sinks into the arrowhead's base and never covers
 * the arrowhead.
 * @param curve The route.
 * @param headReach How far back from the route's end its arrowhead reaches.
 * @returns The part, or undefined when the route is too short to carry a pulse.
 */
function rideOf(curve: Curve, headReach: number): Ride | undefined {
	const ride = shortenedBy(curve, standoffOf(headReach));
	return ride === undefined ? undefined : { curve: ride, length: routeLength(ride) };
}

export {
	PULSE_CLASS,
	PULSE_LENGTH,
	pulseBreadth,
	pulseLook,
	rideOf,
	routeLength,
	standoffOf,
	steadyPulses,
	turnPulse,
	type Look,
	type Ride,
};

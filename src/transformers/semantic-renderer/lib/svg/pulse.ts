import { coord, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	pathOf,
	pointOnSegment,
	segmentStart,
	type Curve,
	type Segment,
} from "@/transformers/semantic-renderer/lib/layout/curves";
import { tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { mixed } from "@/transformers/semantic-renderer/lib/svg/colour";
import type { Rhythm } from "@/transformers/semantic-renderer/lib/svg/traffic-relay";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";

// How a pulse is drawn, for every diagram that has one: a laser bolt. A hot core
// in the relationship's colour, cut flat at the front, with a tail that fades
// back into the line it rides. Lines in an architecture
// carry a steady train of them, the edges of cards carry them round, and the
// messages of a sequence carry one each in turn, so a reader learns one mark.
// Each part of it is a stroke of the route it rides with a dash pattern, so a
// pulse follows a bend as its line does, and the motion is one animation of the
// dash offset.

/**
 * The class every moving mark carries.
 *
 * One hook, for one rule: the stylesheet hides the whole layer when the reader
 * has asked for reduced motion. CSS cannot stop a SMIL animation, so hiding
 * what it moves is how the preference is honoured in a file that has no viewer
 * around it.
 */
const PULSE_CLASS = "ab-pulse";

/** The ink and size of what a pulse rides. */
interface Look {
	/** The colour of the pulse's bright part ({@link pulseLook}). */
	readonly head: string;
	/** The colour of its hot core, nearer the page's text colour than the head is. */
	readonly hot: string;
	/** The colour of what it rides, which the tail fades back into. */
	readonly lineColour: string;
	/** How thick what it rides is, so a heavier line carries a heavier pulse. */
	readonly lineWidth: number;
}

/** The part of a line a pulse rides, and how long it is. */
interface Ride {
	/** The route, as path data. */
	readonly path: string;
	readonly length: number;
}

/** How thick a pulse's core is, at the least, in diagram units: a hair. */
const CORE_LEAST = 1.5;

/** How much thicker than its line a pulse's core is. */
const CORE_OVER_LINE = 0.6;

/** How long a pulse's bright head is: a bolt, far longer than it is wide. */
const HEAD = 16;

/** How long a pulse's tail is at the most. */
const TAIL = 40;

/** How much of the room between two pulses its head and tail may fill, so two never merge. */
const FILL = 0.8;

/**
 * A pulse's tail, from its faint far end to the part just behind its head: how
 * far back each layer reaches (a share of the tail), how opaque it is, and how
 * much of the head's colour it carries over the line's. Every layer is as thick
 * as the core and brighter than the line, so the tail shows on the line, and
 * stacked they fade away from the head into the line's colour.
 */
const TAIL_LAYERS = [
	{ reach: 1, opacity: 0.22, ink: 0.35 },
	{ reach: 0.7, opacity: 0.4, ink: 0.55 },
	{ reach: 0.42, opacity: 0.65, ink: 0.8 },
] as const;

/** How long the hot core is, as a share of the head, and how thick, as a share of the core. */
const HOT = { length: 0.6, width: 0.5 } as const;

/**
 * How far the bright part of a pulse moves from its relationship's colour toward
 * the page's text colour: a little on a coloured line, whose colour already
 * stands out from a line drawn weaker, and far on the neutral grey, which must
 * stand out from a line of its own colour. Darker on a light page, brighter on
 * a dark one. The hot core goes further still.
 */
const TEXT = { coloured: 0.25, neutral: 0.45, hot: 0.7 } as const;

/** The air between the base of an arrowhead and the pulse that sinks into it. */
const AIR = 1;

/**
 * The longest a pulse is, from the front of its head to the end of its tail: the
 * room a clock leaves after its last pulse has left, so none is cut off by the
 * turn of the cycle.
 */
const PULSE_LENGTH = Math.max(HEAD, TAIL);

/**
 * How a pulse on a line is drawn: its relationship's colour at full strength
 * with some of the page's text colour mixed in, and more of it in the core.
 * @param ink The relationship's colour at full strength.
 * @param ride What the pulse rides: the colour it is drawn in and how thick it is.
 * @param ride.lineColour The colour of what it rides.
 * @param ride.lineWidth How thick that is.
 * @param page The page: its neutral line colour and its text colour.
 * @returns The look.
 */
function pulseLook(
	ink: string,
	ride: { readonly lineColour: string; readonly lineWidth: number },
	page: Pick<Palette, "edge" | "foreground">,
): Look {
	const head = mixed(ink, page.foreground, ink === page.edge ? TEXT.neutral : TEXT.coloured);
	return { head, hot: mixed(ink, page.foreground, TEXT.hot), ...ride };
}

/**
 * How thick a pulse is on a line of one width: the width of its core.
 * @param lineWidth The line's width.
 * @returns The width.
 */
function pulseBreadth(lineWidth: number): number {
	return Math.max(CORE_LEAST, lineWidth + CORE_OVER_LINE);
}

/**
 * How far short of its line's end a pulse's head stops: the base of the
 * arrowhead, and a little air.
 * @param headReach How far back from the line's end its arrowhead reaches.
 * @returns The distance.
 */
function standoffOf(headReach: number): number {
	return headReach + AIR;
}

/** How many chords measure a rounded piece: a quarter bend's length to well under a tenth of a unit. */
const CHORDS = 16;

/**
 * How long one segment is along its ink.
 * @param from Where the segment starts.
 * @param segment The segment.
 * @returns Its length.
 */
function segmentLength(from: Point, segment: Segment): number {
	if (segment.kind === "line") return Math.hypot(segment.to.x - from.x, segment.to.y - from.y);
	let length = 0;
	let previous = from;
	for (let step = 1; step <= CHORDS; step += 1) {
		const point = pointOnSegment(from, segment, step / CHORDS);
		length += Math.hypot(point.x - previous.x, point.y - previous.y);
		previous = point;
	}
	return length;
}

/**
 * The point a fraction of the way from one point to another.
 * @param a The first point.
 * @param b The second.
 * @param t How far, from 0 to 1.
 * @returns The point.
 */
function lerp(a: Point, b: Point, t: number): Point {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * The first part of one segment, up to a fraction of it.
 * @param from Where the segment starts.
 * @param segment The segment.
 * @param t How much of it to keep, from 0 to 1.
 * @returns The kept part, which ends at the point `t` names.
 */
function segmentUpTo(from: Point, segment: Segment, t: number): Segment {
	const to = pointOnSegment(from, segment, t);
	if (segment.kind === "line") return { kind: "line", to };
	const first = lerp(from, segment.first, t);
	const second = lerp(first, lerp(segment.first, segment.second, t), t);
	return { kind: "cubic", first, second, to };
}

/**
 * The route with a length taken off its end: the part pulses ride, which stops
 * short of whatever the route ends in.
 * @param curve The route.
 * @param distance How much of its length to take off.
 * @returns The shorter route, or undefined when that is all of it.
 */
function shortenedBy(curve: Curve, distance: number): Curve | undefined {
	let left = distance;
	for (let index = curve.segments.length - 1; index >= 0; index -= 1) {
		const from = segmentStart(curve, index);
		const segment = curve.segments[index]!;
		const length = segmentLength(from, segment);
		if (length > left) {
			const kept = segmentUpTo(from, segment, 1 - left / length);
			return { from: curve.from, segments: [...curve.segments.slice(0, index), kept] };
		}
		left -= length;
	}
	return undefined;
}

/**
 * How long a route is along its ink.
 * @param curve The route.
 * @returns Its length.
 */
function routeLength(curve: Curve): number {
	return curve.segments.reduce(
		(length, segment, index) => length + segmentLength(segmentStart(curve, index), segment),
		0,
	);
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

/** One part of a pulse: a stroke of a given length ending at the head. */
interface Layer {
	/** How far back from the head it reaches. */
	readonly length: number;
	readonly width: number;
	readonly opacity: number;
	readonly colour: string;
}

/**
 * The parts of a pulse, from the end of its tail to the hot core in front.
 * @param look The ink and size of what the pulse rides.
 * @param room How far a pulse may reach before the next one or the end of its line.
 * @returns The layers.
 */
function layersOf(look: Look, room: number): Layer[] {
	const { lineWidth, lineColour, head, hot } = look;
	const core = pulseBreadth(lineWidth);
	const tail = Math.max(0, Math.min(TAIL, room * FILL - HEAD));
	return [
		...TAIL_LAYERS.map((layer) => ({
			length: tail * layer.reach,
			width: core,
			opacity: layer.opacity,
			colour: mixed(lineColour, head, layer.ink),
		})).filter(({ length }) => length >= 1),
		{ length: HEAD, width: core, opacity: 1, colour: head },
		{ length: HEAD * HOT.length, width: core * HOT.width, opacity: 1, colour: hot },
	];
}

/**
 * One part of a pulse as a stroke of its route.
 * @param ride The route.
 * @param layer The part.
 * @param dashes What the stroke's dashes are: a dash, and the gap after it.
 * @param dashes.dash How long the dash is.
 * @param dashes.gap How long the gap after it is.
 * @param offset Where the dashes start along the route, as the attribute says.
 * @param motion How the offset moves.
 * @returns The path.
 */
function strokeOf(
	ride: Ride,
	layer: Layer,
	dashes: { readonly dash: number; readonly gap: number },
	offset: number,
	motion: string,
): string {
	const { width, opacity, colour } = layer;
	return wrap(
		"path",
		{
			d: ride.path,
			fill: "none",
			stroke: colour,
			"stroke-width": coord(width),
			"stroke-opacity": opacity === 1 ? undefined : opacity,
			"stroke-dasharray": `${coord(dashes.dash)} ${coord(dashes.gap)}`,
			"stroke-dashoffset": coord(offset),
		},
		motion,
	);
}

/**
 * A line's traffic: a steady train of pulses. They are `spacing` apart and fly
 * at `speed`, and the train is where `phase` says at time zero, so a still
 * picture shows what the line carries. Every part of a pulse is one dash
 * pattern over the whole route, so each moves one spacing every spacing's
 * time and the train never has a seam.
 * @param train The ink and size of the line, the route, and how its pulses move.
 * @param train.look The ink and size of the line.
 * @param train.ride The part of the line the pulses ride.
 * @param train.rhythm Their speed, spacing and place at time zero.
 * @returns The pulses, retained in exported SVGs.
 */
function steadyPulses(train: { look: Look; ride: Ride; rhythm: Rhythm }): string {
	const { look, ride, rhythm } = train;
	const period = Number(coord(rhythm.spacing));
	const duration = timecount(period / rhythm.speed);
	return wrap(
		"g",
		{ class: PULSE_CLASS, "pointer-events": "none" },
		layersOf(look, rhythm.spacing)
			.map((layer) => {
				const dash = Math.min(Number(coord(layer.length)), period);
				// The head is where the dash ends, `dash` along the pattern: the offset
				// brings it to the phase.
				const offset = Number(coord(dash - rhythm.phase));
				return strokeOf(
					ride,
					layer,
					{ dash, gap: period - dash },
					offset,
					tag("animate", {
						attributeName: "stroke-dashoffset",
						from: offset,
						to: coord(offset - period),
						dur: duration,
						repeatCount: "indefinite",
						calcMode: "linear",
					}),
				);
			})
			.join(""),
	);
}

/**
 * A message's pulse: one that crosses its line once in every turn of the clock
 * and is out of sight the rest of the time, so an exchange is told in order.
 * It comes out of the line's start, flies to its end at the clock's speed and
 * drains into it, which is how a pulse leaves one card and sinks into the next
 * in an architecture.
 * @param crossing The ink and size of the line, the route, and when and how fast the pulse flies.
 * @param crossing.look The ink and size of the line.
 * @param crossing.ride The line the pulse rides.
 * @param crossing.speed How fast it flies, in diagram units a second.
 * @param crossing.cycle How long the whole exchange's clock takes, in seconds.
 * @param crossing.start When its head leaves the start of the line, in seconds into the cycle.
 * @returns The pulse's markup.
 */
function crossingPulse(crossing: {
	look: Look;
	ride: Ride;
	speed: number;
	cycle: number;
	start: number;
}): string {
	const { look, ride, speed, cycle, start } = crossing;
	return wrap(
		"g",
		{ class: PULSE_CLASS, "pointer-events": "none" },
		layersOf(look, Number.POSITIVE_INFINITY)
			.map((layer) => {
				const dash = Number(coord(layer.length));
				/**
				 * Where the dashes start along the line when the head is where the
				 * clock puts it at a moment, which is `speed` times as far along as the
				 * time since the pulse set off.
				 * @param time The moment, in seconds into the cycle.
				 * @returns The dash offset.
				 */
				const offsetAt = (time: number): number => dash - (time - start) * speed;
				// The head comes in at the line's start and the last of the dash leaves at
				// its end.
				const from = start;
				const to = Math.min(cycle, start + (ride.length + dash) / speed);
				const hidden = { from: offsetAt(from), to: offsetAt(to) };
				return strokeOf(
					ride,
					layer,
					// One dash and a gap too long for the next to reach the line.
					{ dash, gap: Math.ceil(ride.length) + 1 },
					hidden.from,
					tag("animate", {
						attributeName: "stroke-dashoffset",
						values: [hidden.from, hidden.from, hidden.to, hidden.to].map(coord).join(";"),
						keyTimes: ["0", ratio(from / cycle), ratio(to / cycle), "1"].join(";"),
						dur: timecount(cycle),
						repeatCount: "indefinite",
						calcMode: "linear",
					}),
				);
			})
			.join(""),
	);
}

/**
 * The part of a route a pulse rides: the route with the base of its arrowhead
 * and the pulse's own reach taken off its end, so a pulse sinks into the
 * arrowhead's base and never blunts the arrowhead.
 * @param curve The route.
 * @param headReach How far back from the route's end its arrowhead reaches.
 * @returns The part, or undefined when the route is too short to carry a pulse.
 */
function rideOf(curve: Curve, headReach: number): Ride | undefined {
	const ride = shortenedBy(curve, standoffOf(headReach));
	return ride === undefined ? undefined : { path: pathOf(ride), length: routeLength(ride) };
}

export {
	PULSE_CLASS,
	PULSE_LENGTH,
	crossingPulse,
	pulseBreadth,
	pulseLook,
	rideOf,
	routeLength,
	standoffOf,
	steadyPulses,
	type Look,
	type Ride,
};

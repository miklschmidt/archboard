import { type SemanticEdge } from "@/shared/semantic-board/index";
import { coord, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	pathOf,
	pointOnSegment,
	segmentStart,
	type Curve,
	type Segment,
} from "@/transformers/semantic-renderer/lib/layout/curves";
import { restingPlace } from "@/transformers/semantic-renderer/lib/svg/comet-rest";
import {
	shotSchedule,
	type ShotSchedule,
} from "@/transformers/semantic-renderer/lib/svg/traffic-shots";
import { TRAFFIC_STILL_MS, TRAFFIC_STREAK_MS } from "@/shared/timing/timing";
import { tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	colourId,
	lightDark,
	mixed,
	translucent,
} from "@/transformers/semantic-renderer/lib/svg/colour";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";

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
	/** The relationship's id: what its irregular launches are drawn from. */
	readonly id: string;
	/** The route as drawn, bridges and all. */
	readonly curve: Curve;
	/** How far back from the route's end its arrowhead reaches: no comet may cover it. */
	readonly headReach: number;
	/** The relationship's colour at full strength; its line is drawn weaker. */
	readonly colour: string;
	/** The colour its line is drawn in, which the comet's tail fades back into. */
	readonly lineColour: string;
	/** How thick the line the comets ride is drawn, so a heavier line carries heavier comets. */
	readonly lineWidth: number;
	/** The page the comets are drawn on: its background, its neutral line colour and its text colour. */
	readonly page: Pick<Palette, "background" | "edge" | "foreground">;
	readonly traffic: NonNullable<SemanticEdge["traffic"]>;
	/** Every relationship's label, drawn over the traffic: no resting streak sits half under one. */
	readonly labels: readonly Box[];
}

/** How much of the line it rides a streak may cover at most, so a streak never fills a short line. */
const STREAK_LINE_SHARE = 0.45;

/**
 * How much of the shortest distance between two shots one streak may cover,
 * so two shots fired close together stay two streaks rather than merging.
 */
const STREAK_GAP_SHARE = 0.7;

/**
 * A streak's tail, from its faint far end to the part just behind its head:
 * how far back each layer reaches (a share of the tail), how thick it is (a
 * share of the way from its line's width to its head's), how opaque, and how
 * much of the head's colour it carries over the line's. Every layer is at least
 * as thick as the line and darker than it, so the whole tail shows on the line
 * rather than hiding inside it. Stacked, the layers thin and fade away from the
 * head into the line's colour, so a streak at rest still points the way its
 * relationship flows.
 */
const STREAK_TAIL_LAYERS = [
	{ reach: 1, width: 0.05, opacity: 0.35, ink: 0.35 },
	{ reach: 0.7, width: 0.15, opacity: 0.5, ink: 0.6 },
	{ reach: 0.42, width: 0.32, opacity: 0.7, ink: 0.8 },
	{ reach: 0.2, width: 0.6, opacity: 0.9, ink: 0.95 },
] as const;

/** How long a streak's head is along its line, as a share of its width: a bolt, longer than it is wide. */
const STREAK_HEAD_LENGTH = 1.4;

/**
 * The soft glow around a comet's head, as a multiple of the head, and how
 * opaque it is on each ground: brighter on a dark page, where it reads as
 * light, fainter on a light one, where it reads as a shadow. Which ground it
 * is, is the page's `color-scheme`, so the glow's colour carries both.
 */
const COMET_GLOW = { width: 2.6, opacity: { dark: 0.35, light: 0.16 } } as const;

/**
 * The colour of a comet's glow: its head's colour, as opaque as the ground
 * the picture is shown on asks for.
 * @param colour The head's colour.
 * @returns The glow's colour.
 */
function glowColour(colour: string): string {
	return lightDark(
		translucent(colour, COMET_GLOW.opacity.light),
		translucent(colour, COMET_GLOW.opacity.dark),
	);
}

/**
 * The ring of the page's own background around a comet's head, as the width it
 * adds on each side: what lifts the comet off the line it rides, as a bridge's
 * gap does.
 */
const COMET_MOAT = 1.4;

/**
 * How far a comet's head moves from its relationship's colour toward the page's
 * text colour: a little on a coloured line, whose colour already stands out
 * from a line drawn weaker, and far on the neutral grey, which must stand out
 * from a line of its own colour. Darker on a light page, brighter on a dark one.
 */
const COMET_TEXT = { coloured: 0.3, neutral: 0.6 } as const;

/**
 * The colour a comet's head is drawn in: its relationship's colour at full
 * strength with some of the page's text colour mixed in.
 * @param ink The relationship's colour at full strength.
 * @param page The page: its neutral line colour and its text colour.
 * @returns The head's colour.
 */
function cometColour(ink: string, page: Pick<Palette, "edge" | "foreground">): string {
	const share = ink === page.edge ? COMET_TEXT.neutral : COMET_TEXT.coloured;
	return mixed(ink, page.foreground, share);
}

/**
 * How thick a comet's head is on a line of one width: a heavier line carries heavier comets.
 * @param lineWidth The line's width.
 * @returns The head's width.
 */
function cometHead(lineWidth: number): number {
	return Math.max(PULSE_RADIUS * 2.3, lineWidth + 4.4);
}

/**
 * How wide the widest layer of a comet on a line of one width is: its glow.
 * @param lineWidth The line's width.
 * @returns The width.
 */
function pulseBreadth(lineWidth: number): number {
	return cometHead(lineWidth) * COMET_GLOW.width;
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
 * The route with a length taken off its end: the part comets ride, which stops
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
 * SMIL timecounts require decimal spelling; SVG geometric numbers may use exponents.
 * @param seconds A duration.
 * @returns Its timecount.
 */
function timecount(seconds: number): string {
	return `${seconds.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 21 })}s`;
}

/**
 * How long a route is along its ink.
 * @param curve The route.
 * @returns Its length.
 */
function curveLength(curve: Curve): number {
	return curve.segments.reduce(
		(length, segment, index) => length + segmentLength(segmentStart(curve, index), segment),
		0,
	);
}

/** One line's traffic, laid along the route it rides: what every layer of its streaks shares. */
interface Volley {
	/** The route, as path data. */
	readonly path: string;
	/** How far along the route the resting streak's head is. */
	readonly rest: number;
	/**
	 * The gap either side of the resting streak in the still picture: longer
	 * than the whole route and a glow's round cap, so wherever the streak rests
	 * no dash before or after it shows on the route.
	 */
	readonly still: number;
	/**
	 * How far each head is from the one ahead of it on the route, over one
	 * cycle, rounded as written: the shots fired earlier are further along.
	 */
	readonly spacings: readonly number[];
	/** Their sum: how far the whole train moves in one cycle. */
	readonly period: number;
	/** How long one cycle takes. */
	readonly cycle: string;
}

/**
 * How far each head is from the one ahead of it, as rounded distances whose
 * sum is exactly the rounded length of the cycle, so the pattern repeats where
 * the clock says it does.
 * @param schedule The shots' speed and the gaps between their launches.
 * @returns The distances, in route order from the resting head forward.
 */
function trainSpacings(schedule: ShotSchedule): number[] {
	// The shot ahead of one on the route was fired before it: route order is
	// launch order backwards.
	const distances = schedule.gaps.toReversed().map((gap) => gap * schedule.speed);
	let along = 0;
	let written = 0;
	return distances.map((distance) => {
		along += distance;
		const next = Number(coord(along));
		const spacing = Number(coord(next - written));
		written = next;
		return spacing;
	});
}

/**
 * One layer of a line's streaks: a dash of one length per shot, each ending
 * where its shot's head is.
 *
 * The layer's own attributes are the still picture: one dash, ending on the
 * resting place, and a gap longer than the route. A moment later the dash
 * pattern becomes the whole train of shots, the resting one among them, and
 * the train moves one cycle's distance every cycle. Every layer rides the same
 * clock and ends on the same heads, so a streak holds together on straight and
 * bent routes alike.
 * @param volley The route, the resting place, the train and its clock.
 * @param layer How long, thick, opaque and in what colour this layer is.
 * @param layer.length How far back from the head it reaches.
 * @param layer.width How thick it is.
 * @param layer.opacity How opaque it is.
 * @param layer.colour What colour it is.
 * @param layer.moat Set on the ring in the page's colour.
 * @returns The layer's path.
 */
function streakLayer(
	volley: Volley,
	layer: {
		readonly length: number;
		readonly width: number;
		readonly opacity: number;
		readonly colour: string;
		/** Set on the ring, which is drawn in the page's colour rather than the line's. */
		readonly moat?: true;
	},
): string {
	const { width, opacity, colour, moat } = layer;
	const length = Number(coord(layer.length));
	const offset = Number(coord(length - volley.rest));
	const begin = timecount(TRAFFIC_STILL_MS / 1000);
	// A dash never outgrows its spacing, so every layer repeats over the same
	// distance the train moves in a cycle, however close the shots are fired.
	const train = volley.spacings
		.map((spacing) => {
			const dash = Math.min(length, spacing);
			return `${dash} ${coord(spacing - dash)}`;
		})
		.join(" ");
	return wrap(
		"path",
		{
			d: volley.path,
			"data-pulse-part": moat === true ? "moat" : undefined,
			fill: "none",
			stroke: colour,
			"stroke-width": coord(width),
			"stroke-opacity": opacity === 1 ? undefined : opacity,
			"stroke-linecap": "round",
			"stroke-dasharray": `${length} ${coord(volley.still)}`,
			"stroke-dashoffset": offset,
		},
		tag("set", { attributeName: "stroke-dasharray", to: train, begin }) +
			tag("animate", {
				attributeName: "stroke-dashoffset",
				from: offset,
				to: coord(offset - volley.period),
				dur: volley.cycle,
				begin,
				repeatCount: "indefinite",
				calcMode: "linear",
			}),
	);
}

/**
 * A relationship's traffic as shots fired along its line.
 *
 * Each shot is a streak: a head ringed by the page's colour, with a soft glow,
 * in its relationship's colour with some of the page's text mixed in, and a
 * long thin tail that fades from the head's colour back into the line's. The
 * line fires its volume's worth of shots a second on average, at irregular
 * moments, each crossing at a multiple of the authored speed (ADR 0027). Every
 * layer is one dash pattern over the whole route, so shots in flight together
 * are dashes of one pattern and none is dropped, whatever the volume. A still
 * picture shows one streak at rest on the line, pointing the way it flows.
 * @param pulse Route, line ink, line width, authored traffic and the labels drawn over it.
 * @returns The animated traffic, retained in exported SVGs.
 */
function travellingPulses(pulse: Pulse): string {
	const { lineWidth, lineColour, page } = pulse;
	const colour = cometColour(pulse.colour, page);
	const head = cometHead(lineWidth);
	const headLength = head * STREAK_HEAD_LENGTH;
	// The streaks ride the route up to the base of its arrowhead: a head there,
	// ringed by the page, would blunt the arrowhead into a dark block.
	const ride = shortenedBy(pulse.curve, pulse.headReach + head / 2 + COMET_MOAT);
	if (ride === undefined) return "";
	const length = curveLength(ride);
	const schedule = shotSchedule(pulse.traffic, pulse.id);
	const spacings = trainSpacings(schedule);
	const tail = Math.min(
		(schedule.speed * TRAFFIC_STREAK_MS) / 1000,
		length * STREAK_LINE_SHARE,
		Math.min(...spacings) * STREAK_GAP_SHARE,
	);
	const glow = head * COMET_GLOW.width;
	const volley: Volley = {
		path: pathOf(ride),
		// The two thickest layers of the tail read as the streak's body.
		rest: restingPlace(
			ride,
			length,
			{ glow: glow / 2, body: tail * STREAK_TAIL_LAYERS[2].reach },
			pulse.labels,
		),
		still: Math.ceil(length + glow) + 1,
		spacings,
		period: spacings.reduce((sum, spacing) => sum + spacing, 0),
		cycle: timecount(schedule.cycle),
	};
	return wrap(
		"g",
		{ class: PULSE_CLASS, "pointer-events": "none" },
		[
			streakLayer(volley, {
				length: 0,
				width: head * COMET_GLOW.width,
				opacity: 1,
				colour: glowColour(colour),
			}),
			streakLayer(volley, {
				length: headLength,
				width: head + COMET_MOAT * 2,
				opacity: 1,
				colour: page.background,
				moat: true,
			}),
			// The tail leaves the head in its colour and fades back into the line's.
			...STREAK_TAIL_LAYERS.map((layer) =>
				streakLayer(volley, {
					length: tail * layer.reach,
					width: lineWidth + (head - lineWidth) * layer.width,
					opacity: layer.opacity,
					colour: mixed(lineColour, colour, layer.ink),
				}),
			),
			streakLayer(volley, { length: headLength, width: head, opacity: 1, colour }),
		].join(""),
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

/** How far a timed comet's tail reaches behind its head, as a multiple of its radius. */
const TIMED_TAIL = 6;

/**
 * The tail of a timed comet, pointing back along the way it came, and the
 * gradient that fades it out. Drawn in the comet's own frame, heading along +x,
 * so `animateMotion`'s `rotate="auto"` turns it to follow whatever it rides.
 *
 * The gradient's id is its colour: panes shown inline share one document's id
 * namespace, and equal ids must always define equal gradients.
 * @param colour The comet's head's colour.
 * @param lineColour The colour its line is drawn in, which the tail fades into.
 * @param radius Its head's radius.
 * @returns The gradient's definition and the tail's markup.
 */
function timedTail(
	colour: string,
	lineColour: string,
	radius: number,
): { readonly defs: string; readonly tail: string } {
	// `_x` cannot occur inside a colour's id, so it keeps the two apart.
	const id = `ab-comet-tail-${colourId(lineColour)}_x${colourId(colour)}`;
	const reach = radius * TIMED_TAIL;
	const defs = wrap(
		"defs",
		{},
		wrap(
			"linearGradient",
			{ id, x1: 0, x2: 1, y1: 0, y2: 0 },
			tag("stop", { offset: 0, "stop-color": lineColour, "stop-opacity": 0 }) +
				tag("stop", { offset: 1, "stop-color": colour, "stop-opacity": 0.85 }),
		),
	);
	const tail = tag("path", {
		d: `M0,${coord(-radius * 0.9)} L${coord(-reach)},${coord(-radius * 0.18)} L${coord(-reach)},${coord(radius * 0.18)} L0,${coord(radius * 0.9)} Z`,
		fill: `url(#${id})`,
	});
	return { defs, tail };
}

/**
 * A comet that waits its turn, crosses, and waits again.
 *
 * Every message of an exchange shares one clock, so a reader sees the exchange
 * told in order rather than a dozen comets moving at once. A message's comet
 * sits still at the start of the line until its turn comes — `keyPoints` holds
 * it at 0, runs it to 1 across the turn, then holds it at 1 — and its opacity
 * fades in and out inside the turn so that it does not flash. It turns with
 * its line, head first, its tail fading behind it: the same comet a
 * relationship's traffic is drawn with.
 * @param crossing The line, its colour, the size of its comet and the page it is drawn on.
 * @param crossing.path The path the comet rides.
 * @param crossing.colour Its relationship's colour at full strength.
 * @param crossing.lineColour The colour its line is drawn in.
 * @param crossing.radius How big its head is.
 * @param crossing.page The page's background, which rings its head, and its text colour, which shades it.
 * @param cycle How long the whole exchange's clock takes, in seconds.
 * @param turn When this message's comet crosses.
 * @returns The markup for one comet.
 */
function timedPulse(
	crossing: {
		readonly path: string;
		readonly colour: string;
		readonly lineColour: string;
		readonly radius: number;
		readonly page: Pick<Palette, "background" | "edge" | "foreground">;
	},
	cycle: number,
	turn: Turn,
): string {
	const duration = `${coord(cycle)}s`;
	const { start, finish, ramp } = turn;
	const { radius, page } = crossing;
	const colour = cometColour(crossing.colour, page);
	const { defs, tail } = timedTail(colour, crossing.lineColour, radius);
	return (
		defs +
		wrap(
			"g",
			{ class: PULSE_CLASS, opacity: 0, "pointer-events": "none" },
			tag("circle", { r: radius + COMET_MOAT, fill: page.background, "data-pulse-part": "moat" }) +
				tail +
				tag("circle", { r: radius, fill: colour }) +
				tag("animateMotion", {
					dur: duration,
					repeatCount: "indefinite",
					keyPoints: "0;0;1;1",
					keyTimes: `0;${ratio(start)};${ratio(finish)};1`,
					calcMode: "linear",
					rotate: "auto",
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
		)
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

export { PULSE_CLASS, PULSE_RADIUS, TRAIN_RADIUS, pulseBreadth, timedPulse, travellingPulses };

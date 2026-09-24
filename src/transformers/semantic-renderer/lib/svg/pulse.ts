import { type SemanticEdge } from "@/shared/semantic-board/index";
import { coord } from "@/transformers/semantic-renderer/lib/geometry";
import { tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
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
	readonly path: string;
	readonly colour: string;
	/** How thick the line the comets ride is drawn, so a heavier line carries heavier comets. */
	readonly lineWidth: number;
	/** The page the comets are drawn on: its background and whether it is dark. */
	readonly page: Pick<Palette, "background" | "ground">;
	readonly traffic: NonNullable<SemanticEdge["traffic"]>;
}

/** The longest tail a comet draws, in diagram units, however far apart comets travel. */
const COMET_TAIL = 30;

/** How much of the space between two comets one comet's tail may take. */
const COMET_TAIL_SHARE = 0.5;

/**
 * A comet's tail, from its faint far end to the part just behind its head: how
 * far back each layer reaches (a share of the tail), how thick it is (a share
 * of the way from its line's width to its head's) and how opaque. Every layer
 * is at least as thick as the line, so the whole tail shows as a streak on the
 * line rather than hiding inside it. Stacked, the layers taper and fade away
 * from the head, so a comet at rest still points the way its relationship flows.
 */
const COMET_TAIL_LAYERS = [
	{ reach: 1, width: 0.1, opacity: 0.22 },
	{ reach: 0.7, width: 0.35, opacity: 0.36 },
	{ reach: 0.42, width: 0.62, opacity: 0.58 },
	{ reach: 0.18, width: 0.9, opacity: 0.85 },
] as const;

/**
 * The soft glow around a comet's head, as a multiple of the head, and how
 * opaque it is on each ground: light on a dark page, and none on a light one,
 * where a dark halo reads as a smudge.
 */
const COMET_GLOW = { width: 2.6, opacity: { dark: 0.35, light: 0 } } as const;

/** How long a comet's head is along its line, as a share of its width: a capsule, not a dot. */
const COMET_HEAD_LENGTH = 0.55;

/**
 * The ring of the page's own background around a comet's head, as the width it
 * adds on each side. A comet is drawn in its line's ink, the same as the line
 * and its arrowhead, so a change's colour reads the same on all three; the
 * ring is what lifts it off the line it rides, as a bridge's gap does.
 */
const COMET_MOAT = 1.4;

/**
 * SMIL timecounts require decimal spelling; SVG geometric numbers may use exponents.
 * @param seconds A duration.
 * @returns Its timecount.
 */
function timecount(seconds: number): string {
	return `${seconds.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 21 })}s`;
}

/**
 * One layer of a comet stream: dashes of one length, one per comet, each
 * ending where its comet's head is.
 *
 * A dash pattern shifted back by the dash's own length puts the dash's far end
 * on the head, so every layer rides the same clock and stays behind its head
 * on straight and bent routes alike.
 * @param stream The route, the spacing between comets and their clock.
 * @param stream.path The route.
 * @param stream.spacing How far apart comets travel.
 * @param stream.seconds How long one comet takes to reach the next one's place.
 * @param layer How long, thick, opaque and in what colour this layer is.
 * @param layer.length How far back from the head it reaches.
 * @param layer.width How thick it is.
 * @param layer.opacity How opaque it is.
 * @param layer.colour What colour it is.
 * @param layer.moat Set on the ring in the page's colour.
 * @returns The layer's path.
 */
function cometLayer(
	stream: { readonly path: string; readonly spacing: number; readonly seconds: string },
	layer: {
		readonly length: number;
		readonly width: number;
		readonly opacity: number;
		readonly colour: string;
		/** Set on the ring, which is drawn in the page's colour rather than the line's. */
		readonly moat?: true;
	},
): string {
	const { path, spacing, seconds } = stream;
	const { length, width, opacity, colour, moat } = layer;
	return wrap(
		"path",
		{
			d: path,
			"data-pulse-part": moat === true ? "moat" : undefined,
			fill: "none",
			stroke: colour,
			"stroke-width": coord(width),
			"stroke-opacity": opacity === 1 ? undefined : opacity,
			"stroke-linecap": "round",
			"stroke-dasharray": `${coord(length)} ${Math.max(Number.MIN_VALUE, spacing - length)}`,
			"stroke-dashoffset": length === 0 ? undefined : coord(length),
		},
		tag("animate", {
			attributeName: "stroke-dashoffset",
			from: length === 0 ? 0 : coord(length),
			to: length === 0 ? -spacing : coord(length - spacing),
			dur: seconds,
			repeatCount: "indefinite",
			calcMode: "linear",
		}),
	);
}

/**
 * A steady stream of comets measured directly along the final SVG path.
 *
 * Each comet is a head ringed by the page's colour, with a glow on a dark
 * page, and a tail that tapers and fades behind it, all in its line's ink,
 * spaced speed/volume units apart. Every layer is one dash pattern
 * over the whole route, advanced by one spacing every 1/volume seconds, which
 * gives fixed distance per second on straight and curved routes, already
 * populated at load, and any volume without one element per comet (ADR 0027).
 * The tail is what a round dot never said: which way the relationship flows,
 * even in a picture that does not move.
 * @param pulse Route, line ink, line width and authored traffic.
 * @returns The animated comet stream, retained in exported SVGs.
 */
function travellingPulses(pulse: Pulse): string {
	const { path, colour, lineWidth, page, traffic } = pulse;
	const spacing = Math.max(
		Number.MIN_VALUE,
		Math.min(Number.MAX_VALUE, traffic.speed / traffic.volume),
	);
	const seconds = timecount(Math.min(Number.MAX_VALUE, 1 / traffic.volume));
	const head = Math.max(PULSE_RADIUS * 2.3, lineWidth + 4.4);
	const headLength = head * COMET_HEAD_LENGTH;
	const tail = Math.min(COMET_TAIL, spacing * COMET_TAIL_SHARE);
	const stream = { path, spacing, seconds };
	const glow = COMET_GLOW.opacity[page.ground];
	return wrap(
		"g",
		{ class: PULSE_CLASS, "pointer-events": "none" },
		[
			glow === 0
				? ""
				: cometLayer(stream, { length: 0, width: head * COMET_GLOW.width, opacity: glow, colour }),
			cometLayer(stream, {
				length: headLength,
				width: head + COMET_MOAT * 2,
				opacity: 1,
				colour: page.background,
				moat: true,
			}),
			...COMET_TAIL_LAYERS.map((layer) =>
				cometLayer(stream, {
					length: tail * layer.reach,
					width: lineWidth + (head - lineWidth) * layer.width,
					opacity: layer.opacity,
					colour,
				}),
			),
			cometLayer(stream, { length: headLength, width: head, opacity: 1, colour }),
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
 * @param colour The comet's colour.
 * @param radius Its head's radius.
 * @returns The gradient's definition and the tail's markup.
 */
function timedTail(
	colour: string,
	radius: number,
): { readonly defs: string; readonly tail: string } {
	const id = `ab-comet-tail-${colour.replace(/[^0-9a-z]/giu, "")}`;
	const reach = radius * TIMED_TAIL;
	const defs = wrap(
		"defs",
		{},
		wrap(
			"linearGradient",
			{ id, x1: 0, x2: 1, y1: 0, y2: 0 },
			tag("stop", { offset: 0, "stop-color": colour, "stop-opacity": 0 }) +
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
 * @param crossing.colour Its line's ink.
 * @param crossing.radius How big its head is.
 * @param crossing.page The page's background, which rings its head.
 * @param cycle How long the whole exchange's clock takes, in seconds.
 * @param turn When this message's comet crosses.
 * @returns The markup for one comet.
 */
function timedPulse(
	crossing: {
		readonly path: string;
		readonly colour: string;
		readonly radius: number;
		readonly page: Pick<Palette, "background">;
	},
	cycle: number,
	turn: Turn,
): string {
	const duration = `${coord(cycle)}s`;
	const { start, finish, ramp } = turn;
	const { colour, radius, page } = crossing;
	const { defs, tail } = timedTail(colour, radius);
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

export { PULSE_CLASS, PULSE_RADIUS, TRAIN_RADIUS, timedPulse, travellingPulses };

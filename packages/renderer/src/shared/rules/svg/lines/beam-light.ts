// The light of a pulse: what it is made of, as colours, a gradient along its
// length and a mask across it. A pulse is a real gradient, not a stack of
// strokes: a short hot head with a long tail that fades smoothly away behind it,
// in a soft glow, so it reads as light and not as marks.
import { coord } from "#shared/rules/geometry.ts";
import { tag } from "#shared/rules/svg/page/primitives.ts";
import { legPath, plain, type Leg } from "#shared/rules/svg/lines/route-legs.ts";
import { tinted, type Share } from "#shared/rules/svg/parts/slab.ts";
import type { Palette } from "#shared/rules/svg/page/theme.ts";

/** The colours of a pulse and how thick the line it rides is. */
interface Look {
	/** The colour of the beam's body ({@link pulseLook}). */
	readonly head: string;
	/** The colour of its hot front, nearer white than the body is. */
	readonly hot: string;
	/** How thick what it rides is, so a heavier line carries a heavier pulse. */
	readonly lineWidth: number;
}

/** How thick a pulse's core is, at the least, in diagram units: a hair. */
const CORE_LEAST = 1.5;

/** How much thicker than its line a pulse's core is. */
const CORE_OVER_LINE = 0.6;

/**
 * How a pulse falls off across the line it rides: how much wider than its core
 * each layer of the glow is, and how much light it lets through. Stacked, they
 * give a bright thin core in a soft halo with no edge to it.
 */
const GLOW = [
	{ over: 6, light: 0.07 },
	{ over: 3.4, light: 0.2 },
	{ over: 1.3, light: 0.5 },
	{ over: 0, light: 0.9 },
] as const;

/** How much wider than its core a layer of the glow must be to be part of the halo. */
const HALO_OVER = 1;

/** How long a pulse's bright head is, along its line. */
const HEAD = 12;

/** How long its tail is at the most: the long, faint part behind the head. */
const TAIL = 56;

/** How far its light reaches past its head, softly, so the front is not a cut. */
const FRONT = 3;

/** How much of the room between two pulses its head and tail may fill, so two never merge. */
const FILL = 0.8;

/**
 * How the light of a pulse builds from the far end of its tail to its head: a
 * share of the light at a share of the tail, as a power that keeps the tail long
 * and faint and gathers the light near the head.
 */
const TAIL_CURVE = 2.3;

/** How much light the tail has where the head begins. */
const TAIL_LIGHT = 0.6;

/** How many steps the tail's gradient is spelt in: enough that no step shows. */
const TAIL_STEPS = 9;

/**
 * How much white a pulse mixes into the colour of its line, on each ground: its
 * body, and its hot front, which goes further. A pulse is lighter than the line
 * it rides, so it reads as light that travels along the line (TASK-407). On the
 * light ground it goes nearer white, because there the pulse shows only against
 * its own line.
 */
const LIGHT: Readonly<Record<"body" | "hot", Share>> = {
	body: { light: 0.65, dark: 0.5 },
	hot: { light: 0.9, dark: 0.8 },
};

/**
 * The longest a pulse is, from the front of its light to the end of its tail: the
 * room a clock leaves after its last pulse has left, so none is cut off by the
 * turn of the cycle.
 */
const PULSE_LENGTH = FRONT + HEAD + TAIL + 2;

/**
 * How a pulse on a line is drawn: its relationship's colour at full strength
 * with white mixed in, and more of it in the front.
 * @param ink The relationship's colour at full strength.
 * @param lineWidth How thick what the pulse rides is.
 * @param page The page: the light a pulse mixes in.
 * @returns The look.
 */
function pulseLook(ink: string, lineWidth: number, page: Pick<Palette, "glow">): Look {
	return {
		head: tinted(ink, page.glow, LIGHT.body),
		hot: tinted(ink, page.glow, LIGHT.hot),
		lineWidth,
	};
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
 * How long a pulse's tail is where pulses are `room` apart: as long as it can be
 * without two of them merging.
 * @param room How far a pulse may reach before the next, or the end of its line.
 * @returns The tail's length.
 */
function tailFor(room: number): number {
	return Math.max(0, Math.min(TAIL, room * FILL - HEAD - FRONT));
}

/**
 * A short name for some markup, so equal markup always has the same id and
 * panes shown inline in one document can share what they draw alike.
 * @param markup What the id stands for.
 * @returns Seven characters of FNV-1a over it.
 */
function hashOf(markup: string): string {
	let state = 0x811c9dc5;
	for (let index = 0; index < markup.length; index += 1) {
		state = Math.imul(state ^ markup.charCodeAt(index), 0x01000193);
	}
	return (state >>> 0).toString(36).padStart(7, "0");
}

/**
 * How much room a mask keeps beyond the widest layer of the glow, and how much
 * a bar keeps. The bar's edge is inside the mask's, so the two never meet.
 */
const MASK_ROOM = 2;
const BAR_ROOM = 1;

/**
 * How high a bar must be to cover its piece's mask: the widest layer of the glow
 * and a little over, and as far again as the piece strays from a straight line.
 * @param leg The piece.
 * @param core How thick the pulse's core is.
 * @returns The height.
 */
function barHeight(leg: Leg, core: number): number {
	return core + GLOW[0].over + 2 * leg.sag + 2 * BAR_ROOM;
}

/**
 * The box the light of a piece stays inside: round every point the piece runs
 * through, as far out as the widest layer of the glow and a little room. Its
 * numbers are spelt as the markup spells them.
 * @param leg The piece.
 * @param core How thick the pulse's core is.
 * @returns The box.
 */
function boxOf(leg: Leg, core: number): { x: string; y: string; width: string; height: string } {
	const reach = (core + GLOW[0].over) / 2 + MASK_ROOM;
	const { from, segment } = leg;
	const points = [
		from,
		segment.to,
		...(segment.kind === "cubic" ? [segment.first, segment.second] : []),
	];
	const xs = points.map(({ x }) => x);
	const ys = points.map(({ y }) => y);
	const [x0, y0] = [Math.min(...xs) - reach, Math.min(...ys) - reach];
	const [width, height] = [Math.max(...xs) + reach - x0, Math.max(...ys) + reach - y0];
	return { x: coord(x0), y: coord(y0), width: coord(width), height: coord(height) };
}

/**
 * The clip that keeps the light of a piece inside the box of its mask.
 *
 * A mask already hides whatever lies outside its box, so the clip changes
 * nothing a browser draws as it should. But the page slides the bar on the
 * compositor (a Web Animation, `picture-traffic.ts`), and there Chromium let
 * slivers of the bar through outside the box while a pulse went by: stray marks
 * in empty canvas, tens of pixels past a bend. A clip to the same box, inside
 * the mask (`legMarkup` in `pulse.ts`), holds them in, and the bar still slides
 * on the compositor.
 * @param leg The piece.
 * @param core How thick the pulse's core is.
 * @returns The clip's id and its markup.
 */
function clipOf(leg: Leg, core: number): { id: string; markup: string } {
	const markup = tag("rect", boxOf(leg, core));
	const id = `ab-clip-${hashOf(markup)}`;
	return { id, markup: `<clipPath id="${id}">${markup}</clipPath>` };
}

/**
 * The mask that lets a beam through only where a piece of the route is: the piece
 * stroked in layers, thin and bright on top of wide and faint, which is the way
 * light falls off across the line.
 * @param leg The piece.
 * @param core How thick the pulse's core is.
 * @returns The mask's id and its markup.
 */
function maskOf(leg: Leg, core: number): { id: string; markup: string } {
	const joined = legPath(leg);
	const exact = legPath(leg, false);
	const box = boxOf(leg, core);
	const layers = GLOW.map(({ over, light }) =>
		tag("path", {
			d: over > HALO_OVER ? exact : joined,
			fill: "none",
			stroke: "#ffffff",
			"stroke-width": plain(core + over, 2),
			"stroke-opacity": light,
		}),
	).join("");
	const markup =
		`maskUnits="userSpaceOnUse" x="${box.x}" y="${box.y}" ` +
		`width="${box.width}" height="${box.height}">${layers}`;
	const id = `ab-mask-${hashOf(markup)}`;
	return { id, markup: `<mask id="${id}" ${markup}</mask>` };
}

/**
 * The gradient a pulse is painted with, along one axis: nothing, then a tail that
 * gathers slowly and then quickly toward a hot head, then a short soft front, and
 * nothing again. Spelt with its front at the far end, so a bar of it that slides
 * along carries the light head first.
 * @param look The colours of the pulse.
 * @param span How long the gradient runs along its axis.
 * @param tail How long the pulse's tail is.
 * @param repeat Whether the gradient starts over where it ends: a train of pulses.
 * @returns The gradient's id and its markup.
 */
function gradientOf(
	look: Look,
	span: number,
	tail: number,
	repeat: boolean,
): { id: string; markup: string } {
	const reach = FRONT + HEAD + tail;
	/**
	 * One stop of the gradient, at a distance back from the front's far end.
	 * @param behind How far back from the end of the gradient.
	 * @param colour The colour there.
	 * @param light How much light there is.
	 * @returns The stop.
	 */
	const stop = (behind: number, colour: string, light: number): string =>
		tag("stop", {
			offset: plain((span - behind) / span),
			"stop-color": colour,
			"stop-opacity": plain(light, 3),
		});
	const ramp = Array.from({ length: tail < 1 ? 0 : TAIL_STEPS }, (_, step) => {
		const share = step / TAIL_STEPS;
		return stop(reach - tail * share, look.head, TAIL_LIGHT * share ** TAIL_CURVE);
	});
	const stops = [
		...ramp,
		stop(FRONT + HEAD, look.head, TAIL_LIGHT),
		stop(FRONT + HEAD * 0.45, look.hot, 0.9),
		stop(FRONT, look.hot, 1),
		stop(0, look.hot, 0),
	].join("");
	const markup =
		`gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${plain(span)}" y2="0"` +
		`${repeat ? ' spreadMethod="repeat"' : ""}>${stops}`;
	const id = `ab-beam-${hashOf(markup)}`;
	return { id, markup: `<linearGradient id="${id}" ${markup}</linearGradient>` };
}

export {
	FRONT,
	HEAD,
	PULSE_LENGTH,
	TAIL,
	barHeight,
	clipOf,
	gradientOf,
	maskOf,
	pulseBreadth,
	pulseLook,
	tailFor,
	type Look,
};

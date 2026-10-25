// How the voice orb looks. A lens set in a gold ring, and on the lens a ridge of
// eleven ruled lines, like the lines of a drafting sheet. At rest the lines lie
// flat and breathe. When the model speaks, every line is a record of the model's
// output level: the middle of a line is now and its edges are the past, so a
// syllable swells in the middle and spreads out to both sides as it ages. Each line
// behind reads a step further back, so a loud moment rolls back through the sheet,
// and the lines in front hide the ones behind them. The ring's sheen turns faster
// the louder it gets, and a hard onset sends a ring of light out round the circle.
//
// The painter draws one frame from the state it is handed and keeps nothing.
// The canvas it draws on is `SIZE` pixels across, and the circle is in the middle
// of it, with `PAD` of room all round for the rings of light.

import { VOICE_MS } from "@archboard/timing";
import { rgba, type OrbColors } from "#ui/rules/orb/orb-colors.ts";
import { TAU, levelAgo, orbLight, type OrbDynamics } from "#ui/rules/orb/orb-dynamics.ts";

/** The circle the person presses, in pixels. */
const CIRCLE = 64;
/** The room round the circle for rings of light to leave into. */
const PAD = 10;
/** The side of the canvas. */
const SIZE = CIRCLE + 2 * PAD;
/** The middle of the canvas. */
const CENTER = SIZE / 2;

/** The ring's radius to the middle of its stroke, and the lens inside it. */
const RING_RADIUS = CIRCLE / 2 - 1;
const LENS_RADIUS = RING_RADIUS - 1;
/** How many lines the sheet has. */
const ROWS = 11;
/** Where now sits on a line, in sheet radii from its middle: a little to the right, so a line is not mirrored. */
const NOW_AT = 0.15;
/** How much of a line's half width, at each edge, it tapers to nothing over, so the past reads across the sheet. */
const EDGE_TAPER = 0.2;
/** How round the line is at now, in sheet radii: the past folds out from now without a point. */
const NOW_SOFTNESS = 0.16;
/** The radius the lines are cut to, a little inside the ring. */
const SHEET_RADIUS = LENS_RADIUS - 3;
/** Where the front line and the back line rest, as a share of the sheet's radius. */
const FRONT = 0.72;
const BACK = -0.8;
/** The step from one line to the next. */
const PITCH = ((FRONT - BACK) * SHEET_RADIUS) / (ROWS - 1);
/** How many pieces a line is drawn in. */
const SEGMENTS = 36;
/** How far a line at the front of a full-scale voice reaches, in sheet radii. */
const REACH = 1.1;
/** How far the lines lift when the voice only breathes, in sheet radii. */
const BREATH = 0.045;
/** The pieces a spark's tail is drawn in, and the arc of each. */
const COMET_STEPS = 7;
const COMET_STEP = 0.15;
/** The share of presence at which the ring has drawn all the way round. */
const RING_DONE = 0.6;
/** How far the lines rise before they are drawn, and how long they take to follow each other. */
const STAGGER = 0.6;
/** What the lens is shaded to at its edge, on a dark plate and on a light one. */
const SHADE_DARK = 0.32;
const SHADE_LIGHT = 0.08;
/** The top of a circle, where the ring starts to draw. */
const TOP = -Math.PI / 2;

/**
 * Ease out: fast at first and slow to arrive.
 * @param t How far along, 0..1.
 * @returns How far it has got, 0..1.
 */
function easeOut(t: number): number {
	return 1 - (1 - t) ** 3;
}

/**
 * How far a line has risen: the front line first, the back line last.
 * @param rise How far the whole sheet has risen, 0..1.
 * @param row The line, 0 at the front.
 * @returns A number in 0..1.
 */
function rowVisibility(rise: number, row: number): number {
	const late = (row / (ROWS - 1)) * STAGGER;
	return Math.min(1, Math.max(0, rise * (1 + STAGGER) - late));
}

/**
 * A smooth hill: the Gaussian bump that the ridge is built from.
 * @param u Where, in sheet radii from the middle.
 * @param centre Where its top is.
 * @param width How wide it is.
 * @returns A number in 0..1.
 */
function hill(u: number, centre: number, width: number): number {
	return Math.exp(-((u - centre) ** 2) / (2 * width * width));
}

/**
 * How much of a line shows at a place: all of it across the middle, tapering to
 * nothing only over the outer edge, so a line begins and ends on its baseline.
 * @param u Where, in sheet radii from the middle.
 * @returns A number in 0..1.
 */
function taper(u: number): number {
	const inside = (1 - Math.abs(u)) / EDGE_TAPER;
	if (inside >= 1) return 1;
	return inside <= 0 ? 0 : 0.5 - 0.5 * Math.cos(Math.PI * inside);
}

/**
 * The height of the ridge at one place on one line, as a share of the line's reach:
 * the level the model had as long ago as that place and that line read back, or the
 * slow breath of a listening voice in the middle, whichever is more. A little ragged
 * where the voice bites. Nothing at the sheet's edges.
 * @param x Where across the sheet, in pixels from its middle.
 * @param row The line, 0 at the front.
 * @param dyn The state.
 * @returns A number near 0..1.
 */
function ridge(x: number, row: number, dyn: OrbDynamics): number {
	const u = x / SHEET_RADIUS;
	const away = Math.hypot(u - NOW_AT, NOW_SOFTNESS) - NOW_SOFTNESS;
	const heard = levelAgo(dyn, row * VOICE_MS.rowStep + away * VOICE_MS.trace);
	const breathing = 0.5 + 0.5 * Math.sin((dyn.clock / VOICE_MS.breath) * TAU - row * 0.55);
	const breath = BREATH * breathing * hill(u, 0, 0.34);
	const rough = 0.06 * Math.sin(u * 23 + (dyn.clock / 1000) * 6 + row * 2.3) * dyn.spark * heard;
	return taper(u) * (Math.max(heard, breath) + rough);
}

/**
 * How far a line reaches at the full level, in pixels: less when the voice is hushed.
 * @param dyn The state.
 * @returns The reach.
 */
function sheetReach(dyn: OrbDynamics): number {
	return SHEET_RADIUS * REACH * (1 - 0.9 * dyn.hush.x);
}

/**
 * Trace one line of the ridge across the sheet, as the context's current path.
 * @param ctx The canvas.
 * @param dyn The state.
 * @param row The line, 0 at the front.
 */
function traceRow(ctx: CanvasRenderingContext2D, dyn: OrbDynamics, row: number): void {
	const base = FRONT * SHEET_RADIUS - row * PITCH;
	const reach = sheetReach(dyn);
	ctx.beginPath();
	for (let step = 0; step <= SEGMENTS; step += 1) {
		const x = -SHEET_RADIUS + (2 * SHEET_RADIUS * step) / SEGMENTS;
		const y = base - reach * ridge(x, row, dyn);
		if (step === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
}

/**
 * Draw one line: first the ground under it, which hides the lines behind, then
 * the line, dark and then bright over it, brighter toward the front.
 * @param ctx The canvas.
 * @param dyn The state.
 * @param colors The colours.
 * @param row The line, 0 at the front.
 */
function paintRow(
	ctx: CanvasRenderingContext2D,
	dyn: OrbDynamics,
	colors: OrbColors,
	row: number,
): void {
	const visible = rowVisibility(Math.min(1, dyn.presence.x), row);
	if (visible < 0.004) return;
	traceRow(ctx, dyn, row);
	ctx.lineTo(SHEET_RADIUS + 2, SHEET_RADIUS + 2);
	ctx.lineTo(-SHEET_RADIUS - 2, SHEET_RADIUS + 2);
	ctx.closePath();
	ctx.fillStyle = rgba(colors.plate, 1);
	ctx.fill();
	traceRow(ctx, dyn, row);
	const depth = 1 - row / (ROWS - 1);
	const alpha = visible * (0.3 + 0.7 * depth) * (1 - 0.55 * dyn.hush.x);
	ctx.lineWidth = 1 + 0.5 * depth;
	ctx.strokeStyle = rgba(colors.lo, alpha);
	ctx.stroke();
	ctx.strokeStyle = rgba(colors.hi, alpha * depth);
	ctx.stroke();
}

/**
 * Draw the ridge, cut to the sheet, from the back line to the front one.
 * @param ctx The canvas.
 * @param dyn The state.
 * @param colors The colours.
 */
function paintRows(ctx: CanvasRenderingContext2D, dyn: OrbDynamics, colors: OrbColors): void {
	if (dyn.presence.x <= RING_DONE * 0.5) return;
	ctx.save();
	ctx.beginPath();
	ctx.arc(0, 0, SHEET_RADIUS, 0, TAU);
	ctx.clip();
	for (let row = ROWS - 1; row >= 0; row -= 1) paintRow(ctx, dyn, colors, row);
	ctx.restore();
}

/**
 * Shade the lens toward its edge, so the sheet reads as lying in a dish. It comes
 * with the ring and goes with it, so a dark orb leaves nothing on the canvas.
 * @param ctx The canvas.
 * @param dyn The state.
 * @param colors The colours.
 */
function paintDish(ctx: CanvasRenderingContext2D, dyn: OrbDynamics, colors: OrbColors): void {
	const shade = colors.dark ? SHADE_DARK : SHADE_LIGHT;
	const dish = ctx.createRadialGradient(0, 0, LENS_RADIUS * 0.45, 0, 0, LENS_RADIUS);
	dish.addColorStop(0, "rgba(0, 0, 0, 0)");
	dish.addColorStop(1, `rgba(0, 0, 0, ${shade})`);
	ctx.save();
	ctx.globalAlpha = Math.min(1, Math.max(0, dyn.presence.x / RING_DONE));
	ctx.fillStyle = dish;
	ctx.beginPath();
	ctx.arc(0, 0, LENS_RADIUS, 0, TAU);
	ctx.fill();
	ctx.restore();
}

/**
 * Light the lens from within by as much as the voice gives. On a dark plate the
 * light adds to what is there; on a light one it warms it.
 * @param ctx The canvas.
 * @param dyn The state.
 * @param colors The colours.
 */
function paintBloom(ctx: CanvasRenderingContext2D, dyn: OrbDynamics, colors: OrbColors): void {
	const light = orbLight(dyn);
	if (light < 0.01) return;
	const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, LENS_RADIUS);
	bloom.addColorStop(0, rgba(colors.hi, light));
	bloom.addColorStop(1, rgba(colors.hi, 0));
	ctx.save();
	ctx.globalCompositeOperation = colors.dark ? "lighter" : "source-over";
	ctx.globalAlpha = colors.dark ? 0.4 : 0.3;
	ctx.fillStyle = bloom;
	ctx.beginPath();
	ctx.arc(0, 0, LENS_RADIUS, 0, TAU);
	ctx.fill();
	ctx.restore();
}

/**
 * The ring's gold: a sheen that turns round it, bright, dark and bright again.
 * @param ctx The canvas.
 * @param dyn The state.
 * @param colors The colours.
 * @returns The gradient to stroke it with.
 */
function ringSheen(
	ctx: CanvasRenderingContext2D,
	dyn: OrbDynamics,
	colors: OrbColors,
): CanvasGradient {
	const sheen = ctx.createConicGradient(dyn.turn, 0, 0);
	sheen.addColorStop(0, rgba(colors.hi, 1));
	sheen.addColorStop(0.22, rgba(colors.lo, 1));
	sheen.addColorStop(0.4, rgba(colors.gold, 1));
	sheen.addColorStop(0.62, rgba(colors.lo, 1));
	sheen.addColorStop(0.8, rgba(colors.hi, 1));
	sheen.addColorStop(1, rgba(colors.hi, 1));
	return sheen;
}

/**
 * The spark that laps the ring while voice is on its way, with a tail behind it.
 * @param ctx The canvas.
 * @param dyn The state.
 * @param colors The colours.
 */
function paintComet(ctx: CanvasRenderingContext2D, dyn: OrbDynamics, colors: OrbColors): void {
	const waiting = dyn.pending.x;
	if (waiting < 0.02) return;
	const head = (dyn.clock / VOICE_MS.comet) * TAU + TOP;
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineWidth = 3;
	ctx.globalCompositeOperation = colors.dark ? "lighter" : "source-over";
	for (let step = 0; step < COMET_STEPS; step += 1) {
		ctx.strokeStyle = rgba(colors.hi, waiting * (1 - step / COMET_STEPS) ** 2);
		ctx.beginPath();
		ctx.arc(0, 0, RING_RADIUS, head - (step + 1) * COMET_STEP, head - step * COMET_STEP);
		ctx.stroke();
	}
	ctx.restore();
}

/**
 * Draw the ring: it draws itself round from the top as the orb lights, thickens
 * with the voice, and dims when hushed.
 * @param ctx The canvas.
 * @param dyn The state.
 * @param colors The colours.
 */
function paintRing(ctx: CanvasRenderingContext2D, dyn: OrbDynamics, colors: OrbColors): void {
	const drawn = easeOut(Math.min(1, Math.max(0, dyn.presence.x / RING_DONE)));
	if (drawn < 0.002) return;
	ctx.save();
	ctx.globalAlpha = 1 - 0.45 * dyn.hush.x;
	ctx.lineWidth = 2 + 0.9 * dyn.swell;
	ctx.lineCap = "round";
	ctx.strokeStyle = ringSheen(ctx, dyn, colors);
	ctx.beginPath();
	ctx.arc(0, 0, RING_RADIUS, TOP, TOP + TAU * drawn);
	ctx.stroke();
	ctx.restore();
	paintComet(ctx, dyn, colors);
}

/**
 * Draw the rings of light that left the circle, widening and fading.
 * @param ctx The canvas.
 * @param dyn The state.
 * @param colors The colours.
 */
function paintPulses(ctx: CanvasRenderingContext2D, dyn: OrbDynamics, colors: OrbColors): void {
	ctx.save();
	ctx.lineWidth = 1.25;
	for (const age of dyn.pulses) {
		ctx.strokeStyle = rgba(colors.hi, 0.55 * (1 - age) ** 2);
		ctx.beginPath();
		ctx.arc(0, 0, RING_RADIUS + 1.5 + easeOut(age) * (PAD - 2.5), 0, TAU);
		ctx.stroke();
	}
	ctx.restore();
}

/**
 * Draw one frame of the orb.
 * @param ctx The canvas, scaled so that one unit is one CSS pixel.
 * @param dyn The state.
 * @param colors The colours.
 */
function paintOrb(ctx: CanvasRenderingContext2D, dyn: OrbDynamics, colors: OrbColors): void {
	ctx.clearRect(0, 0, SIZE, SIZE);
	ctx.save();
	ctx.translate(CENTER, CENTER);
	paintPulses(ctx, dyn, colors);
	paintRows(ctx, dyn, colors);
	paintDish(ctx, dyn, colors);
	paintBloom(ctx, dyn, colors);
	paintRing(ctx, dyn, colors);
	ctx.restore();
}

export { SIZE, paintOrb };

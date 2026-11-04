// Archboard's own architecture, painted live by the product's painter (ADR 0071) on canvases that
// the drafting table reads as its textures. The painter brings the picture in part by part, runs its
// traffic, and lights the card under the lamp with its lines and the cards at their other ends. The
// table stands each card up as a tile as it arrives, and lifts the card the lamp rests on.
//
// A table in perspective needs many more pixels near the eye than far away, so the picture is
// painted at several scales at once: the first canvas holds all of it, and each further canvas holds
// a smaller part, nearer the eye, at a finer scale. The table says which part each one holds.

import { PICTURE_ENTRY_PHASES, PICTURE_MS, PICTURE_TRANSITION_PHASES } from "@archboard/timing";
import { startPainter } from "../../../packages/renderer/src/ui/clients/painter.ts";
import own from "../paintings/own.json";
import paintingUrl from "../paintings/own.painting.json?url";

/** Each canvas's size in pixels: the whole picture, then the finer parts near the eye. */
const LEVELS = [
	{ width: 2560, height: Math.round((2560 * own.height) / own.width) },
	{ width: 2048, height: 1152 },
	{ width: 2048, height: 1152 },
] as const;

/** How long the picture takes to arrive on the table: the product's entry, slowed for a first look. */
const ENTRY_MS = PICTURE_MS.entry * 2.5;

/** How long a card under the lamp takes to light, and the rest to dim. */
const FOCUS_MS = 420;

/** How long the lamp rests on a card before it lights: a pointer passing over lights nothing. */
const DWELL_MS = 180;

/** How quickly a card lifts toward the lamp or settles back, per second. */
const LIFT_RATE = 9;

/** At which points of a move each of its parts happens, as the painter reads them. */
const PHASES = JSON.stringify({
	transition: PICTURE_TRANSITION_PHASES,
	entry: PICTURE_ENTRY_PHASES,
	enter: ENTRY_MS,
	exit: PICTURE_MS.exit,
	shutter: PICTURE_MS.shutter,
});

/** A part of the picture: its left, top, right and bottom edges, 0..1 across and down it. */
export type Region = readonly [number, number, number, number];

/** One canvas of the picture, and the part of the picture it holds. */
export interface TableLevel {
	readonly canvas: HTMLCanvasElement;
	readonly region: Region;
}

/** The picture on the table, as the shader reads it. */
export interface TableDrawing {
	/** The canvases, the whole picture first. */
	readonly levels: readonly TableLevel[];
	/** The picture's width over its depth. */
	readonly aspect: number;
	/** Each card's box, 0..1 across and down the picture. */
	readonly cards: readonly Region[];
	/** How round a card's corners are, as a share of the picture's width. */
	readonly corner: number;
	/**
	 * Paint a part of the picture on a canvas after the first. The part grows to the canvas's
	 * shape, from its left and its bottom, which lies nearest the eye.
	 * @param level Which canvas.
	 * @param region The part.
	 * @param now The page's clock, in milliseconds.
	 */
	aim(level: number, region: Region, now: number): void;
	/**
	 * Draw the moment on every canvas whose picture looks different from the last one drawn.
	 * @param now The page's clock, in milliseconds.
	 * @returns For each canvas, whether it holds a new frame.
	 */
	frame(now: number): readonly boolean[];
	/**
	 * Light the card the lamp rests on, or nothing.
	 * @param point Where the lamp stands, 0..1 across and down the picture, or null when no
	 * pointer holds it.
	 * @param now The page's clock, in milliseconds.
	 */
	focus(point: { x: number; y: number } | null, now: number): void;
	/**
	 * How each card stands at a moment: two numbers a card, how far it rose from the table as it
	 * arrived, 0 to 1, and how far the lamp lifted it, 0 to 1.
	 * @param now The page's clock, in milliseconds.
	 * @returns The numbers, in the order of the cards.
	 */
	pose(now: number): Float32Array;
}

/** A card of the picture. */
type Card = (typeof own.cards)[number];

/**
 * The card under a point of the picture.
 * @param x Units from the picture's left.
 * @param y Units from its top.
 * @returns The card, or undefined.
 */
function cardAt(x: number, y: number): Card | undefined {
	return own.cards.find(
		({ box: [left = 0, top = 0, width = 0, height = 0] }) =>
			x >= left && x <= left + width && y >= top && y <= top + height,
	);
}

/**
 * A part of the picture grown to a canvas's shape, from its left and its bottom.
 * @param region The part.
 * @param canvas The canvas.
 * @returns The grown part.
 */
function shaped(region: Region, canvas: HTMLCanvasElement): Region {
	const [left, top, right, bottom] = region;
	const across = (right - left) * own.width;
	const down = (bottom - top) * own.height;
	const shape = canvas.width / canvas.height;
	return across / down < shape
		? [left, top, left + (down * shape) / own.width, bottom]
		: [left, bottom - across / shape / own.height, right, bottom];
}

/**
 * Start painting the table's picture. The CPU painter cannot draw a picture this size beside the
 * shader at its frame rate, so it draws the whole picture once, as it is asked for no motion.
 * @param still Whether the page asks for no motion: the picture is simply there, with no traffic.
 * @returns The drawing, or null when no painter starts or the painting does not read.
 */
export async function paintTable(still: boolean): Promise<TableDrawing | null> {
	try {
		const painting = fetch(paintingUrl).then((answer) => answer.text());
		const canvas = (size: (typeof LEVELS)[number]): HTMLCanvasElement => {
			const made = document.createElement("canvas");
			made.width = size.width;
			made.height = size.height;
			return made;
		};
		const first = await startPainter(canvas(LEVELS[0]), true);
		const cpu = first.kind === "cpu";
		const calm = still || cpu;
		const rest = cpu
			? []
			: await Promise.all(LEVELS.slice(1).map((size) => startPainter(canvas(size), true)));
		const drawn = await painting;
		const now = performance.now();
		const levels = [first, ...rest].map(({ painter, canvas: held }) => {
			painter.setPhases(PHASES);
			painter.setLongestStep(PICTURE_MS.longestStep);
			painter.resize(held.width, held.height);
			painter.setFarLine(0, 0);
			painter.setTrafficShown(!calm);
			if (calm) painter.show(drawn);
			else painter.enter(drawn, "null", ENTRY_MS, 0, 0, now);
			return { painter, canvas: held, region: [0, 0, 1, 1] as Region, moving: true };
		});
		/**
		 * Paint a part of the picture on a canvas.
		 * @param level The canvas.
		 * @param region The part, in the canvas's shape.
		 * @param at The page's clock.
		 */
		const view = (level: (typeof levels)[number], region: Region, at: number): void => {
			const [left, top, right] = region;
			const scale = level.canvas.width / ((right - left) * own.width);
			level.painter.setCamera(-left * own.width * scale, -top * own.height * scale, scale, 0, at);
			level.region = region;
			level.moving = true;
		};
		for (const level of levels) view(level, shaped([0, 0, 1, 1], level.canvas), now);

		let lit: string | undefined;
		let under: { card: Card | undefined; since: number } | undefined;
		// The cards nearest the middle of the picture arrive first, as the painter brings them in.
		const apart = own.cards.map(({ box: [x = 0, y = 0, w = 0, h = 0] }) =>
			Math.hypot(x + w / 2 - own.width / 2, y + h / 2 - own.height / 2),
		);
		const farthest = Math.max(1, ...apart);
		const { cardsStart, cardsStartBy, cardSpan } = PICTURE_ENTRY_PHASES;
		const starts = apart.map(
			(distance) =>
				now + ENTRY_MS * (cardsStart + (cardsStartBy - cardsStart) * (distance / farthest)),
		);
		const pose = new Float32Array(own.cards.length * 2);
		let posed: number | undefined;
		return {
			levels,
			aspect: own.width / own.height,
			cards: own.cards.map(({ box: [x = 0, y = 0, w = 0, h = 0] }) => [
				x / own.width,
				y / own.height,
				(x + w) / own.width,
				(y + h) / own.height,
			]),
			corner: own.corner / own.width,
			aim(index, region, at) {
				const level = levels[index];
				if (!level) return;
				const next = shaped(region, level.canvas);
				if (next.every((edge, side) => Math.abs(edge - (level.region[side] ?? 0)) < 0.002)) return;
				view(level, next, at);
			},
			frame(at) {
				return levels.map((level) => {
					if (!level.moving) return false;
					level.moving = level.painter.frame(at);
					return true;
				});
			},
			focus(point, at) {
				const card = point ? cardAt(point.x * own.width, point.y * own.height) : undefined;
				if (card?.id !== under?.card?.id) under = { card, since: at };
				if (card?.id === lit || (card && at - (under?.since ?? at) < DWELL_MS)) return;
				lit = card?.id;
				const subjects = card ? [card.id, ...card.lines, ...card.ends] : [];
				const light = JSON.stringify({
					rest: card ? 0.5 : 1,
					labels: card ? 0.12 : 1,
					subjects: Object.fromEntries(subjects.map((id) => [id, { opacity: 1, delay: 0 }])),
					duration: calm ? 0 : FOCUS_MS,
				});
				const marks = JSON.stringify({ selected: card ? [card.id] : [], whole: card?.lines ?? [] });
				for (const level of levels) {
					level.painter.setLight(light, at);
					level.painter.setMarks(marks);
					level.moving = true;
				}
			},
			pose(at) {
				const step = calm ? 1 : 1 - Math.exp(-((at - (posed ?? at)) / 1000) * LIFT_RATE);
				posed = at;
				own.cards.forEach((card, index) => {
					const arrived = calm
						? 1
						: Math.min(1, Math.max(0, (at - (starts[index] ?? now)) / (ENTRY_MS * cardSpan)));
					pose[index * 2] = 1 - (1 - arrived) ** 3;
					const held = pose[index * 2 + 1] ?? 0;
					pose[index * 2 + 1] = held + ((card.id === lit ? 1 : 0) - held) * step;
				});
				return pose;
			},
		};
	} catch (cause) {
		console.warn("The table's drawing did not start.", cause);
		return null;
	}
}

// What a stage says to its painter, in the forms the painter reads, and what it
// keeps for a painter that starts late.

import type { startPainter } from "@archboard/renderer/browser";
import { PICTURE_ENTRY_PHASES, PICTURE_MS, PICTURE_TRANSITION_PHASES } from "@archboard/timing";
import type { Departure } from "#ui/architecture-drawing/canvas/picture/transitions/clients/picture-departure.ts";
import type { DiveWay } from "#ui/architecture-drawing/canvas/picture/transitions/clients/picture-dive.ts";
import type { SemanticBox } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";

/** Where the camera puts the picture, in the surface's own pixels. */
interface StageCamera {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
}

/** What is marked on the picture, each by its subject's id. */
interface StageMarks {
	readonly selected: ReadonlySet<string>;
	readonly whole: ReadonlySet<string>;
	/** Whether a selected line goes without its ring. */
}

/** A distance, in the surface's own pixels or the picture's units. */
interface StageShift {
	readonly x: number;
	readonly y: number;
}

/** A flight between a model and the model inside its card. */
interface StageDive {
	readonly way: DiveWay;
	readonly card: string;
	readonly frame: SemanticBox;
}

/** How the picture stands in the light, in the form the painter reads. */
interface StageLight {
	readonly rest: number;
	readonly labels: number;
	readonly subjects: Readonly<Record<string, { readonly opacity: number; readonly delay: number }>>;
	readonly duration: number;
}

/** What the stage holds for a painter that has not started or is replaced. */
interface Held {
	painting: string | undefined;
	camera: StageCamera;
	/** The camera's scale where the far view begins, and how long a swap takes. */
	farLine: { readonly scale: number; readonly ms: number };
	/** Whether the next picture is on its way. */
	awaited: boolean;
	marks: StageMarks;
	light: StageLight | null;
	trafficShown: boolean;
	heads: Readonly<Record<string, number>>;
	warned: ReadonlySet<string>;
}

/**
 * Where a picture is going, as the painter reads it.
 * @param heading Where the reader went, if somewhere.
 * @returns The JSON.
 */
function headingJson(heading: Departure | null): string {
	return JSON.stringify(
		heading === null
			? null
			: { way: heading.way, toward: heading.toward, side: heading.side ?? null },
	);
}

/** At which points of a move each of its parts happens, as the painter reads them. */
const PHASES = JSON.stringify({
	transition: PICTURE_TRANSITION_PHASES,
	entry: PICTURE_ENTRY_PHASES,
	enter: PICTURE_MS.entry,
	exit: PICTURE_MS.exit,
	shutter: PICTURE_MS.shutter,
});

/**
 * The marks as the painter reads them.
 * @param marks The marks.
 * @returns JSON.
 */
function marksJson(marks: StageMarks): string {
	return JSON.stringify({
		selected: [...marks.selected],
		whole: [...marks.whole],
	});
}

/**
 * Size a canvas to its box, in device pixels.
 * @param canvas The canvas.
 * @returns Whether its size changed.
 */
function sizeCanvas(canvas: HTMLCanvasElement): boolean {
	const ratio = window.devicePixelRatio || 1;
	const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
	const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
	if (canvas.width === width && canvas.height === height) return false;
	canvas.width = width;
	canvas.height = height;
	return true;
}

/** A painter at work, as the renderer starts one. */
type StartedPainter = Awaited<ReturnType<typeof startPainter>>;

/** Why a canvas's GPU painter stopped at work, and what comes next. */
type PainterFailure = NonNullable<Parameters<typeof startPainter>[2]>;

/** How a painter takes a picture. */
type PictureHand = (painter: StartedPainter["painter"], painting: string) => void;

/**
 * Keep a painter's size to its canvas.
 * @param started The painter at work.
 */
function fitPainter(started: StartedPainter): void {
	if (sizeCanvas(started.canvas)) {
		started.painter.resize(started.canvas.width, started.canvas.height);
	}
}

export {
	fitPainter,
	headingJson,
	marksJson,
	sizeCanvas,
	type Held,
	type PictureHand,
	type StageCamera,
	type StageDive,
	type StageLight,
	type StageMarks,
	type StageShift,
	type PainterFailure,
	type StartedPainter,
};

/**
 * Hand a painter the current presentation and picture.
 * @param painter The painter.
 * @param held What the page holds.
 * @param arrive How a first picture enters, if its ink still waits.
 * @param dark Whether the page is dark.
 * @param now The clock's time.
 */
export function briefPainter(
	painter: StartedPainter["painter"],
	held: Held,
	arrive: PictureHand | null,
	dark: boolean,
	now: number,
): void {
	const { camera, farLine, awaited, marks, light, painting, trafficShown, heads, warned } = held;
	painter.setPhases(PHASES);
	painter.setLongestStep(PICTURE_MS.longestStep);
	painter.setTheme(dark);
	painter.setTrafficShown(trafficShown);
	painter.setHeads(JSON.stringify(heads));
	painter.setWarnings(JSON.stringify([...warned]));
	painter.setCamera(camera.x, camera.y, camera.scale, 0, now);
	painter.setFarLine(farLine.scale, farLine.ms);
	painter.setAwaited(awaited, 0, now);
	painter.setMarks(marksJson(marks));
	if (light !== null) painter.setLight(JSON.stringify(light), now);
	if (painting === undefined) painter.clear();
	else if (arrive === null) painter.show(painting);
	else arrive(painter, painting);
}

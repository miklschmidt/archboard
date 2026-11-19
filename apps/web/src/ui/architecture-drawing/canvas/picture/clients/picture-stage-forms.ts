// What a stage says to its painter, in the forms the painter reads, and what it
// keeps for a painter that starts late.

import type { startPainter } from "@archboard/renderer/browser";
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

/** Where the reader went from a picture, as the painter reads it. */
interface StageHeading {
	readonly way: Departure["way"];
	readonly toward: Departure["toward"];
	readonly side: NonNullable<Departure["side"]> | null;
}

/** A value that changes over a time, from a moment of the frame clock. */
interface StageTimed<T> {
	readonly to: T;
	readonly ms: number;
	readonly at: number;
}

/** What the page says about how the picture is seen: each value it states replaces the last. */
interface StagePresentation {
	readonly theme?: "light" | "dark";
	readonly trafficShown?: boolean;
	readonly heads?: Readonly<Record<string, number>>;
	readonly warnings?: readonly string[];
	readonly marks?: { readonly selected: readonly string[]; readonly whole: readonly string[] };
	/** The subject whose control the pointer rests on, or null for none. */
	readonly hovered?: { readonly toggle: string | null };
	readonly camera?: StageTimed<StageCamera>;
	readonly farLine?: Held["farLine"];
	readonly awaited?: StageTimed<boolean>;
	readonly light?: StageLight & { readonly at: number };
	/** Lines drawn on as they light; no delays take the last sweep away. */
	readonly sweep?: {
		readonly delays: Readonly<Record<string, number>>;
		readonly shortestMs: number;
		readonly longestMs: number;
		readonly at: number;
	};
}

/** How a picture comes onto the stage. */
type StageArrival =
	| { readonly kind: "cut" }
	| { readonly kind: "carried"; readonly shift: readonly [number, number]; readonly ms: number }
	| {
			readonly kind: "entered";
			readonly heading: StageHeading | null;
			readonly ms: number;
			readonly moved: readonly [number, number];
			readonly at: number;
	  }
	| ({ readonly kind: "into"; readonly ms: number; readonly at: number } & StageDive);

/** What becomes of the picture on the stage. */
type StageDeparture =
	| {
			readonly kind: "leaving";
			readonly heading: StageHeading;
			readonly ms: number;
			readonly at: number;
	  }
	| { readonly kind: "stayed" | "cleared" | "outOfCard" };

/**
 * Where a picture is going, as the painter reads it.
 * @param heading Where the reader went.
 * @returns The heading.
 */
function headingOf(heading: Departure): StageHeading {
	return { way: heading.way, toward: heading.toward, side: heading.side ?? null };
}

/**
 * The marks as the painter reads them.
 * @param marks The marks.
 * @returns The marks, as lists.
 */
function marksOf(marks: StageMarks): NonNullable<StagePresentation["marks"]> {
	return { selected: [...marks.selected], whole: [...marks.whole] };
}

/**
 * Tell a painter how the picture is seen.
 * @param painter The painter.
 * @param said What changed.
 */
function present(painter: StartedPainter["painter"], said: StagePresentation): void {
	painter.present(JSON.stringify(said));
}

/**
 * Bring a picture onto a painter's stage.
 * @param painter The painter.
 * @param painting The picture's painting.
 * @param arrival How it arrives.
 */
function arrive(painter: StartedPainter["painter"], painting: string, arrival: StageArrival): void {
	painter.arrive(painting, JSON.stringify(arrival));
}

/**
 * Say what becomes of the picture on a painter's stage.
 * @param painter The painter.
 * @param departure What becomes of it.
 */
function depart(painter: StartedPainter["painter"], departure: StageDeparture): void {
	painter.depart(JSON.stringify(departure));
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
	arrive,
	depart,
	fitPainter,
	headingOf,
	marksOf,
	present,
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
 * @param hand How a first picture enters, if its ink still waits.
 * @param dark Whether the page is dark.
 * @param now The clock's time.
 */
export function briefPainter(
	painter: StartedPainter["painter"],
	held: Held,
	hand: PictureHand | null,
	dark: boolean,
	now: number,
): void {
	const { camera, farLine, awaited, marks, light, painting, trafficShown, heads, warned } = held;
	present(painter, {
		theme: dark ? "dark" : "light",
		trafficShown,
		heads,
		warnings: [...warned],
		marks: marksOf(marks),
		camera: { to: camera, ms: 0, at: now },
		farLine,
		awaited: { to: awaited, ms: 0, at: now },
		...(light === null ? {} : { light: { ...light, at: now } }),
	});
	if (painting === undefined) depart(painter, { kind: "cleared" });
	else if (hand === null) arrive(painter, painting, { kind: "cut" });
	else hand(painter, painting);
}

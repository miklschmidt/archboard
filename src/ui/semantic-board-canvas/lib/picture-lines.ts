// Carrying a connection's line from its old route to its new one, and drawing
// a new line on.
//
// A line is drawn as a few paths with different jobs: the stroke, the halo
// under it that lights when it is selected, and — in a proposal — a swipe of
// the standing's colour under both. They are paired by job, not by position,
// because a proposal's line has a swipe in front of the others and a plain
// line has none, and pairing by position would carry the old halo into the new
// swipe and leave the new stroke with nothing to come from. Every path is
// morphed along the route; a path whose look changed — a stroke that took a
// standing's colour and arrowhead — has its old self borrowed and morphed
// beside it, the two cross-fading. A swipe that appears or disappears morphs
// with the stroke, fading in or out. A line only the new picture has is drawn
// from its start to its end, its arrowhead appearing once it is nearly there.

import { PICTURE_TRANSITION_PHASES } from "@/shared/timing/timing";
import { morphPath, pathLength } from "@/ui/semantic-board-canvas/lib/path-morph";
import {
	drawnPaths,
	easeInOut,
	easeOut,
	emphasised,
	phase,
	setOpacity,
	type Updater,
} from "@/ui/semantic-board-canvas/lib/picture-motion";
import { cloneElement, type SubjectGroup } from "@/ui/semantic-board-canvas/lib/picture-pairing";

/** How much of an arrival is spent fading in before the rest is drawing on. */
const ARRIVE_FADE_SHARE = 0.25;

/** What one path of a line is for. */
type PathJob = "halo" | "stroke" | "swipe";

/** The paths of one line, by job. */
type LinePaths = Partial<Record<PathJob, SVGPathElement>>;

/**
 * Sort a line's paths by job: the halo carries its class, the stroke is drawn
 * last, and whatever is drawn before both is the swipe.
 * @param group The line's group.
 * @returns Its paths, by job.
 */
function linePaths(group: Element): LinePaths {
	const paths = drawnPaths(group);
	const halo = paths.find((path) => path.classList.contains("ab-halo"));
	const inked = paths.filter((path) => !path.classList.contains("ab-halo"));
	const stroke = inked.at(-1);
	const swipe = inked.length > 1 ? inked[0] : undefined;
	return {
		...(halo === undefined ? {} : { halo }),
		...(stroke === undefined ? {} : { stroke }),
		...(swipe === undefined ? {} : { swipe }),
	};
}

/**
 * Park what would draw wrongly while a line is in flight: the crossing mask,
 * which cuts gaps where the route used to cross others, and the traffic
 * pulses, which ride a path of their own. Both come back with the finished
 * picture.
 * @param group The line's group.
 */
function parkLineDressing(group: Element): void {
	group.removeAttribute("mask");
	for (const pulse of group.querySelectorAll<SVGElement>(".ab-pulse")) {
		pulse.style.opacity = "0";
	}
}

/**
 * How a path looks, apart from its route.
 * @param path The path.
 * @returns Its attributes other than `d`, in one string.
 */
function pathLook(path: Element): string {
	return path
		.getAttributeNames()
		.filter((name) => name !== "d")
		.toSorted()
		.map((name) => `${name}=${path.getAttribute(name) ?? ""}`)
		.join(" ");
}

/**
 * The step that morphs one path from a route to its own: none when the two
 * are the same route, or when the route cannot be carried.
 * @param path The path.
 * @param from The route to leave.
 * @returns The step, as a list of at most one.
 */
function morphSteps(path: SVGPathElement, from: string): Updater[] {
	const { moveStart, moveEnd } = PICTURE_TRANSITION_PHASES;
	const to = path.getAttribute("d") ?? "";
	const morph = from === to ? null : morphPath(from, to);
	if (morph === null) {
		return [];
	}
	return [
		(progress: number): void => {
			path.setAttribute("d", morph(emphasised(phase(progress, moveStart, moveEnd))));
		},
	];
}

/**
 * The step that fades a path in or out over the cross-fade window.
 * @param path The path.
 * @param arriving True to fade in, false to fade out.
 * @returns The step.
 */
function fadeStep(path: SVGPathElement, arriving: boolean): Updater {
	const { fadeStart, fadeEnd } = PICTURE_TRANSITION_PHASES;
	return (progress: number): void => {
		const swapped = easeInOut(phase(progress, fadeStart, fadeEnd));
		path.style.opacity = String(arriving ? swapped : 1 - swapped);
	};
}

/**
 * Borrow an old path into the new line, drawn under the path it gives way to,
 * to be morphed along the route and faded out.
 * @param old The path in the last picture.
 * @param before The new path it is drawn under.
 * @param to The route it morphs to.
 * @returns The steps that carry and fade it.
 */
function borrowPath(old: SVGPathElement, before: Element, to: string): Updater[] {
	const clone = cloneElement(old);
	before.before(clone);
	if (!(clone instanceof SVGPathElement)) {
		return [];
	}
	const from = clone.getAttribute("d") ?? "";
	clone.setAttribute("d", to);
	return [...morphSteps(clone, from), fadeStep(clone, false)];
}

/**
 * The steps that carry one job's path across.
 *
 * A path with a counterpart morphs from it, and cross-fades with a borrowed
 * copy of it when its look changed. A path with none — a swipe a standing
 * brought — morphs from the old stroke's route and fades in.
 * @param path The path in the next picture.
 * @param previous The same job's path in the last picture, if any.
 * @param fallback The old stroke's route, for a path with no counterpart.
 * @returns The steps.
 */
function carryPath(
	path: SVGPathElement,
	previous: SVGPathElement | undefined,
	fallback: string,
): Updater[] {
	if (previous === undefined) {
		return [...morphSteps(path, fallback), fadeStep(path, true)];
	}
	const steps = morphSteps(path, previous.getAttribute("d") ?? "");
	if (pathLook(previous) === pathLook(path)) {
		return steps;
	}
	const to = path.getAttribute("d") ?? "";
	return [...steps, fadeStep(path, true), ...borrowPath(previous, path, to)];
}

/** The routes of a line's stroke in the two pictures. */
interface Routes {
	readonly old: string;
	readonly next: string;
}

/**
 * The steps for one job of a line: carried across when the new line has it,
 * borrowed and seen off along the new route when only the old line had it.
 * @param job Which path.
 * @param old The old line's paths.
 * @param next The new line's paths.
 * @param routes The stroke's routes.
 * @returns The steps.
 */
function jobSteps(job: PathJob, old: LinePaths, next: LinePaths, routes: Routes): Updater[] {
	const path = next[job];
	const previous = old[job];
	if (path !== undefined) {
		return carryPath(path, previous, routes.old);
	}
	if (previous === undefined || next.stroke === undefined) {
		return [];
	}
	return borrowPath(previous, next.stroke, routes.next);
}

/**
 * The route a path draws, or nothing when there is no path.
 * @param path The path, if any.
 * @returns Its `d`, or an empty string.
 */
function routeOf(path: SVGPathElement | undefined): string {
	return path?.getAttribute("d") ?? "";
}

/**
 * The steps for the halo, which only ever morphs: its opacity is the
 * selection's to set.
 * @param old The old line's paths.
 * @param next The new line's paths.
 * @param routes The stroke's routes.
 * @returns The steps.
 */
function haloSteps(old: LinePaths, next: LinePaths, routes: Routes): Updater[] {
	if (next.halo === undefined) {
		return [];
	}
	return morphSteps(next.halo, old.halo === undefined ? routes.old : routeOf(old.halo));
}

/**
 * Carry a line from its old route to its new one.
 * @param before The line in the last picture.
 * @param after The line in the next.
 * @returns The step, or null when nothing about the line changed.
 */
function carryLine(before: SubjectGroup, after: SubjectGroup): Updater | null {
	const old = linePaths(before.element);
	const next = linePaths(after.element);
	const routes: Routes = { old: routeOf(old.stroke), next: routeOf(next.stroke) };
	const steps = [
		...haloSteps(old, next, routes),
		...jobSteps("swipe", old, next, routes),
		...jobSteps("stroke", old, next, routes),
	];
	if (steps.length === 0) {
		return null;
	}
	parkLineDressing(after.element);
	return (progress: number): void => {
		for (const step of steps) {
			step(progress);
		}
	};
}

/** A path being drawn on, and the arrowheads it shows once nearly there. */
interface Stroke {
	readonly path: SVGPathElement;
	readonly length: number;
	readonly markers: readonly { readonly name: string; readonly value: string }[];
}

/**
 * Take a path's arrowheads off for now, remembering them.
 * @param path The path.
 * @returns The arrowheads it had.
 */
function takeMarkers(path: SVGPathElement): Stroke["markers"] {
	return ["marker-start", "marker-end"].flatMap((name) => {
		const value = path.getAttribute(name);
		if (value === null) {
			return [];
		}
		path.removeAttribute(name);
		return [{ name, value }];
	});
}

/**
 * Prepare a path to be drawn on from its start: one dash as long as the line,
 * pulled back all the way, with its arrowheads taken off for now.
 *
 * A dashed line keeps its dashes and simply fades in: drawing it on would mean
 * taking its dash away.
 * @param path The path.
 * @returns The stroke, or null when it is not one to draw on.
 */
function prepareStroke(path: SVGPathElement): Stroke | null {
	const length = path.hasAttribute("stroke-dasharray")
		? null
		: pathLength(path.getAttribute("d") ?? "");
	if (length === null) {
		return null;
	}
	const markers = takeMarkers(path);
	path.setAttribute("stroke-dasharray", String(length));
	return { path, length, markers };
}

/**
 * Draw one stroke this far on, and give its arrowheads back once nearly there.
 * @param stroke The stroke.
 * @param arrived How far through the arrival, 0 to 1.
 */
function drawStroke(stroke: Stroke, arrived: number): void {
	const { path, length, markers } = stroke;
	path.setAttribute("stroke-dashoffset", String(length * (1 - emphasised(arrived))));
	if (arrived >= PICTURE_TRANSITION_PHASES.arrowheadAt) {
		for (const { name, value } of markers) {
			path.setAttribute(name, value);
		}
	}
}

/**
 * Let a line only the new picture has arrive by being drawn on.
 * @param group The line's group.
 * @returns The step.
 */
function drawOn(group: SubjectGroup): Updater {
	const { enterStart } = PICTURE_TRANSITION_PHASES;
	const strokes = drawnPaths(group.element).flatMap((path) => prepareStroke(path) ?? []);
	return (progress: number): void => {
		const arrived = phase(progress, enterStart, 1);
		setOpacity(group.element, easeOut(phase(arrived, 0, ARRIVE_FADE_SHARE)));
		for (const stroke of strokes) {
			drawStroke(stroke, arrived);
		}
	};
}

export { carryLine, drawOn };

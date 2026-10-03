// A picture's traffic, run by the page as Web Animations.
//
// The renderer draws traffic as SMIL, so an exported file moves with nothing
// around it. In the page SMIL is too dear: Chrome restyles the picture once for
// every animated element on every frame, which kept an idle board at about one
// core (TASK-385.01). Even a stopped SMIL element costs, because it is restyled
// with the element it animates on every frame that element moves. So the page
// takes each SMIL element out of the picture before it ever runs, keeps its
// markup in an attribute of the element it animated, and runs the same motion
// from there as a Web Animation, which a browser can run off its main thread. A
// copy of the picture carries the attribute, so it can run its traffic again.
//
// Only the one form the renderer writes is run this way: a bar of light sliding
// along its frame (`animateTransform`, translating). Anything else is left to
// SMIL, which still moves it: a picture never stands still for want of a
// translation, it only costs more.

import { PICTURE_CLOCK } from "@/ui/frame-clock";

/** The SMIL elements a picture can carry. */
const SMIL = "animateTransform";

/** Where an element keeps the SMIL markup of the traffic it runs. */
const MOTION_ATTRIBUTE = "data-traffic-motion";

const SVG_NS = "http://www.w3.org/2000/svg";

/** What SMIL can say that a Web Animation is not told here: such an element stays SMIL. */
const UNREAD = ["href", "xlink:href", "by", "additive", "accumulate", "min", "max", "end", "fill"];

/** One motion, as a Web Animation states it. */
interface Motion {
	readonly keyframes: Keyframe[];
	readonly timing: KeyframeAnimationOptions;
}

/**
 * A SMIL clock value as milliseconds: `8s`, `0.016s`, `250ms` or a bare count of seconds.
 * @param value The clock value.
 * @returns The milliseconds, or null for a form this does not read.
 */
function millisecondsOf(value: string): number | null {
	const match = /^\s*(\d+(?:\.\d+)?)(ms|s)?\s*$/u.exec(value);
	if (match === null) return null;
	return Number(match[1]) * (match[2] === "ms" ? 1 : 1000);
}

/**
 * When a SMIL element begins.
 * @param smil The element.
 * @returns The milliseconds, or null for a form this does not read.
 */
function beginOf(smil: Element): number | null {
	return millisecondsOf(smil.getAttribute("begin") ?? "0s");
}

/**
 * How long one run of a SMIL animation takes. An absent `dur` is indefinite,
 * which no Web Animation spells the same way.
 * @param smil The element.
 * @returns The milliseconds, or null for a form this does not read.
 */
function durationOf(smil: Element): number | null {
	const dur = smil.getAttribute("dur");
	return dur === null ? null : millisecondsOf(dur);
}

/**
 * How many times a SMIL animation runs: once, or on and on.
 * @param value Its `repeatCount`, or null.
 * @returns The iterations, or null for a form this does not read.
 */
function iterationsOf(value: string | null): number | null {
	if (value === null) return 1;
	return value === "indefinite" ? Number.POSITIVE_INFINITY : null;
}

/**
 * A `;`-separated SMIL list.
 * @param value The list, or null.
 * @returns Its entries, or null when it is absent.
 */
function listOf(value: string | null): string[] | null {
	return value === null ? null : value.split(";").map((entry) => entry.trim());
}

/**
 * The timing every form shares: when it starts, how long it runs and how often.
 * @param smil The element.
 * @returns The timing, or null for a form this does not read.
 */
function timingOf(smil: Element): KeyframeAnimationOptions | null {
	const delay = beginOf(smil);
	const duration = durationOf(smil);
	const iterations = iterationsOf(smil.getAttribute("repeatCount"));
	if (delay === null || duration === null || iterations === null) return null;
	return { delay, duration, iterations, easing: "linear" };
}

/**
 * The values a motion moves through: its list, or from one to the other.
 * @param smil The element.
 * @returns The values, or null when it states neither.
 */
function valuesOf(smil: Element): string[] | null {
	const listed = listOf(smil.getAttribute("values"));
	if (listed !== null) return listed;
	const from = smil.getAttribute("from");
	const to = smil.getAttribute("to");
	return from === null || to === null ? null : [from, to];
}

/**
 * One translation as a keyframe: SMIL spells it `x y`, CSS `translate(x, y)`.
 * @param value The translation.
 * @returns The keyframe.
 */
function translation(value: string): Keyframe {
	const [x = "0", y = "0"] = value.trim().split(/[\s,]+/u);
	return { transform: `translate(${Number(x)}px, ${Number(y)}px)` };
}

/**
 * A motion through a list of values, at the key times SMIL gave them.
 * @param values The values.
 * @param smil The element, for its key times.
 * @param timing The timing.
 * @returns The motion, or null when the key times do not match the values.
 */
function motionOver(
	values: readonly string[],
	smil: Element,
	timing: KeyframeAnimationOptions,
): Motion | null {
	const times = listOf(smil.getAttribute("keyTimes"));
	if (times !== null && times.length !== values.length) return null;
	const keyframes = values.map((value, index) =>
		times === null ? translation(value) : { ...translation(value), offset: Number(times[index]) },
	);
	return { keyframes, timing };
}

/**
 * Whether a SMIL element says only what a Web Animation is told here.
 * @param smil The element.
 * @returns True when it does.
 */
function readable(smil: Element): boolean {
	const linear = (smil.getAttribute("calcMode") ?? "linear") === "linear";
	const translating = smil.getAttribute("type") === "translate";
	return (
		linear &&
		translating &&
		smil.children.length === 0 &&
		!UNREAD.some((name) => smil.hasAttribute(name))
	);
}

/**
 * What one SMIL element does, as a Web Animation.
 * @param smil The element.
 * @returns The motion, or null for a form this does not read.
 */
function motionOf(smil: Element): Motion | null {
	if (!readable(smil)) return null;
	const values = valuesOf(smil);
	const timing = timingOf(smil);
	return values === null || timing === null ? null : motionOver(values, smil, timing);
}

/**
 * Take the SMIL out of markup, keeping each element's in an attribute of the
 * element it animates. An element whose SMIL says what is not read here keeps
 * it, and SMIL runs it.
 * @param markup The markup.
 */
function keepTraffic(markup: Element): void {
	for (const smil of markup.querySelectorAll(SMIL)) {
		const target = smil.parentElement;
		if (target === null || motionOf(smil) === null) continue;
		target.setAttribute(
			MOTION_ATTRIBUTE,
			(target.getAttribute(MOTION_ATTRIBUTE) ?? "") + smil.outerHTML,
		);
		smil.remove();
	}
}

/**
 * The motions an element keeps, read back from its SMIL markup.
 * @param element The element.
 * @param scratch An element of the picture's kind, away from the page, to read the markup in.
 * @returns The motions.
 */
function keptMotions(element: Element, scratch: Element): Motion[] {
	scratch.innerHTML = element.getAttribute(MOTION_ATTRIBUTE) ?? "";
	return [...scratch.children].flatMap((smil) => motionOf(smil) ?? []);
}

/**
 * Run the traffic of markup the page has just made, as Web Animations. Call it
 * once for each new piece of markup, before or as it goes into the page: a
 * picture put up, a copy of one, a group borrowed into another. Running it
 * twice over the same elements runs their traffic twice.
 * @param markup The markup: a picture, or part of one.
 * @param seconds Where on its picture's clock the traffic starts.
 */
function runTraffic(markup: Element, seconds: number): void {
	// Where nothing can run a Web Animation, the picture keeps its SMIL.
	if (typeof markup.animate !== "function") return;
	keepTraffic(markup);
	const scratch = markup.ownerDocument.createElementNS(SVG_NS, "g");
	const kept = markup.querySelectorAll(`[${MOTION_ATTRIBUTE}]`);
	for (const element of markup.matches(`[${MOTION_ATTRIBUTE}]`) ? [markup, ...kept] : kept) {
		for (const { keyframes, timing } of keptMotions(element, scratch)) {
			const animation = element.animate(keyframes, { ...timing, id: PICTURE_CLOCK });
			animation.currentTime = seconds * 1000;
		}
	}
}

export { runTraffic };

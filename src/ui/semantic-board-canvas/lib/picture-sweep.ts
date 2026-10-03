// A relationship lighting up: drawn on from its source to its target.
//
// When the picture lights what a part is wired to, each relationship it lights
// is drawn on once, along its route and in its own direction, so which way it
// runs reads before the eye finds the arrowhead. The sweep is a copy of the
// line laid over the picture for as long as it takes and taken away when it
// ends. The picture itself is not touched, and nothing is left behind when
// another picture replaces it.
//
// These are the browser's own animations, on the document's timeline, so a
// stepped clock stands them wherever it says they are (ADR 0041).

import { EXPLORING_MS } from "@/shared/timing/timing";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The class the layer of sweeping lines carries, and the one thing that tells it from the renderer's groups. */
const SWEEP_CLASS = "ab-sweep";

/** How much wider than its line a sweep is drawn, in the picture's units. */
const SWEEP_EXTRA_WIDTH = 1.4;

/** How fast a sweep runs along its line, in the picture's units a millisecond. */
const SWEEP_SPEED = 2.4;

/** The curve a line is drawn on along: off quickly, settling slowly, like the camera's own moves. */
const DRAW_EASING = "cubic-bezier(0.2, 0, 0, 1)";

/** How much of a sweep's time is spent drawing the line on; the rest is the line settling back to its own weight. */
const DRAWING_SHARE = 0.65;

/**
 * The lines of a picture that draw a relationship, by relationship.
 * @param root The picture's root.
 * @param ids The subjects to look for; those that are not relationships are passed over.
 * @returns The drawn line of each relationship that has one.
 */
function linesOf(root: SVGElement, ids: ReadonlySet<string>): SVGPathElement[] {
	const lines: SVGPathElement[] = [];
	for (const group of root.querySelectorAll(":scope > g[data-semantic-kind='edge']")) {
		const id = group.getAttribute("data-semantic-id");
		if (id === null || !ids.has(id)) continue;
		for (const path of group.querySelectorAll(":scope > path:not(.ab-halo)")) {
			if (path instanceof SVGPathElement) lines.push(path);
		}
	}
	return lines;
}

/**
 * How long a sweep of a line takes, the settling back to its own weight included.
 * @param line The line.
 * @returns Its length over the sweep's speed, between the shortest and the longest a sweep may take.
 */
function durationOf(line: SVGPathElement): number {
	const length = typeof line.getTotalLength === "function" ? line.getTotalLength() : 0;
	const drawing = Math.min(
		EXPLORING_MS.sweepLongest,
		Math.max(EXPLORING_MS.sweepShortest, length / SWEEP_SPEED),
	);
	return drawing / DRAWING_SHARE;
}

/**
 * The keyframes of a sweep: the line is drawn on at a heavier weight, then
 * settles to its own weight and fades into the line under it, so nothing pops
 * when the copy is taken away.
 * @param own The line's own stroke width.
 * @returns The keyframes.
 */
function keyframesOf(own: number): Keyframe[] {
	const heavy = own + SWEEP_EXTRA_WIDTH;
	return [
		{ offset: 0, strokeDashoffset: 1, strokeWidth: heavy, opacity: 1, easing: DRAW_EASING },
		{
			offset: DRAWING_SHARE,
			strokeDashoffset: 0,
			strokeWidth: heavy,
			opacity: 1,
			easing: "ease-out",
		},
		{ offset: 1, strokeDashoffset: 0, strokeWidth: own, opacity: 0 },
	];
}

/**
 * A copy of a line that is drawn on from its start, by its dash.
 * @param line The line.
 * @returns The copy, hidden until its animation runs.
 */
function copyOf(line: SVGPathElement): SVGPathElement {
	const copy = document.createElementNS(SVG_NS, "path");
	for (const { name, value } of line.attributes) copy.setAttribute(name, value);
	copy.removeAttribute("marker-end");
	copy.removeAttribute("marker-start");
	copy.setAttribute("pathLength", "1");
	copy.style.strokeDasharray = "1 1";
	copy.style.strokeDashoffset = "1";
	copy.style.strokeLinecap = "round";
	copy.setAttribute("pointer-events", "none");
	return copy;
}

/**
 * Take a sweep's copy of a line away, once it has settled into the line under it.
 * @param copy The copy.
 */
function removeOnFinish(copy: SVGPathElement): void {
	copy.remove();
}

/** Nothing to do when a sweep is cancelled: there is no one waiting for it to finish. */
function ignoreCancel(): void {}

/**
 * Draw on, once, every relationship among the subjects a picture lights.
 * @param root The picture's root.
 * @param lit The subjects the picture lights.
 * @returns Stop the sweep and take it away.
 */
function sweepLines(root: SVGElement, lit: ReadonlySet<string>): () => void {
	const lines = linesOf(root, lit);
	if (lines.length === 0 || typeof lines[0]?.animate !== "function") {
		return () => undefined;
	}
	const layer = document.createElementNS(SVG_NS, "g");
	layer.setAttribute("class", SWEEP_CLASS);
	layer.setAttribute("pointer-events", "none");
	// Above the lines and below the cards and the labels, which are drawn after the first card.
	root.insertBefore(layer, root.querySelector(":scope > g[data-semantic-kind='node']"));
	const animations = lines.map((line) => {
		const copy = copyOf(line);
		layer.append(copy);
		const own = Number.parseFloat(line.getAttribute("stroke-width") ?? "");
		const drawn = copy.animate(keyframesOf(Number.isFinite(own) ? own : 1.2), {
			duration: durationOf(line),
			fill: "forwards",
		});
		drawn.addEventListener("finish", () => removeOnFinish(copy));
		// A sweep taken away early is cancelled, which a browser answers quietly and a lighter DOM does not.
		drawn.finished.catch(ignoreCancel);
		return drawn;
	});
	return (): void => {
		for (const animation of animations) animation.cancel();
		layer.remove();
	};
}

export { sweepLines };

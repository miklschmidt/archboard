// Reading colours as the browser computes them, for owners that compare them.

import type { AgentBrowserSession } from "./agent-browser.ts";

/**
 * A page function, `opaque`, that spells a computed colour as the opaque sRGB a
 * reader sees it in, whatever space the page's token is written in: a picture
 * paints with the page's own tokens (TASK-346), which a browser may compute as
 * `oklch()` or `color(srgb …)`.
 */
const OPAQUE_SRGB =
	`const opaque = (css) => {` +
	` const context = new OffscreenCanvas(1, 1).getContext("2d");` +
	` context.fillStyle = "rgb(from " + css + " r g b / 1)";` +
	` context.fillRect(0, 0, 1, 1);` +
	` const [r, g, b] = context.getImageData(0, 0, 1, 1).data;` +
	` return "rgb(" + r + ", " + g + ", " + b + ")"; };`;

/**
 * What the browser actually paints one relationship with: the ink of the line,
 * of the band behind it, of the arrowhead it references, and of its dots.
 *
 * Computed styles and a resolved marker, not attributes, because the question
 * is what a person sees — an attribute a stylesheet overrode would pass a
 * reading of the markup and fail the reader — each spelt as opaque sRGB.
 * @param browser The page.
 * @param surface The selector of the element the picture is in.
 * @param id The relationship's semantic id.
 * @returns The four inks, each as the browser resolves it.
 */
const edgeInks = (
	browser: AgentBrowserSession,
	surface: string,
	id: string,
): Promise<{ line: string; band: string; head: string; streams: string[] }> =>
	browser.eval(
		`(() => {` +
			OPAQUE_SRGB +
			` const group = document.querySelector("${surface} [data-semantic-id='${id}']");` +
			` const paths = [...group.querySelectorAll(":scope > path")];` +
			` const line = paths.find((path) => path.getAttribute("marker-end") !== null);` +
			` const band = paths.find((path) => path !== line && !path.classList.contains("ab-halo") && !path.classList.contains("ab-pulse"));` +
			` const marker = "#" + line.getAttribute("marker-end").slice(5, -1);` +
			` const head = document.querySelector(marker + " path");` +
			` return {` +
			`  line: opaque(getComputedStyle(line).stroke),` +
			`  band: opaque(getComputedStyle(band).stroke),` +
			`  head: opaque(getComputedStyle(head).fill === "none"` +
			`   ? getComputedStyle(head).stroke : getComputedStyle(head).fill),` +
			`  streams: [...document.querySelectorAll("${surface} [data-traffic='${id}'] .ab-pulse")].map((comet) => [...new Set(` +
			`   [...comet.querySelectorAll("path:not([data-pulse-part='moat'])")].map((path) => opaque(getComputedStyle(path).stroke)))].join("|")),` +
			` }; })()`,
	);

/**
 * Every paint in a picture that the browser could not resolve.
 *
 * A picture paints with the page's tokens and `color-mix()`es of them, from
 * each element's `style` (TASK-346). An expression the page cannot resolve
 * does not fail loudly: the property falls back to its initial value, a black
 * fill or stop, or no stroke at all. So every fill, stroke and gradient stop
 * the picture declares — lines, arrowheads, the comets its traffic moves and the
 * stops their tails fade through — is read back as the browser computed it.
 * A mask's shapes are not paint: they are black or white by design, saying
 * where a line's ink is hidden, and are left out.
 * @param browser The page.
 * @param surface The selector of the element the picture is in.
 * @returns What fell back, one line each; empty when everything resolved.
 */
const unresolvedPaints = (browser: AgentBrowserSession, surface: string): Promise<string[]> =>
	browser.eval<string[]>(
		`[...document.querySelectorAll("${surface} svg [style]:not(mask *)")].flatMap((element) => {` +
			` const computed = getComputedStyle(element);` +
			` const declared = (name) => element.style.getPropertyValue(name);` +
			` return ["fill", "stroke", "stop-color"]` +
			`  .filter((name) => declared(name) !== "" && declared(name) !== "none")` +
			`  .filter((name) => ["none", "rgb(0, 0, 0)"].includes(computed.getPropertyValue(name)))` +
			`  .map((name) => element.tagName + " " + name + ": " + declared(name)); })`,
	);

/**
 * The hue of a colour the browser computed, such as \`rgb(12, 34, 56)\`.
 * @param css The computed colour.
 * @returns Its hue, in degrees.
 */
function computedHue(css: string): number {
	const [r, g, b] = (css.match(/[\d.]+/gu) ?? []).slice(0, 3).map((value) => Number(value) / 255);
	const [red, green, blue] = [r ?? 0, g ?? 0, b ?? 0];
	const max = Math.max(red, green, blue);
	const delta = max - Math.min(red, green, blue);
	if (delta === 0) return 0;
	const sector =
		max === red
			? ((green - blue) / delta) % 6
			: max === green
				? (blue - red) / delta + 2
				: (red - green) / delta + 4;
	return (sector * 60 + 360) % 360;
}

/**
 * Whether two computed colours share a hue: one colour drawn at two strengths.
 * @param a One colour, as the browser computes it.
 * @param b The other.
 * @returns True when their hues lie within a few degrees.
 */
function sameHue(a: string, b: string): boolean {
	return Math.abs(computedHue(a) - computedHue(b)) < 6;
}

export { OPAQUE_SRGB, edgeInks, sameHue, unresolvedPaints };

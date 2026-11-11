// Reading a picture's paints as the browser computes them.

import type { AgentBrowserSession } from "./agent-browser.ts";

/**
 * Every paint in a picture that the browser could not resolve.
 *
 * A picture paints with the page's tokens and `color-mix()`es of them, from
 * each element's `style` (TASK-346). An expression the page cannot resolve
 * does not fail loudly: the property falls back to its initial value, a black
 * fill or stop, or no stroke at all. So every fill, stroke and gradient stop
 * the picture declares — lines, arrowheads and the pulses its traffic moves — is
 * read back as the browser computed it.
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

export { unresolvedPaints };

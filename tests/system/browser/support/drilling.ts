// Reading a board a level down, in a real browser.
//
// The selectors and the gestures the drilling owners share: what the pane is
// drawing, what a person picks out, how they follow a link down and how they
// choose a way of reading what they find. Nothing here asserts anything — each
// owner says what it is about — and nothing reaches past the page, because a
// person has only the page.

import { pollUntil, type AgentBrowserSession, type PollOptions } from "./agent-browser.ts";

/** How long any one thing in these owners is waited for. */
const WAIT: PollOptions = { timeoutMs: 10_000 };

/** The stage one semantic pane draws into. */
const STAGE = "[data-slot='semantic-board-stage']";

/** The element the camera moves, which the drawn subjects sit in. */
const SURFACE = "[data-slot='semantic-board-surface']";

/** The stage's tab stop: what hears the keys, and what a click retargets to. */
const VIEWPORT = "[data-slot='semantic-board-viewport']";

/** The strip that says an agent has the board (ADR 0022). */
const BANNER = "[data-slot='claim-banner']";

/** The control that follows the picked node's link down a level. */
const DRILL_OPEN = "[data-slot='semantic-drill-down-open']";

/**
 * Which of the pane's states is on screen.
 * @param browser The page.
 * @returns The `data-state`, or null before the pane is there.
 */
const stageState = (browser: AgentBrowserSession): Promise<string | null> =>
	browser.eval<string | null>(
		`document.querySelector("${STAGE}")?.getAttribute("data-state") ?? null`,
	);

/**
 * Which board the pane is drawing.
 * @param browser The page.
 * @returns The board name, or null before the pane is there.
 */
const shownBoard = (browser: AgentBrowserSession): Promise<string | null> =>
	browser.eval<string | null>(
		`document.querySelector("${STAGE}")?.getAttribute("data-board") ?? null`,
	);

/**
 * What one element of the pane is saying.
 * @param browser The page.
 * @param selector Which element.
 * @returns Its text, or an empty string when it is not there.
 */
const textOf = (browser: AgentBrowserSession, selector: string): Promise<string> =>
	browser.eval<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);

/**
 * Pick a subject out of the diagram the way a person does: the whole pointer
 * sequence, because a browser retargets a click to whichever element holds the
 * pointer and a bare synthetic click on the card would pass where a real one
 * picked nothing.
 * @param browser The page.
 * @param id The semantic id to pick.
 * @returns Settles once the click has been delivered.
 */
const pick = (browser: AgentBrowserSession, id: string): Promise<unknown> =>
	browser.eval(
		`(() => {` +
			` const card = document.querySelector("${SURFACE} [data-semantic-id='" + ${JSON.stringify(id)} + "']");` +
			` const view = document.querySelector("${VIEWPORT}");` +
			` const at = card.getBoundingClientRect();` +
			` const where = { pointerId: 1, isPrimary: true, button: 0, bubbles: true,` +
			`   clientX: Math.round(at.x + at.width / 2), clientY: Math.round(at.y + at.height / 2) };` +
			` card.dispatchEvent(new PointerEvent("pointerdown", where));` +
			` view.dispatchEvent(new PointerEvent("pointerup", where));` +
			` view.dispatchEvent(new MouseEvent("click", where)); })()`,
	);

/**
 * Press a control of the pane.
 * @param browser The page.
 * @param selector Which control.
 * @returns Settles once the click has been delivered.
 */
const press = (browser: AgentBrowserSession, selector: string): Promise<unknown> =>
	browser.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);

/**
 * The semantic id of the drawn subject whose label ends in this name.
 * @param browser The page.
 * @param name The node's name.
 * @returns The id, or null when nothing on screen is called that.
 */
const drawnId = (browser: AgentBrowserSession, name: string): Promise<string | null> =>
	browser.eval<string | null>(
		`(() => {` +
			` for (const group of document.querySelectorAll("${SURFACE} [data-semantic-id]")) {` +
			`   if (group.textContent.trim().endsWith(${JSON.stringify(name)})) return group.dataset.semanticId; }` +
			` return null; })()`,
	);

/**
 * The address, without its leading mark.
 * @param browser The page.
 * @returns The search.
 */
const addressSearch = (browser: AgentBrowserSession): Promise<string> =>
	browser.eval<string>("window.location.search.replace(/^\\?/, '')");

/**
 * Choose one of the ways of reading what is on screen.
 * @param browser The page.
 * @param name The view's name, as the bar spells it.
 * @returns The view's id, once it has been chosen.
 */
async function readThrough(browser: AgentBrowserSession, name: string): Promise<string> {
	const id = await pollUntil(
		() =>
			browser.eval<string | null>(
				`(() => {` +
					` for (const one of document.querySelectorAll("[data-slot='semantic-view-choice']")) {` +
					`   if (one.textContent.trim() === ${JSON.stringify(name)}) return one.dataset.semanticView; }` +
					` return null; })()`,
			),
		(found) => found !== null && found !== "",
		`the way of reading called "${name}" to be offered`,
		WAIT,
	);
	await press(browser, `[data-slot='semantic-view-choice'][data-semantic-view='${id}']`);
	return id ?? "";
}

export {
	BANNER,
	DRILL_OPEN,
	STAGE,
	SURFACE,
	VIEWPORT,
	WAIT,
	addressSearch,
	drawnId,
	pick,
	press,
	readThrough,
	shownBoard,
	stageState,
	textOf,
};

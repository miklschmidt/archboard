// Browser-side selectors for the rebuilt shell, semantics first: roles,
// accessible names, aria state, shadcn's data-slot vocabulary, and the small
// set of Archboard identity hooks (data-board-key, data-pane-id,
// data-notice-id, data-presentation). Every owner reads the shell through
// these so a markup change is one edit here, never a class-name hunt.

import type { AgentBrowserSession } from "./agent-browser.ts";

type PageEvaluator = Pick<AgentBrowserSession, "eval">;

/** The element the browser presents fullscreen: the centre stage. */
const STAGE_ROOT = '[data-slot="pane-stages"]';
/** The breadcrumb in the header of the pane with focus: the boards above, the board, then the variant. */
const BOARD_BREADCRUMB = 'section[aria-current="true"] nav[aria-label="Where this board sits"]';
/** One pane's section, by its accessible name. */
const paneSection = (label: string): string => `section[aria-label=${JSON.stringify(label)}]`;
/** Every pane section. */
const PANE_SECTIONS = 'section[aria-label^="Pane "]';
/** A pane's top row: where its board sits, the ways to read it and the pane's controls. */
const PANE_HEADER = '[data-slot="pane-header"]';
/** The pane letters in the pane headers, present while two panes are open. */
const PANE_LETTERS = '[data-slot="pane-header"] [data-slot="pane-letter"]';
/** The navigator's top row, level with every pane header: the brand, Settings and the theme. */
const BRAND_BAR = '[data-slot="brand-bar"]';
/** The agent at the foot of the navigator: its state, its voice and the key to the conversation. */
const AGENT_DOCK = 'section[data-slot="agent-dock"]';
/** The navigator: the filter, the boards and where agents are working. */
const NAVIGATOR = '[data-slot="navigator"]';
/** The navigator's whole column: the brand bar, the navigator and the agent dock. */
const NAVIGATOR_COLUMN = '[data-slot="navigator-column"]';
/** The conversation between the navigator and the panes, present while it is open. */
const AGENT_PANEL = '[data-slot="agent-panel"]';
/** The composer at the foot of the conversation. */
const COMPOSER = 'textarea[aria-label="Message the agent"]';
/** The dock's key that opens and closes the conversation. */
const CONVERSATION_TOGGLE =
	'button[aria-label="Open the conversation"], button[aria-label="Close the conversation"]';
/** One notice, by its title. */
const noticeByTitle = (title: string): string => `(() => {
	const titles = [...document.querySelectorAll('[data-slot="alert"] [data-slot="alert-title"]')];
	const match = titles.find(node => node.textContent.trim() === ${JSON.stringify(title)});
	return match ? match.closest('[data-slot="alert"]') : null;
})()`;
/** The persistent notice stack: alerts that are not inside a dialog. */
const SHELL_NOTICES = `[...document.querySelectorAll('[data-slot="alert"]')]
	.filter(node => !node.closest('[role="dialog"], [role="alertdialog"]'))`;
/** The presented pane's bar, present only during a presentation. */
const PRESENTATION_BAR = '[data-slot="presentation-bar"]';
/** The claim banner across one stage. */
const CLAIM_BANNER = '[data-slot="claim-banner"]';

/** A navigator row's name by the board key it selects (identity hook); a click on it opens the row. */
const navigatorRow = (key: string): string =>
	`${NAVIGATOR} [data-board-key=${JSON.stringify(key)}]`;

/** A button by exact accessible name, searched within an optional scope. */
const buttonNamed = (name: string, scope = "document"): string => `(() => {
	const root = ${scope};
	if (!root) return null;
	const wanted = ${JSON.stringify(name)};
	return [...root.querySelectorAll('button, a[role="button"]')].find(node =>
		(node.getAttribute('aria-label') ?? node.textContent ?? '').trim() === wanted) ?? null;
})()`;

/** The board name the header of the pane with focus shows. */
const BOARD_NAME_EXPRESSION = `document.querySelector('${BOARD_BREADCRUMB} [data-slot="pane-board-name"]')?.textContent?.trim() ?? null`;

/** The theme the root element carries. */
const THEME_EXPRESSION = "document.documentElement.getAttribute('data-theme') ?? ''";

/**
 * The board named in the header.
 * @param browser The page.
 * @returns The board name, or null before a board is shown.
 */
function boardName(browser: PageEvaluator): Promise<string | null> {
	return browser.eval<string | null>(BOARD_NAME_EXPRESSION);
}

/**
 * The theme on the root element.
 * @param browser The page.
 * @returns `light`, `dark`, or an empty string before the shell applies one.
 */
function currentTheme(browser: PageEvaluator): Promise<string> {
	return browser.eval<string>(THEME_EXPRESSION);
}

/**
 * Switch the theme through the header toggle and wait for the root to carry it.
 * @param browser The page.
 * @param theme The theme wanted.
 */
async function switchTheme(browser: AgentBrowserSession, theme: "light" | "dark"): Promise<void> {
	if ((await currentTheme(browser)) === theme) {
		return;
	}
	// Keyboard, not pointer: a pointer press would stop script focus from showing a ring.
	await browser.eval<boolean>(
		`(() => { const toggle = document.querySelector('button[aria-label="Switch to ${theme} theme"]'); if (!toggle) return false; toggle.focus(); return true; })()`,
	);
	await browser.run(["press", "Enter"]);
	const deadline = Date.now() + 5_000;
	while ((await currentTheme(browser)) !== theme) {
		if (Date.now() > deadline) {
			throw new Error(`the ${theme} theme did not apply`);
		}
		await Bun.sleep(50);
	}
}

/**
 * Click a navigator row by board key.
 * @param browser The page.
 * @param key The board key.
 * @returns True when the row existed and was clicked.
 */
function clickNavigatorRow(browser: PageEvaluator, key: string): Promise<boolean> {
	return browser.eval<boolean>(`(() => {
		const row = document.querySelector(${JSON.stringify(navigatorRow(key))});
		if (!row) return false;
		row.click();
		return true;
	})()`);
}

/**
 * Dismiss a notice by title.
 * @param browser The page.
 * @param title The notice title.
 * @returns True when the notice existed and its dismiss control was clicked.
 */
function dismissNotice(browser: PageEvaluator, title: string): Promise<boolean> {
	return browser.eval<boolean>(`(() => {
		const notice = ${noticeByTitle(title)};
		const dismiss = notice?.querySelector('button[aria-label^="Dismiss notice"]');
		if (!dismiss) return false;
		dismiss.click();
		return true;
	})()`);
}

/**
 * Dismiss the first shell notice, whatever its title.
 * @param browser The page.
 * @returns True when a notice was dismissed.
 */
function dismissFirstNotice(browser: PageEvaluator): Promise<boolean> {
	return browser.eval<boolean>(`(() => {
		const dismiss = ${SHELL_NOTICES}[0]?.querySelector('button[aria-label^="Dismiss notice"]');
		if (!dismiss) return false;
		dismiss.click();
		return true;
	})()`);
}

/** One shell notice as an owner reads it. */
interface ShellNoticeView {
	title: string;
	description: string;
	/** Visible action labels: buttons and links, in order. */
	actions: string[];
	/** Hrefs of link actions, in order. */
	links: string[];
	role: string | null;
}

/**
 * Every persistent shell notice, top to bottom.
 * @param browser The page.
 * @returns The notices.
 */
function shellNotices(browser: PageEvaluator): Promise<ShellNoticeView[]> {
	return browser.eval<ShellNoticeView[]>(`${SHELL_NOTICES}.map(node => ({
		title: node.querySelector('[data-slot="alert-title"]')?.textContent?.trim() ?? '',
		description: node.querySelector('[data-slot="alert-description"]')?.textContent?.trim() ?? '',
		actions: [...node.querySelectorAll('[data-slot="alert-action"] button, [data-slot="alert-action"] a')]
			.map(action => (action.getAttribute('aria-label') ?? action.textContent ?? '').trim()),
		links: [...node.querySelectorAll('[data-slot="alert-action"] a')].map(link => link.href),
		role: node.getAttribute('role'),
	}))`);
}

/**
 * Whether the stage is the fullscreen element.
 * @param browser The page.
 * @returns True while a pane is presented.
 */
function stageIsFullscreen(browser: PageEvaluator): Promise<boolean> {
	return browser.eval<boolean>(
		`document.fullscreenElement !== null && document.fullscreenElement === document.querySelector('${STAGE_ROOT}')`,
	);
}

export {
	AGENT_DOCK,
	AGENT_PANEL,
	BOARD_BREADCRUMB,
	BOARD_NAME_EXPRESSION,
	BRAND_BAR,
	CLAIM_BANNER,
	COMPOSER,
	CONVERSATION_TOGGLE,
	NAVIGATOR,
	NAVIGATOR_COLUMN,
	PANE_HEADER,
	PANE_LETTERS,
	PANE_SECTIONS,
	PRESENTATION_BAR,
	SHELL_NOTICES,
	STAGE_ROOT,
	THEME_EXPRESSION,
	boardName,
	buttonNamed,
	clickNavigatorRow,
	currentTheme,
	dismissFirstNotice,
	dismissNotice,
	navigatorRow,
	noticeByTitle,
	paneSection,
	shellNotices,
	stageIsFullscreen,
	switchTheme,
	type ShellNoticeView,
};

/**
 * Press the header's Settings button, which opens the opener settings.
 * @param browser The page.
 */
async function pressSettings(browser: AgentBrowserSession): Promise<void> {
	await browser.run(["find", "role", "button", "click", "--name", "Settings", "--exact"]);
}

/**
 * Open the conversation panel through its toggle, when it is closed.
 * @param browser The page.
 */
async function openConversation(browser: AgentBrowserSession): Promise<void> {
	await browser.eval<boolean>(`(() => {
		if (document.querySelector('${AGENT_PANEL}')) return true;
		const toggle = document.querySelector('button[aria-label="Open the conversation"]');
		toggle?.click();
		return toggle !== null;
	})()`);
}

export { openConversation, pressSettings };

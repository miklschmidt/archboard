// Browser-side selectors for the rebuilt shell, semantics first: roles,
// accessible names, aria state, shadcn's data-slot vocabulary, and the small
// set of Archboard identity hooks (data-board-key, data-pane-id,
// data-notice-id, data-presentation). Every owner reads the shell through
// these so a markup change is one edit here, never a class-name hunt.

import type { AgentBrowserSession } from "./agent-browser.ts";

type PageEvaluator = Pick<AgentBrowserSession, "eval">;

/** The element the browser presents fullscreen: the centre stage. */
const STAGE_ROOT = '[data-slot="canvas-stages"]';
/** The header's board breadcrumb; its first span is the board name. */
const BOARD_BREADCRUMB = 'nav[aria-label="Current board"]';
/** One pane's section, by its accessible name. */
const paneSection = (label: string): string => `section[aria-label=${JSON.stringify(label)}]`;
/** Every pane section. */
const PANE_SECTIONS = 'section[aria-label^="Pane "]';
/** The pane chooser and its tabs. */
const PANE_TABS = '[data-slot="toggle-group"][aria-label="Pane"] [data-slot="toggle-group-item"]';
/** The navigator sidebar. */
const NAVIGATOR = '[data-slot="sidebar"]';
/** The inspector column. */
const INSPECTOR = 'aside[aria-label="Inspector"]';
/** The workbench dock: the collapsible that carries the agent workbench. */
const DOCK_TOGGLE =
	'button[aria-label="Collapse workbench"], button[aria-label="Expand workbench"]';
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

/** A navigator row by the board key it selects (identity hook). */
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

/** The board name the header shows. */
const BOARD_NAME_EXPRESSION = `document.querySelector('${BOARD_BREADCRUMB} span')?.textContent?.trim() ?? null`;

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
	BOARD_BREADCRUMB,
	BOARD_NAME_EXPRESSION,
	CLAIM_BANNER,
	DOCK_TOGGLE,
	INSPECTOR,
	NAVIGATOR,
	PANE_SECTIONS,
	PANE_TABS,
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
 * Open one settings surface the way a person does: the header's settings
 * menu, then its item once the menu is open.
 * @param browser The page.
 * @param label The menu item's words.
 */
async function openSettingsItem(browser: AgentBrowserSession, label: string): Promise<void> {
	await browser.run(["find", "role", "button", "click", "--name", "Settings", "--exact"]);
	const deadline = Date.now() + 5_000;
	while (
		!(await browser.eval<boolean>(
			`[...document.querySelectorAll('[role="menu"] [role="menuitem"]')].some(node => node.textContent.trim() === ${JSON.stringify(label)})`,
		))
	) {
		if (Date.now() > deadline) {
			throw new Error(`the settings menu did not offer ${label}`);
		}
		await Bun.sleep(50);
	}
	await browser.run(["find", "role", "menuitem", "click", "--name", label, "--exact"]);
}

export { openSettingsItem };

/**
 * Select a workbench tab by the start of its name; a tab's name may carry a
 * live count ("Approvals 2") that the test must not have to predict.
 * @param browser The page.
 * @param prefix The start of the tab's words.
 * @returns True when a tab matched and was clicked.
 */
function clickTab(browser: PageEvaluator, prefix: string): Promise<boolean> {
	return browser.eval<boolean>(`(() => {
		const tab = [...document.querySelectorAll('[role="tab"]')].find(node => node.textContent.trim().startsWith(${JSON.stringify(prefix)}));
		if (!tab) return false;
		tab.click();
		return true;
	})()`);
}

export { clickTab };

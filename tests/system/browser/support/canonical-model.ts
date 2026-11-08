import { openAbout, openDestination } from "./canonical-page.ts";
import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";

const WAIT = { timeoutMs: 6_000 } as const;

function fixtureGit(root: string, ...args: string[]): string {
	const result = Bun.spawnSync(["git", "-C", root, ...args], {
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

function initializeSource(root: string): void {
	fixtureGit(root, "init", "--quiet", "--initial-branch=main");
	fixtureGit(root, "config", "user.name", "Architecture reader");
	fixtureGit(root, "config", "user.email", "reader@example.test");
	fixtureGit(root, "remote", "add", "origin", "https://github.com/acme/shop.git");
}

/** Open the History dialog with every state's checkpoints on screen, as a reader's folds do. */
async function unfoldedHistory(browser: AgentBrowserSession): Promise<void> {
	await openDestination(browser, "history").catch(() => undefined);
	await browser.eval(
		`document.querySelectorAll('[data-slot="model-history"] [aria-expanded="false"]').forEach((fold) => fold.click())`,
	);
}

/** Wait for the History dialog to go, as a choice in it closes it, so the page takes clicks again. */
async function historyClosed(browser: AgentBrowserSession): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-history-dialog"]') === null`,
			),
		Boolean,
		"the History dialog to close on the choice",
		WAIT,
	);
}

async function selectReading(browser: AgentBrowserSession, id: string): Promise<void> {
	const item = `[data-reading-id="${id}"]`;
	// A reading that settles draws the list again, and takes a click on it with it, so each
	// pass takes the one step that the page now allows.
	await pollUntil(
		async () => {
			const page = await browser.eval<{ reading: string | null; clickable: boolean }>(`(() => {
				const stage = document.querySelector('[data-slot="architecture-model-stage"]');
				const item = document.querySelector('${item}');
				const rect = item?.getBoundingClientRect();
				return {
					reading: stage?.getAttribute('aria-busy') === 'false' ? stage.getAttribute('data-reading') : null,
					clickable: rect !== undefined && rect.width > 0 && rect.height > 0 &&
						item.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
				};
			})()`);
			if (page.reading === id) return true;
			if (page.reading === null) return false;
			if (page.clickable) await browser.run(["click", item]).catch(() => undefined);
			else await unfoldedHistory(browser);
			return false;
		},
		Boolean,
		"the selected architecture reading",
		WAIT,
	);
	await historyClosed(browser);
}

/**
 * Compare the picture from the control beside it.
 * @param browser The page.
 * @param id The choice: `after`, `current`, or a state.
 */
async function selectComparison(browser: AgentBrowserSession, id: string): Promise<void> {
	const item = `[data-against-id="${id}"]`;
	const trigger = '[data-slot="model-comparison-selector"]';
	// A reading that settles can take a click with it, so each pass takes the step that is left.
	await pollUntil(
		async () => {
			const page = await browser.eval<{ open: boolean; clickable: boolean }>(`(() => {
				const item = document.querySelector('${item}');
				const rect = item?.getBoundingClientRect();
				return {
					open: document.querySelector('${trigger}')?.getAttribute('aria-expanded') === 'true',
					clickable: rect !== undefined && rect.height > 0 &&
						item.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
				};
			})()`);
			if (!page.open) await browser.run(["click", trigger]).catch(() => undefined);
			return page.clickable;
		},
		Boolean,
		"the comparison choice",
		WAIT,
	);
	await browser.run(["click", item]);
}

/**
 * Compare the picture with a saved checkpoint, from its row in the History dialog.
 * @param browser The page.
 * @param id The checkpoint.
 */
async function compareCheckpoint(browser: AgentBrowserSession, id: string): Promise<void> {
	const compare = `[data-reading-id="${id}"] [data-slot="model-compare"]`;
	await pollUntil(
		async () => {
			await unfoldedHistory(browser);
			return browser.eval<boolean>(`document.querySelector('${compare}') !== null`);
		},
		Boolean,
		"the checkpoint's Compare",
		WAIT,
	);
	await browser.run(["click", compare]);
	await historyClosed(browser);
}

/**
 * Select a module from the list on About and read its details there. A reading that settles
 * replaces the rows and drops the selection, so each pass takes the one step that is left.
 * @param browser The page.
 * @param id The module.
 * @param shows Whether the details hold what the caller waits for.
 * @param part A selector inside the details, to read that part alone.
 * @returns The text read.
 */
async function selectModule(
	browser: AgentBrowserSession,
	id: string,
	shows: (text: string) => boolean = (text) => text !== "",
	part = "",
): Promise<string> {
	return pollUntil(
		() =>
			browser.eval<string>(`(() => {
				const details = document.querySelector('[data-slot="module-details"][data-module-id="${id}"]');
				if (details === null) {
					document.querySelector('[data-slot="module-list"] [data-module-id="${id}"]')?.click();
					document.querySelector('[data-slot="model-about-subject"] [data-choice="selection"]')?.click();
				}
				return document.querySelector('[data-slot="module-details"][data-module-id="${id}"] ${part}')?.textContent ?? "";
			})()`),
		shows,
		`the details of ${id}`,
		WAIT,
	);
}

async function gatewayDetails(browser: AgentBrowserSession): Promise<string> {
	await openAbout(browser);
	return selectModule(browser, "Shop#Gateway");
}

async function selectState(browser: AgentBrowserSession, id: string): Promise<void> {
	await browser.run(["click", '[data-slot="model-reading-selector"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const item = document.querySelector('[data-state-id="${id}"]'); if (!item) return false; const r = item.getBoundingClientRect(); return r.height > 0 && item.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`,
			),
		Boolean,
		"the proposal state choice",
		WAIT,
	);
	await browser.run(["click", `[data-state-id="${id}"]`]);
	await historyClosed(browser);
	await openAbout(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-state-details"][data-selected-state="${id}"][data-lifecycle="draft"]') !== null`,
			),
		Boolean,
		"the explicit draft reading",
		WAIT,
	);
}

export {
	compareCheckpoint,
	historyClosed,
	fixtureGit,
	initializeSource,
	selectComparison,
	selectModule,
	selectReading,
	selectState,
	unfoldedHistory,
	gatewayDetails,
};

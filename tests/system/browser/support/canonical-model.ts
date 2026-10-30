import { openModelSidebar } from "./canonical-page.ts";
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

async function selectReading(browser: AgentBrowserSession, id: string): Promise<void> {
	const item = `[data-reading-id="${id}"]`;
	// A reading that settles closes the menu, and takes a click on it with it, so each pass
	// takes the one step that the page now allows.
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
			await browser
				.run(["click", page.clickable ? item : '[data-slot="model-reading-selector"]'])
				.catch(() => undefined);
			return false;
		},
		Boolean,
		"the selected architecture reading",
		WAIT,
	);
}

/**
 * Select a module from the sidebar list and read its details. A reading that settles replaces
 * the rows and drops the selection, so each pass activates the row while no details show.
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
				if (details === null) document.querySelector('[data-slot="module-list"] [data-module-id="${id}"]')?.click();
				return document.querySelector('[data-slot="module-details"][data-module-id="${id}"] ${part}')?.textContent ?? "";
			})()`),
		shows,
		`the details of ${id}`,
		WAIT,
	);
}

async function gatewayDetails(browser: AgentBrowserSession): Promise<string> {
	await openModelSidebar(browser);
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
	await openModelSidebar(browser);
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

export { fixtureGit, initializeSource, selectModule, selectReading, selectState, gatewayDetails };

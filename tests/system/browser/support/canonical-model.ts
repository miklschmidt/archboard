import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";

const WAIT = { timeoutMs: 6_000 } as const;

function fixtureGit(root: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", "-C", root, ...args], {
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function initializeSource(root: string): void {
	fixtureGit(root, "init", "--quiet", "--initial-branch=main");
	fixtureGit(root, "config", "user.name", "Architecture reader");
	fixtureGit(root, "config", "user.email", "reader@example.test");
	fixtureGit(root, "remote", "add", "origin", "https://github.com/acme/shop.git");
}

async function selectReading(browser: AgentBrowserSession, id: string): Promise<void> {
	await browser.run(["click", '[data-slot="model-reading-selector"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
			const item = document.querySelector('[data-reading-id="${id}"]');
			if (!item) return false;
			const rect = item.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0 &&
				item.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
		})()`),
		(available) => available,
		"the reading choice to become clickable",
		WAIT,
	);
	await browser.run(["click", `[data-reading-id="${id}"]`]);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="architecture-model-stage"]')?.getAttribute('data-reading') ?? null`,
			),
		(reading) => reading === id,
		"the selected architecture reading",
		WAIT,
	);
}

async function gatewayDetails(browser: AgentBrowserSession): Promise<string> {
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	return browser.eval<string>(`document.querySelector('[data-slot="module-details"]').textContent`);
}

export { fixtureGit, initializeSource, selectReading, gatewayDetails };

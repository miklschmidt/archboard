import { expect, test } from "bun:test";
import { join } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	browserTestRoots,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	serverTestEnvironment,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";
import { legacyHistory } from "./support/legacy-history.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function chooseOriginal(browser: AgentBrowserSession, id: string): Promise<void> {
	await browser.run(["click", '[data-slot="preview-reading-selector"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const option = document.querySelector('[data-preview-state="${id}"]'); if (!option) return false; const r = option.getBoundingClientRect(); return r.height > 0 && option.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`,
			),
		Boolean,
		"the original state choice",
		WAIT,
	);
	await browser.run(["click", `[data-preview-state="${id}"]`]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-preview-coverage="${id}"]') !== null`),
		Boolean,
		"the original state's explicit coverage",
		WAIT,
	);
}

test("original state selection keeps its retained checkpoint and one-board historical coverage", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = await legacyHistory(join(browserTestRoots().ownerRoot, "preview-history"));
	const server = await startOwnedServer({
		serverPath,
		vault: fixture.vault,
		env: serverTestEnvironment(),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run([
		"open",
		`${server.base}/?modelA=Shop&previewA=Shop&checkpointA=${fixture.checkpoint}`,
	]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="preview-reading-selector"]') !== null`,
			),
		Boolean,
		"original history choices",
		WAIT,
	);
	await chooseOriginal(browser, "Shop/System#Old");
	await pollUntil(
		() =>
			browser.eval<string[]>(
				`[...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(node => node.getAttribute('data-module-id'))`,
			),
		(ids) => ids.length === 1 && ids[0] === "Shop/System#Api",
		"the original API without current surroundings",
		WAIT,
	);
	expect(
		await browser.eval<string>(`new URLSearchParams(location.search).get('checkpointA')`),
	).toBe(fixture.checkpoint);
	expect(await browser.eval<string>(`new URLSearchParams(location.search).get('stateA')`)).toBe(
		"Shop/System#Old",
	);
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="preview-empty"]') === null`),
	).toBe(true);
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-preview-coverage="Shop/System#Old"]') !== null`,
			),
		Boolean,
		"the exact original address after reload",
		WAIT,
	);
	await chooseOriginal(browser, "Shop/Future#Draft");
	expect(
		await browser.eval<string>(`new URLSearchParams(location.search).get('checkpointA')`),
	).toBe(fixture.checkpoint);
	await browser.run(["back"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-preview-coverage="Shop/System#Old"]') !== null`,
			),
		Boolean,
		"Back to the original historical coverage",
		WAIT,
	);
}, 60_000);

async function openEvidence(browser: AgentBrowserSession): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="preview-state-evidence"]') !== null`,
			),
		Boolean,
		"the original state evidence",
		WAIT,
	);
	if (
		await browser.eval<boolean>(
			`!document.querySelector('[data-slot="preview-state-evidence"]').open`,
		)
	)
		await browser.run(["click", '[data-slot="preview-state-evidence"] summary']);
}

async function evidenceText(browser: AgentBrowserSession, slot: string): Promise<string> {
	return browser.eval<string>(`document.querySelector('[data-slot="${slot}"]').textContent`);
}

test("original history exposes lifecycle reasons, exact draft baselines, and unresolved standing", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = await legacyHistory(join(browserTestRoots().ownerRoot, "preview-standing"));
	const server = await startOwnedServer({
		serverPath,
		vault: fixture.vault,
		env: serverTestEnvironment(),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run([
		"open",
		`${server.base}/?modelA=Shop&previewA=Shop&checkpointA=${fixture.checkpoint}&stateA=Shop%2FSystem%23Old`,
	]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await openEvidence(browser);
	expect(await evidenceText(browser, "preview-corrections")).toContain(
		"The early API already served requests",
	);
	await chooseOriginal(browser, "Shop/System#Now");
	await openEvidence(browser);
	expect(await evidenceText(browser, "preview-adoptions")).toContain("The current API is built");
	await chooseOriginal(browser, "Shop/System#Shelf");
	await openEvidence(browser);
	expect(await evidenceText(browser, "preview-shelvings")).toContain(
		"Keep the smaller implementation",
	);
	await chooseOriginal(browser, "Shop/System#Draft");
	await openEvidence(browser);
	expect(await evidenceText(browser, "preview-predecessor")).toBe("Shop/System#Now");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="preview-baseline"]').getAttribute('data-baseline-kind')`,
		),
	).toBe("reconciliation-base");
	expect(await evidenceText(browser, "preview-issues")).toContain("Routes proposed requests");
	expect(await evidenceText(browser, "preview-issues")).toContain("Routes current requests");
	await chooseOriginal(browser, "Shop/System#Child");
	await openEvidence(browser);
	expect(await evidenceText(browser, "preview-blocked")).toContain("Shop/System#Draft");
	await chooseOriginal(browser, "Shop/Future#Draft");
	await openEvidence(browser);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="preview-baseline"]').getAttribute('data-baseline-kind')`,
		),
	).toBe("empty");
	expect(await browser.eval<string>(`new URLSearchParams(location.search).get('stateA')`)).toBe(
		"Shop/Future#Draft",
	);
}, 60_000);

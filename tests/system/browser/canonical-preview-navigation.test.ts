import { startModelWalkthrough } from "./support/canonical-page.ts";
import { expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	browserTestRoots,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	runServerCli,
	serverTestEnvironment,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { pickModelChoice as pick } from "./support/model-choice.ts";
import { serverPath } from "./support/navigator-support.ts";
import { legacyNavigation } from "./support/legacy-navigation.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function beat(browser: AgentBrowserSession, index: number, grammar: string): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
		const surface = document.querySelector('[data-slot="model-walkthrough"]');
		const heading = surface?.querySelector('[data-slot="semantic-presentation-heading"]');
		return heading != null && getComputedStyle(heading).opacity === '1' && surface?.getAttribute('data-grammar') === '${grammar}' && surface?.querySelector('[data-slot="semantic-presentation"]')?.getAttribute('data-step') === '${index}' && surface?.querySelector('[data-slot="model-diagram"] svg') !== null;
	})()`),
		Boolean,
		"the converted beat",
		WAIT,
	);
}

async function drawn(browser: AgentBrowserSession, scope: string): Promise<string[]> {
	return browser.eval<string[]>(
		`[...new Set([...document.querySelectorAll('${scope} [data-semantic-id]')].map(node => node.getAttribute('data-semantic-id')))]`,
	);
}

test("converted preview bookmarks and walkthroughs preserve exact original view membership", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = await legacyNavigation(join(browserTestRoots().ownerRoot, "preview-navigation"));
	const server = await startOwnedServer({
		serverPath,
		vault: fixture.vault,
		env: serverTestEnvironment(),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?modelA=Shop&previewA=Shop`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pick(
		browser,
		'[data-slot="preview-bookmark-selector"]',
		'[data-preview-bookmark="Shop/System#Storage"]',
	);
	await pollUntil(
		() => drawn(browser, '[data-slot="architecture-model-stage"]'),
		(ids) => ids.includes("Shop/System#Db"),
		"the storage bookmark",
		WAIT,
	);
	const bookmark = await drawn(browser, '[data-slot="architecture-model-stage"]');
	expect(bookmark).not.toContain("Shop/System#Api");
	expect(bookmark).not.toContain("Shop/System#Save");
	expect(bookmark).not.toContain("Shop/System#Extra");
	await browser.run(["reload"]);
	await pollUntil(
		() => browser.eval<string>(`new URLSearchParams(location.search).get('bookmarkA')`),
		(value) => value === "Shop/System#Storage",
		"the exact bookmark after reload",
		WAIT,
	);
	await startModelWalkthrough(browser, "Shop/System#Tour");
	await beat(browser, 0, "architecture");
	const entry = await drawn(browser, '[data-slot="model-walkthrough"]');
	expect(entry).toContain("Shop/System#Save");
	expect(entry).not.toContain("Shop/System#Extra");
	await browser.run(["click", '[data-slot="semantic-presentation-next"]']);
	await beat(browser, 1, "sequence");
	expect(await drawn(browser, '[data-slot="model-walkthrough"]')).toContain("Shop/System#Ask");
	await browser.run(["click", '[data-slot="semantic-presentation-next"]']);
	await beat(browser, 2, "architecture");
	expect(await drawn(browser, '[data-slot="model-walkthrough"]')).toContain("Shop/System#Extra");
	expect(readFileSync(join(fixture.vault, "Shop.semantic.json"), "utf8")).toBe(fixture.original);
}, 60_000);
test("a former address reopens exact retained original coverage and its walkthrough", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = await legacyNavigation(
		join(browserTestRoots().ownerRoot, "preview-retained-navigation"),
	);
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
	await pick(
		browser,
		'[data-slot="preview-address-selector"]',
		'[data-preview-address="Store@Before"]',
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-preview-coverage="Shop/System#Old"]') !== null`,
			),
		Boolean,
		"the exact former state",
		WAIT,
	);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(node => node.getAttribute('data-module-id'))`,
		),
	).toEqual(["Shop/System#Api"]);
	rmSync(join(fixture.vault, "Shop.semantic.json"));
	rmSync(join(fixture.vault, ".archboard/migration-plan.json"));
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-preview-coverage="Shop/System#Old"]') !== null`,
			),
		Boolean,
		"the retained former state without live originals",
		WAIT,
	);
	expect(
		await browser.eval<string>(`new URLSearchParams(location.search).get('checkpointA')`),
	).toBe(fixture.checkpoint);
	await startModelWalkthrough(browser, "Shop/System#OldTour");
	await beat(browser, 0, "architecture");
	expect(await drawn(browser, '[data-slot="model-walkthrough"]')).toContain("Shop/System#Api");
	expect(await drawn(browser, '[data-slot="model-walkthrough"]')).not.toContain("Shop/System#Db");
}, 60_000);

test("a converted reference preserves preview and paired original state and checkpoint", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = await legacyNavigation(
		join(browserTestRoots().ownerRoot, "preview-reference-navigation"),
	);
	const server = await startOwnedServer({
		serverPath,
		vault: fixture.vault,
		env: serverTestEnvironment(),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	runServerCli(server, ["repo", "add", fixture.root]);
	const browser = resources.use(await createAgentBrowser());
	await browser.run([
		"open",
		`${server.base}/?modelA=Shop&previewA=Shop&checkpointA=${fixture.checkpoint}&legacyAddressA=Store@Before`,
	]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop/System#Api"]') !== null`,
			),
		Boolean,
		"the original source module",
		WAIT,
	);
	rmSync(join(fixture.vault, "Shop.semantic.json"));
	rmSync(join(fixture.vault, ".archboard/migration-plan.json"));
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop/System#Api"]']);
	const action = '[data-slot="module-follow-reference"]';
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('${action}')?.matches(':enabled') === true`),
		Boolean,
		"the exact original reference",
		WAIT,
	);
	await browser.run(["scrollintoview", action]);
	await browser.run(["click", action]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-details"][data-module-id="Shop/System#Db"]') !== null`,
			),
		Boolean,
		"the original reference destination",
		WAIT,
	);
	const address = await browser.eval<Record<string, string>>(
		`Object.fromEntries(new URLSearchParams(location.search))`,
	);
	expect(address).toMatchObject({
		previewA: "Shop",
		stateA: "Shop/System#Now",
		checkpointA: fixture.checkpoint,
		subjectA: "Shop/System#Db",
	});
	expect(address["legacyAddressA"]).toBeUndefined();
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-preview-coverage="Shop/System#Now"]') !== null`,
		),
	).toBe(true);
}, 60_000);

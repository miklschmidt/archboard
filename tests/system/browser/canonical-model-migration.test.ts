import { expect, test } from "bun:test";
import { join } from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import type { ArchitectureModelRead, ArchitectureRecoveryResult } from "@archboard/board/model";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	browserTestRoots,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	serverTestEnvironment,
} from "./support/agent-browser.ts";
import { pickModelChoice as pick } from "./support/model-choice.ts";
import { serverPath } from "./support/navigator-support.ts";
import { installedNavigation, migrationNavigation } from "./support/migrated-navigation.ts";

const WAIT = { timeoutMs: 10_000 } as const;

test("installed bookmarks keep canonical authority and old addresses reopen exact originals", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = await installedNavigation(
		join(browserTestRoots().ownerRoot, "installed-navigation"),
	);
	const server = await startOwnedServer({
		serverPath,
		vault: fixture.vault,
		env: serverTestEnvironment(),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?modelB=Shop`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pick(
		browser,
		'[data-slot="preview-bookmark-selector"]',
		'[data-preview-bookmark="Shop/System#Storage"]',
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop/System#Db"]') !== null`,
			),
		Boolean,
		"the installed bookmark",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('previewB')`),
	).toBeNull();
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-migration-preview"]') === null`,
		),
	).toBe(true);
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
		"the exact retained original",
		WAIT,
	);
	const address = await browser.eval<Record<string, string>>(
		`Object.fromEntries(new URLSearchParams(location.search))`,
	);
	expect(address).toMatchObject({
		previewB: "Shop",
		stateB: "Shop/System#Old",
		checkpointB: fixture.migration.checkpoint,
	});
	expect(address["bookmarkB"]).toBeUndefined();
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-preview-coverage="Shop/System#Old"]') !== null`,
			),
		Boolean,
		"the exact original after reload",
		WAIT,
	);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(node => node.getAttribute('data-module-id'))`,
		),
	).toEqual(["Shop/System#Api"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="repository-model-open"]') !== null`,
			),
		Boolean,
		"the installed model in the repository navigator",
		WAIT,
	);
	await browser.run(["click", '[data-slot="repository-model-open"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop/System#Shop"]') !== null && !new URLSearchParams(location.search).has('previewB')`,
			),
		Boolean,
		"the current model from its repository",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-diagram"] svg') !== null`),
		Boolean,
		"the current model drawing",
		WAIT,
	);
	await pick(
		browser,
		'[data-slot="model-walkthrough-selector"]',
		'[data-walkthrough-id="Shop/System#Tour"]',
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-walkthrough"][data-grammar="architecture"] [data-semantic-id="Shop/System#Save"]') !== null`,
			),
		Boolean,
		"installed narrative architecture",
		WAIT,
	);
	await browser.run(["click", '[data-slot="semantic-presentation-next"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-walkthrough"][data-grammar="sequence"] [data-semantic-id="Shop/System#Ask"]') !== null`,
			),
		Boolean,
		"installed narrative sequence",
		WAIT,
	);
	await browser.run(["click", '[data-slot="semantic-presentation-leave"]']);
	await pick(
		browser,
		'[data-slot="preview-bookmark-selector"]',
		'[data-preview-bookmark="Shop/System#Storage"]',
	);
	const api = fixture.model.modules.find((module) => module.id === "Shop/System#Api")!;
	const { file, ...content } = api;
	writeFileSync(join(fixture.vault, file), JSON.stringify({ ...content, outgoing: [] }));
	for (const module of fixture.model.modules.filter((entry) => entry.id === "Shop/System#Db"))
		rmSync(join(fixture.vault, module.file));
	for (const input of [...fixture.model.collections, ...fixture.model.walkthroughs])
		rmSync(join(fixture.vault, input.file));
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-error"][data-code="BOOKMARK_UNAVAILABLE"]') !== null`,
			),
		Boolean,
		"explicit missing bookmark content",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('bookmarkB')`),
	).toBe("Shop/System#Storage");
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="module-list"]') === null`),
	).toBe(true);
}, 60_000);

test("an open legacy pane follows interrupted migration through recovery to canonical authority", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = await migrationNavigation(
		join(browserTestRoots().ownerRoot, "migration-cutover"),
	);
	const server = await startOwnedServer({
		serverPath,
		vault: fixture.vault,
		env: serverTestEnvironment(),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", server.base]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="semantic-board-stage"][data-board="Shop"]') !== null`,
			),
		Boolean,
		"the existing legacy reading",
		WAIT,
	);
	const input = join(fixture.root, "migration-request.json");
	writeFileSync(input, JSON.stringify(fixture.request));
	const child = Bun.spawn(
		[
			process.execPath,
			"--preload",
			join(
				import.meta.dir,
				"../../../packages/board/tests/runtime/operations/model-edit/crash-preload.ts",
			),
			join(
				import.meta.dir,
				"../../../packages/board/tests/runtime/operations/legacy-preview/installation-crash-runner.ts",
			),
			fixture.vault,
			input,
		],
		{ env: { ...process.env, ARCHBOARD_EDIT_CRASH: "prepared" }, stdout: "ignore", stderr: "pipe" },
	);
	expect(await child.exited, await new Response(child.stderr).text()).toBe(86);
	await pollUntil(
		async () => (await request<ArchitectureModelRead>("/api/architecture/model")).body,
		(result) => !result.success && result.code === "RECOVERY_REQUIRED",
		"the durable recovery refusal",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-error"][data-code="RECOVERY_REQUIRED"]') !== null`,
			),
		Boolean,
		"visible recovery without legacy fallback",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="semantic-board-stage"]') === null`,
		),
	).toBe(true);
	const recovered = await pollUntil(
		() =>
			request<ArchitectureRecoveryResult>("/api/architecture/recover", {
				method: "POST",
				body: {},
			}),
		(result) => result.body.success || result.body.code !== "MODEL_BUSY",
		"recovery after the installation lease releases",
		WAIT,
	);
	if (!recovered.body.success) throw new Error(JSON.stringify(recovered.body));
	await pollUntil(
		() =>
			browser.eval<{ modules: string[]; error: string | null; address: string }>(
				`({ modules: [...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(item => item.getAttribute('data-module-id')), error: document.querySelector('[data-slot="model-error"]')?.textContent ?? null, address: location.search })`,
			),
		(result) => result.modules.includes("Shop/System#Shop"),
		"durable canonical completion in the open pane",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('modelA')`),
	).toBe("Shop");
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-transfer-unavailable"]') !== null`,
		),
	).toBe(true);
}, 60_000);

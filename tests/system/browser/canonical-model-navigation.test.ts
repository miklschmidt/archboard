import { openModelSidebar } from "./support/canonical-page.ts";
import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { createJsonRequester } from "../support/http.ts";
import type { ArchitectureModelRead, ArchitectureCheckpointRetain } from "@archboard/board/model";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";

import { initializeSource, selectReading } from "./support/canonical-model.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function scopeOf(browser: AgentBrowserSession): Promise<string | null> {
	return browser.eval<string | null>(
		`document.querySelector('[data-slot="model-reading"]')?.getAttribute('data-scope') ?? null`,
	);
}

async function openModule(browser: AgentBrowserSession, id: string): Promise<void> {
	await openModelSidebar(browser);
	await browser.run(["click", `[data-slot="module-list"] [data-module-id="${id}"]`]);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('[data-slot="module-open"]') !== null`),
		Boolean,
		"the module opening action",
		WAIT,
	);
	await browser.run(["click", '[data-slot="module-open"]']);
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === id,
		"the selected scope",
		WAIT,
	);
}

test("module decomposition follows breadcrumbs and browser history without changing architecture", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "recursive-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	writeFileSync(
		join(vault, "decode.module.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Decode",
			name: "Decode",
			kind: "module",
			parent: "Shop#Handler",
			order: 40,
			outgoing: [],
		}),
	);
	initializeSource(root);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const before = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!before.body.success) throw new Error(JSON.stringify(before.body));
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the root modules",
		WAIT,
	);
	await openModule(browser, "Shop#Gateway");
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(node => node.getAttribute('data-module-id'))`,
		),
	).toEqual(["Shop#Handler"]);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Decode"]') === null`,
		),
	).toBe(true);
	await openModule(browser, "Shop#Handler");
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-breadcrumbs"] [data-scope-id]')].map(node => node.getAttribute('data-scope-id'))`,
		),
	).toEqual(["", "Shop#Gateway", "Shop#Handler"]);
	await browser.eval("window.history.back()");
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === "Shop#Gateway",
		"the previous scope",
		WAIT,
	);
	await browser.eval("window.history.forward()");
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === "Shop#Handler",
		"the next scope",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Decode"]') !== null`,
			),
		Boolean,
		"the latest scoped scene after navigation",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Gateway"]') === null`,
		),
	).toBe(true);
	await browser.run(["reload"]);
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === "Shop#Handler",
		"the reloaded scope",
		WAIT,
	);
	await browser.run(["click", '[data-slot="model-breadcrumbs"] [data-scope-id=""]']);
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === "",
		"the repository scope",
		WAIT,
	);
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(before.body.revision);
	const retained = await request<ArchitectureCheckpointRetain>("/api/architecture/checkpoints", {
		method: "POST",
		body: {
			vault,
			target: "current",
			operationId: "recursive-checkpoint",
			writer: "navigation-test",
			doing: "retain a recursive reading",
			expectedRevision: after.body.revision.digest,
		},
	});
	if (!retained.body.success) throw new Error(JSON.stringify(retained.body));
	const checkpoint = retained.body.checkpoint.id;
	await openModule(browser, "Shop#Gateway");
	await selectReading(browser, checkpoint);
	await pollUntil(
		() => scopeOf(browser),
		(scope) => scope === "Shop#Gateway",
		"the saved scope",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('checkpointA')`),
	).toBe(checkpoint);
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-reading="${checkpoint}"] [data-scope="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the exact saved scope after reload",
		WAIT,
	);
	await selectReading(browser, "current");
	await browser.eval("window.history.back()");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-reading="${checkpoint}"] [data-scope="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"Back to the saved scope",
		WAIT,
	);
}, 60_000);

test("canonical addresses restore separate scopes and keep missing readings explicit", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "addressed-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	const checkpoint = "a".repeat(40);
	const search = new URLSearchParams({
		modelA: "Shop",
		scopeA: "Shop#Gateway",
		modelB: "Shop",
		checkpointB: checkpoint,
		pane: "B",
	});
	await browser.run(["open", `${server.base}/?${search}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelectorAll('[data-slot="architecture-model-stage"]').length`,
			),
		(count) => count === 2,
		"both addressed model panes",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-pane="A"] [data-scope="Shop#Gateway"]') !== null && document.querySelector('[data-pane="B"] [data-slot="model-error"]') !== null`,
			),
		Boolean,
		"the exact missing reading beside the current scope",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-pane="B"] [data-slot="module-list"]') === null`,
		),
	).toBe(true);
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-pane="A"] [data-scope="Shop#Gateway"]') !== null && document.querySelector('[data-pane="B"] [data-reading="${checkpoint}"]') !== null`,
			),
		Boolean,
		"the same two readings after reload",
		WAIT,
	);
	await browser.run(["click", 'button[aria-label="Close pane B"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelectorAll('[data-slot="architecture-model-stage"]').length === 1 && !new URLSearchParams(location.search).has('modelB')`,
			),
		Boolean,
		"the closed pane leaving the address",
		WAIT,
	);
	await browser.eval("window.history.back()");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-pane="B"] [data-reading="${checkpoint}"]') !== null`,
			),
		Boolean,
		"Back restoring the closed reading",
		WAIT,
	);
	await browser.run(["open", `${server.base}/?modelA=Unknown&scopeA=Shop%23Gateway`]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-error"][data-code="MODEL_NOT_FOUND"]') !== null`,
			),
		Boolean,
		"the requested model refusal",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="module-list"]') === null`),
	).toBe(true);
	await browser.run(["open", `${server.base}/?modelA=Shop&scopeA=Shop%23Missing`]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-missing-scope"]') !== null`),
		Boolean,
		"the unavailable scope without replacement",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="module-list"]') === null`),
	).toBe(true);
}, 60_000);

test("projected connections expose complete ordered relationships and module interfaces", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "connected-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	const policy = join(vault, ".archboard/config.yaml");
	writeFileSync(
		policy,
		readFileSync(policy, "utf8").replace(
			"groups:",
			"  http: { name: HTTP, dash: solid, arrowhead: filled }\ngroups:",
		),
	);
	const gatewayPath = join(vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(gatewayPath, "utf8"));
	gateway.outgoing.push({
		id: "Shop#Self",
		to: "Shop#Gateway",
		kind: "call",
		order: 50,
		label: "Re-enter",
	});
	writeFileSync(gatewayPath, JSON.stringify(gateway));
	const handlerPath = join(vault, "internal/handler.module.json");
	const handler = JSON.parse(readFileSync(handlerPath, "utf8"));
	handler.outgoing = [
		{ id: "Shop#OutA", to: "Shop#Worker", kind: "call", order: 20, label: "Deliver" },
		{ id: "Shop#Web", to: "Shop#Worker", kind: "http", order: 40, label: "Request" },
	];
	writeFileSync(handlerPath, JSON.stringify(handler));
	writeFileSync(
		join(vault, "decode.module.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Decode",
			name: "Decode",
			kind: "module",
			parent: "Shop#Handler",
			order: 40,
			outgoing: [{ id: "Shop#OutB", to: "Shop#Worker", kind: "call", order: 30, label: "Deliver" }],
		}),
	);
	writeFileSync(
		join(vault, "hidden.module.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Hidden",
			name: "Hidden",
			kind: "module",
			parent: "Shop#Gateway",
			order: 45,
			outgoing: [],
		}),
	);
	writeFileSync(
		join(vault, "other.module.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Other",
			name: "Other",
			kind: "service",
			order: 50,
			outgoing: [],
		}),
	);
	const workerPath = join(vault, "worker.module.json");
	const worker = JSON.parse(readFileSync(workerPath, "utf8"));
	worker.outgoing = [
		{ id: "Shop#In", to: "Shop#Decode", kind: "call", order: 5, label: "Enter" },
		{ id: "Shop#Whole", to: "Shop#Gateway", kind: "call", order: 6, label: "Public API" },
		{ id: "Shop#Outside", to: "Shop#Other", kind: "call", order: 60, label: "Unrelated" },
	];
	writeFileSync(workerPath, JSON.stringify(worker));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const line =
		'[data-slot="model-connections"] [data-from="Shop#Gateway"][data-to="Shop#Worker"][data-kind="call"]';
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${line}') !== null`),
		Boolean,
		"the projected connection choices",
		WAIT,
	);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-connections"] [data-from="Shop#Gateway"][data-to="Shop#Worker"]')].map(node => node.getAttribute('data-kind'))`,
		),
	).toEqual(["call", "http"]);
	await browser.run(["click", line]);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-connection-details"] [data-relationship-id]')].map(node => node.getAttribute('data-relationship-id'))`,
		),
	).toEqual(["Shop#Dispatch", "Shop#OutA", "Shop#OutB"]);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-connection-labels"] li')].map(node => node.textContent)`,
		),
	).toEqual(["Dispatch request", "Deliver"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-diagram"] svg') !== null`),
		Boolean,
		"the root scene",
		WAIT,
	);
	await openModule(browser, "Shop#Gateway");
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="module-context"] [data-module-id]')].map(node => node.getAttribute('data-module-id'))`,
		),
	).toEqual(["Shop#Worker"]);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="semantic-inspector-entry-point"]')].map(node => node.getAttribute('data-part'))`,
		),
	).toEqual(["Shop#Handler"]);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="semantic-inspector-hidden-parts"]')?.getAttribute('data-count') ?? null`,
		),
	).toBe("1");
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-whole-interface"] [data-relationship-id]')].map(node => node.getAttribute('data-relationship-id'))`,
		),
	).toEqual(["Shop#Whole"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-diagram"] svg') !== null`),
		Boolean,
		"the opened scene",
		WAIT,
	);
	const whole = '[data-slot="model-connections"] [data-connection-id="Shop#Whole"]';
	expect(
		await browser.eval<string | null>(
			`document.querySelector('${whole}')?.getAttribute('data-to') ?? null`,
		),
	).toBe("Shop#Gateway");
	await browser.run(["click", '[data-slot="model-connections"] [data-connection-id="Shop#Self"]']);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="model-connection-details"] [data-relationship-id]')].map(node => node.getAttribute('data-relationship-id'))`,
		),
	).toEqual(["Shop#Self"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-diagram"] svg') !== null`),
		Boolean,
		"the scoped scene",
		WAIT,
	);
	const revision = await browser.eval<string>(
		`document.querySelector('[data-slot="model-diagram"]').getAttribute('data-revision')`,
	);
	await browser.eval(
		`document.querySelector('[data-slot="model-diagram"] svg').setAttribute('data-test-scene', 'kept')`,
	);
	const decodePath = join(vault, "decode.module.json");
	const decode = JSON.parse(readFileSync(decodePath, "utf8"));
	decode.description = "A hidden implementation note";
	writeFileSync(decodePath, JSON.stringify(decode, null, 2));
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-diagram"]')?.getAttribute('data-revision') ?? null`,
			),
		(next) => next !== null && next !== revision,
		"the refreshed revision without a changed projection",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-diagram"] svg')?.getAttribute('data-test-scene') ?? null`,
		),
	).toBe("kept");
}, 60_000);

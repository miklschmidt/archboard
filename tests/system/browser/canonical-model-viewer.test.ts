import { expect, test } from "bun:test";
import { cpSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
	ArchitectureCheckpointRetain,
	ArchitectureCheckpointList,
	ArchitectureModelRead,
} from "@archboard/board/model";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 6_000 } as const;

test("canonical modules open their authored details without writing architecture", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "canonical-vault"));
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const before = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!before.body.success) throw new Error(before.body.error);
	const revision = before.body.revision;
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const modelState = (): Promise<string | null> =>
		browser.eval<string | null>(
			`document.querySelector('[data-slot="architecture-model-stage"]')?.getAttribute('data-state') ?? null`,
		);
	await pollUntil(modelState, (state) => state === "ready", "the canonical model to open", WAIT);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="pane-header"] output') === null`),
		(connected) => connected,
		"the model pane to connect",
		WAIT,
	);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-slot="module-list"] [data-module-id]')].map(row => row.getAttribute('data-module-id'))`,
		),
	).toEqual(["Shop#Worker", "Shop#Gateway"]);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id') ?? null`,
			),
		(id) => id === "Shop#Gateway",
		"the selected module details to open",
		WAIT,
	);
	const details = await browser.eval<string>(
		`document.querySelector('[data-slot="module-details"]').textContent`,
	);
	// Authored values are behavior. Product wording is not pinned by this test.
	expect(details).toContain("Accepts shopping requests");
	expect(details).toContain("Authenticates callers and sends shopping requests to the worker.");
	expect(details).toContain("src/gateway.ts");
	expect(details).toContain("docs/gateway.md");
	expect(details).toContain("Dispatch request");
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(revision);

	// A middleware refusal keeps its code and recovery message, even outside the model schema.
	const movedVault = `${vault}-moved`;
	renameSync(vault, movedVault);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(modelState, (state) => state === "error", "the unavailable vault refusal", WAIT);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-error"]')?.getAttribute('data-code') ?? null`,
		),
	).toBe("VAULT_UNREADABLE");
	renameSync(movedVault, vault);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(modelState, (state) => state === "ready", "the restored vault to reopen", WAIT);

	// A failed refresh exposes the refusal, and a repaired input can be read again.
	const gatewayPath = join(vault, "gateway.module.json");
	const gateway = readFileSync(gatewayPath, "utf8");
	writeFileSync(gatewayPath, "{");
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(modelState, (state) => state === "error", "the invalid model refusal", WAIT);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-error"]')?.getAttribute('data-code') ?? null`,
		),
	).toBe("MODEL_INVALID");
	writeFileSync(gatewayPath, gateway);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(modelState, (state) => state === "ready", "the repaired model to reopen", WAIT);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	for (const module of before.body.modules) rmSync(join(vault, module.file));
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelector('[data-slot="module-list"]')?.childElementCount ?? -1`,
			),
		(count) => count === 0,
		"the empty model to remain readable",
		WAIT,
	);
	expect(await modelState()).toBe("ready");
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="module-details"]') === null`),
	).toBe(true);
	await server.assertRunning();
}, 30_000);

function git(root: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", "-C", root, ...args], {
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function initializeSource(root: string): void {
	git(root, "init", "--quiet", "--initial-branch=main");
	git(root, "config", "user.name", "Architecture reader");
	git(root, "config", "user.email", "reader@example.test");
	git(root, "remote", "add", "origin", "https://github.com/acme/shop.git");
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

test("saved readings stay exact after current inputs change and expose missing evidence and archive recovery", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "retained-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	// An unborn source repository has architecture to retain but no committed source evidence.
	initializeSource(root);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const original = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!original.body.success) throw new Error(original.body.error);
	const retained = await request<ArchitectureCheckpointRetain>("/api/architecture/checkpoints", {
		method: "POST",
		body: {
			target: "current",
			operationId: "browser-checkpoint",
			writer: "test-agent",
			doing: "retaining the architecture for a browser reader",
			expectedRevision: original.body.revision.digest,
		},
	});
	if (!retained.body.success) throw new Error(retained.body.error);
	const checkpoint = retained.body.checkpoint.id;
	const gatewayPath = join(vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(gatewayPath, "utf8")) as Record<string, unknown>;
	gateway["responsibility"] = "Changed after the checkpoint";
	writeFileSync(gatewayPath, JSON.stringify(gateway));
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const state = (): Promise<string | null> =>
		browser.eval<string | null>(
			`document.querySelector('[data-slot="architecture-model-stage"]')?.getAttribute('data-state') ?? null`,
		);
	await pollUntil(state, (value) => value === "ready", "the current reading", WAIT);
	expect(await gatewayDetails(browser)).toContain("Changed after the checkpoint");
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-reading-selector"]') !== null`,
		),
	).toBe(true);
	await selectReading(browser, checkpoint);
	await pollUntil(state, (value) => value === "ready", "the retained reading", WAIT);
	expect(await gatewayDetails(browser)).toContain("Accepts shopping requests");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-checkpoint"]').textContent`,
		),
	).toContain(checkpoint);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-source-evidence"]')?.getAttribute('data-status') ?? null`,
		),
	).toBe("unavailable");
	expect(
		await browser.eval<boolean>(
			`Boolean(document.querySelector('[data-slot="model-source-recovery"]')?.textContent)`,
		),
	).toBe(true);

	const manifestPath = join(vault, "model.json");
	const manifest = readFileSync(manifestPath);
	rmSync(manifestPath);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(state, (value) => value === "ready", "history without current inputs", WAIT);
	expect(await gatewayDetails(browser)).toContain("Accepts shopping requests");
	await selectReading(browser, "current");
	await pollUntil(state, (value) => value === "error", "the missing current model", WAIT);
	await selectReading(browser, checkpoint);
	await pollUntil(
		state,
		(value) => value === "ready",
		"history from a missing current model",
		WAIT,
	);
	writeFileSync(manifestPath, manifest);

	// Replace this owned fixture's Git metadata with a fresh clone-equivalent repository.
	// The selected checkpoint is now absent, while its cached identity remains explicit.
	const savedGit = join(root, "saved-git");
	renameSync(join(root, ".git"), savedGit);
	initializeSource(root);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(state, (value) => value === "error", "the missing architecture refusal", WAIT);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-error"]')?.getAttribute('data-code') ?? null`,
		),
	).toBe("ARCHITECTURE_UNAVAILABLE");
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="module-details"]') === null`),
	).toBe(true);
	rmSync(join(root, ".git"), { recursive: true });
	renameSync(savedGit, join(root, ".git"));
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(state, (value) => value === "ready", "the restored archive", WAIT);
	await selectReading(browser, "current");
	await pollUntil(state, (value) => value === "ready", "the current reading after history", WAIT);
	expect(await gatewayDetails(browser)).toContain("Changed after the checkpoint");
	const listed = await request<ArchitectureCheckpointList>("/api/architecture/checkpoints");
	if (!listed.body.success) throw new Error(listed.body.error);
	expect(listed.body.checkpoints.map((entry) => entry.id)).toEqual([checkpoint]);
	await server.assertRunning();
}, 30_000);

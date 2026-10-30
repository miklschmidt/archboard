import { openModelSidebar } from "./support/canonical-page.ts";
import { expect, test } from "bun:test";
import { cpSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { releaseArchitectureClaim } from "@archboard/board/store-write";
import type {
	ArchitectureCheckpointRetain,
	ArchitectureCheckpointList,
	ArchitectureModelRead,
	ArchitectureClaimResult,
	ArchitectureClaimList,
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
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";

import { initializeSource, selectReading, gatewayDetails } from "./support/canonical-model.ts";

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
	await pollUntil(
		() =>
			browser.eval<string[]>(
				`[...document.querySelectorAll('[data-slot="model-diagram"] [data-semantic-kind="node"]')].map(node => node.getAttribute('data-semantic-id'))`,
			),
		(ids) => ids.includes("Shop#Gateway") && ids.includes("Shop#Worker"),
		"the root modules to render locally",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Handler"]') === null`,
		),
	).toBe(true);
	await openModelSidebar(browser);
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
	await openModelSidebar(browser);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await openModelSidebar(browser);
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

test("canonical subject claims name the agent and let the reader take back control", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "claimed-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	initializeSource(root);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const model = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!model.body.success || !model.body.manifest.current) throw new Error("Missing fixture model");
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="architecture-model-stage"]')?.getAttribute('data-connection') === 'live'`,
			),
		Boolean,
		"the connected model reading before an agent claims it",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-diagram"] svg') !== null`),
		Boolean,
		"the scene before ownership changes",
		WAIT,
	);
	await browser.eval(
		`document.querySelector('[data-slot="model-diagram"] svg').setAttribute('data-test-scene', 'kept')`,
	);
	const claimed = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target: { model: model.body.manifest.id, state: model.body.manifest.current.id },
			writer: "Agent Ada",
			reason: "Explain gateway responsibility",
			subjects: ["Shop#Gateway"],
		},
	});
	if (!claimed.body.success) throw new Error(claimed.body.error);
	const claim = claimed.body.claim.id;
	const claimVisible = (): Promise<boolean> =>
		browser.eval<boolean>(
			`document.querySelector('[data-slot="model-claim"][data-claim-id="${claim}"]') !== null`,
		);
	await pollUntil(claimVisible, Boolean, "the current subject claim", WAIT);
	const notice = await browser.eval<string>(
		`document.querySelector('[data-slot="model-claim"]').textContent`,
	);
	expect(notice).toContain("Agent Ada");
	expect(notice).toContain("Explain gateway responsibility");
	expect(notice).toContain("Gateway");
	await browser.run(["click", '[data-slot="model-take-back"]']);
	await pollUntil(claimVisible, (visible) => !visible, "the claim to end", WAIT);
	const claims = await request<ArchitectureClaimList>("/api/architecture/claims");
	if (!claims.body.success) throw new Error(claims.body.error);
	expect(claims.body.claims).toEqual([]);
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(model.body.revision);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-diagram"] svg')?.getAttribute('data-test-scene') ?? null`,
		),
	).toBe("kept");
}, 30_000);

test("current model readings refresh after external edits and reconnect with explicit stale content", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "live-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	initializeSource(root);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the current modules",
		WAIT,
	);
	await gatewayDetails(browser);
	const details = (): Promise<string> =>
		browser.eval<string>(
			`document.querySelector('[data-slot="module-details"]')?.textContent ?? ''`,
		);
	const gatewayPath = join(vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(gatewayPath, "utf8")) as Record<string, unknown>;
	gateway["description"] = "Observed external description";
	writeFileSync(gatewayPath, JSON.stringify(gateway));
	await pollUntil(
		details,
		(text) => text.includes("Observed external description"),
		"the external edit without a manual refresh",
		WAIT,
	);
	writeFileSync(gatewayPath, "{");
	const stale = (): Promise<boolean> =>
		browser.eval<boolean>(`document.querySelector('[data-slot="model-stale"]') !== null`);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-error"]')?.getAttribute('data-code') ?? null`,
			),
		(code) => code === "MODEL_INVALID",
		"the invalid external edit refusal",
		WAIT,
	);
	expect(await stale()).toBe(true);
	expect(await details()).toContain("Observed external description");
	gateway["description"] = "Repaired external description";
	writeFileSync(gatewayPath, JSON.stringify(gateway));
	await pollUntil(
		details,
		(text) => text.includes("Repaired external description"),
		"the repaired current reading",
		WAIT,
	);
	await pollUntil(stale, (value) => !value, "the stale notice to clear", WAIT);
	const request = createJsonRequester(server);
	const current = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!current.body.success || !current.body.manifest.current)
		throw new Error("Missing current model");
	const claim = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target: { model: current.body.manifest.id, state: current.body.manifest.current.id },
			writer: "reconnecting-agent",
			reason: "Inspect the gateway",
			subjects: ["Shop#Gateway"],
		},
	});
	if (!claim.body.success) throw new Error(claim.body.error);
	const claimId = claim.body.claim.id;
	const working = (): Promise<boolean> =>
		browser.eval<boolean>(`document.querySelector('[data-slot="working-now"]') !== null`);
	await pollUntil(working, Boolean, "activity before the connection drops", WAIT);
	await server.restart({
		whileStopped: async () => {
			await pollUntil(stale, Boolean, "the disconnected reading notice", WAIT);
			expect(await details()).toContain("Repaired external description");
			const released = await releaseArchitectureClaim(vault, {
				claim: claimId,
				writer: "reconnecting-agent",
			});
			if (!released.success) throw new Error(released.error);
			gateway["description"] = "Changed while disconnected";
			writeFileSync(gatewayPath, JSON.stringify(gateway));
		},
	});
	await pollUntil(
		details,
		(text) => text.includes("Changed while disconnected"),
		"a fresh reading after reconnection",
		WAIT,
	);
	await pollUntil(stale, (value) => !value, "the reconnected reading to become current", WAIT);
	await pollUntil(working, (visible) => !visible, "the expired activity to leave the shell", WAIT);
}, 40_000);

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
	await openModelSidebar(browser);
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

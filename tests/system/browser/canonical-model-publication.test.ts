import { expect, test } from "bun:test";
import { cpSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ArchitectureCheckpointRetain, ArchitectureModelRead } from "@archboard/board/model";
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
import {
	fixtureGit,
	initializeSource,
	selectReading,
	gatewayDetails,
} from "./support/canonical-model.ts";

const WAIT = { timeoutMs: 6_000 } as const;

test("saved architecture publishes only after the reader chooses its destination", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "published-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	initializeSource(root);
	const remote = join(browserTestRoots().ownerRoot, "published-archive.git");
	fixtureGit(root, "init", "--bare", "--quiet", remote);
	fixtureGit(root, "remote", "add", "archive", remote);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const model = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!model.body.success) throw new Error(model.body.error);
	const retained = await request<ArchitectureCheckpointRetain>("/api/architecture/checkpoints", {
		method: "POST",
		body: {
			vault,
			target: "current",
			operationId: "publish-browser-reading",
			writer: "fixture-agent",
			doing: "retaining the architecture for sharing",
			expectedRevision: model.body.revision.digest,
			dependencies: [],
		},
	});
	if (!retained.body.success) throw new Error(retained.body.error);
	const checkpoint = retained.body.checkpoint.id;
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-reading-selector"]') !== null`,
			),
		Boolean,
		"the architecture reader",
		WAIT,
	);
	await selectReading(browser, checkpoint);
	const publication = (): Promise<string | null> =>
		browser.eval<string | null>(
			`document.querySelector('[data-slot="model-publication"]')?.getAttribute('data-publication') ?? null`,
		);
	await pollUntil(
		publication,
		(state) => state === "saved-locally",
		"the explicit local-only state",
		WAIT,
	);
	await browser.run(["click", '[data-slot="publication-destination-toggle"]']);
	await browser.run(["fill", '[data-slot="publication-destination"] [name="remote"]', "archive"]);
	await browser.run([
		"fill",
		'[data-slot="publication-destination"] [name="ref"]',
		"refs/heads/architecture-history",
	]);
	await browser.run(["click", '[data-slot="publication-configure"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="publication-publish"]') !== null`),
		Boolean,
		"the configured publication action",
		WAIT,
	);
	expect(await publication()).toBe("saved-locally");
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="publication-retention"]')?.getAttribute('data-protected') ?? null`,
		),
	).toBe("false");
	await browser.run(["click", '[data-slot="publication-publish"]']);
	await pollUntil(
		publication,
		(state) => state === "published",
		"the explicit publication result",
		{ timeoutMs: 12_000 },
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="architecture-model-stage"]')?.getAttribute('data-reading') ?? null`,
		),
	).toBe(checkpoint);
	expect(await gatewayDetails(browser)).toContain("Accepts shopping requests");
}, 40_000);

import { expect, test } from "bun:test";
import type { CodeCheckAnswer } from "@archboard/code-intel/code-check";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
	ArchitectureModelRead,
	ArchitectureModuleEditResult,
	ArchitectureClaimResult,
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
import {
	initializeSource,
	fixtureGit,
	selectReading,
	selectState,
} from "./support/canonical-model.ts";
import { openModelSidebar, editCanonicalModel } from "./support/canonical-page.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function openCode(
	browser: AgentBrowserSession,
	capture: string,
	target: string,
): Promise<void> {
	rmSync(capture, { force: true });
	await pollUntil(
		() =>
			browser.eval<{
				present: boolean;
				enabled: boolean;
				unavailable: string | null;
				code: string | null;
			}>(
				`({ present: document.querySelector('[data-slot="module-open-code"]') !== null, enabled: document.querySelector('[data-slot="module-open-code"]')?.matches(':enabled') === true, unavailable: document.querySelector('[data-slot="module-code-unavailable"]')?.textContent ?? null, code: document.querySelector('[data-slot="module-code-unavailable"]')?.getAttribute('data-code') ?? null })`,
			),
		(value) => value.enabled,
		"the available selected code action",
		WAIT,
	);
	await browser.run(["click", '[data-slot="module-open-code"]']);
	await pollUntil(
		async () => (existsSync(capture) ? readFileSync(capture, "utf8") : null),
		(path) => path === target,
		"the existing opener receiving the selected file",
		WAIT,
	);
}

test("canonical code controls follow current draft and exact readings while missing source stays explicit", async () => {
	await using resources = new AsyncDisposableStack();
	const fixtureRoot = join(browserTestRoots().ownerRoot, "code-model");
	const root = join(fixtureRoot, "checkout");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "src/gateway.ts"), "export const current = true;\n");
	writeFileSync(join(root, "src/planned.ts"), "export const planned = true;\n");
	initializeSource(root);
	fixtureGit(root, "add", ".");
	fixtureGit(root, "commit", "--quiet", "-m", "test: retain source fixtures");
	const sourceCommit = fixtureGit(root, "rev-parse", "HEAD");
	const capture = join(fixtureRoot, "opened-code.txt");
	const opener = join(fixtureRoot, "capture-opener.ts");
	writeFileSync(
		opener,
		'import { writeFileSync } from "node:fs"; writeFileSync(process.argv[2]!, process.argv[3]!);\n',
	);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
			ARCHBOARD_OPENER_CONFIG: join(fixtureRoot, "opener.json"),
		}),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const configured = await fetch(`${server.base}/api/settings/opener`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			Origin: server.base,
			"Sec-Fetch-Site": "same-origin",
		},
		body: JSON.stringify({
			version: 1,
			kind: "custom",
			executable: process.execPath,
			argv: [opener, capture, "{path}"],
		}),
	});
	if (!configured.ok) throw new Error(await configured.text());
	const request = createJsonRequester(server);
	const current = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!current.body.success || current.body.manifest.current === null)
		throw new Error(JSON.stringify(current.body));
	const target = { model: "Shop", state: current.body.manifest.current.id };
	const claim = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target,
			writer: "fixture-agent",
			reason: "Planning source navigation",
			subjects: ["Shop", "Shop#Gateway"],
		},
	});
	if (!claim.body.success) throw new Error(JSON.stringify(claim.body));
	const created = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: current.body.revision,
			claim: claim.body.claim.id,
			operationId: "browser-code-draft",
			writer: "fixture-agent",
			doing: "Binding planned source",
			proposal: { type: "create", name: "Planned source" },
			changes: [
				{
					type: "edit-module",
					subject: "Shop#Gateway",
					set: {
						name: "Draft gateway",
						binding: { repo: "github.com/acme/shop", path: "src/planned.ts" },
					},
				},
			],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: claim.body.claim.id, writer: "fixture-agent" },
	});
	if (!created.body.success || created.body.target.state === null)
		throw new Error(JSON.stringify(created.body));
	const browser = resources.use(await createAgentBrowser());
	const address = new URL(server.base);
	address.searchParams.set("modelA", "Shop");
	address.searchParams.set("stateA", created.body.target.state);
	await browser.run(["open", address.href]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the proposed module",
		WAIT,
	);
	await openModelSidebar(browser);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await openCode(browser, capture, join(root, "src/planned.ts"));
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('stateA')`),
	).toBe(created.body.target.state);
	await selectReading(browser, "current");
	await openModelSidebar(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-state-details"][data-lifecycle="current"]') !== null`,
			),
		Boolean,
		"the current architecture",
		WAIT,
	);
	await openModelSidebar(browser, "selection");
	await openCode(browser, capture, join(root, "src/gateway.ts"));
	await pollUntil(
		() =>
			browser.eval<string[]>(
				`[...document.querySelectorAll('[data-slot="semantic-inspector-commit-list"] [data-commit]')].map(node => node.getAttribute('data-commit'))`,
			),
		(commits) => commits.length === 1 && commits[0] === sourceCommit,
		"the selected module's local source history",
		WAIT,
	);
	await selectReading(browser, created.body.checkpoint.id);
	await openModelSidebar(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-state-details"][data-lifecycle="draft"]') !== null`,
			),
		Boolean,
		"the exact retained draft",
		WAIT,
	);
	await openModelSidebar(browser);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await openCode(browser, capture, join(root, "src/planned.ts"));
	rmSync(join(root, "src/planned.ts"));
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"]') !== null`,
			),
		Boolean,
		"the retained architecture without its source file",
		WAIT,
	);
	await openModelSidebar(browser);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-code-unavailable"]') !== null`,
			),
		Boolean,
		"the explicit missing source outcome",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="module-details"][data-module-id="Shop#Gateway"]') !== null && document.querySelector('[data-slot="model-diagram"]') !== null && document.querySelector('[data-slot="module-open-code"]')?.matches(':disabled') === true`,
		),
	).toBe(true);
	const unchanged = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!unchanged.body.success) throw new Error(JSON.stringify(unchanged.body));
	expect(unchanged.body.modules.find((module) => module.id === "Shop#Gateway")?.binding?.path).toBe(
		"src/gateway.ts",
	);
	await selectState(browser, created.body.target.state);
	const checked = await request<CodeCheckAnswer>(
		`/api/vault/code-check?state=${created.body.target.state}`,
	);
	const warnings = checked.body.findings.filter((finding) => finding.severity === "warning");
	expect(
		warnings.some(
			(finding) =>
				finding.subject?.id === "Shop#Gateway" && finding.code === "BINDING_PATH_MISSING",
		),
	).toBe(true);
	await pollUntil(
		() =>
			browser.eval<number>(
				`Number(document.querySelector('[data-slot="code-warning-count"]')?.getAttribute('data-count') ?? -1)`,
			),
		(count) => count === warnings.length,
		"warnings for the exact canonical reading",
		WAIT,
	);
	await openModelSidebar(browser);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="semantic-inspector-findings"] [data-finding-code="BINDING_PATH_MISSING"]') !== null`,
			),
		Boolean,
		"the selected module's code evidence",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-diagram"] [data-code-warning]') !== null`,
		),
	).toBe(true);
	await editCanonicalModel(request, vault, "refresh-code-evidence", [
		{
			type: "edit-module",
			subject: "Shop#Worker",
			set: { description: "A newer architecture reading" },
		},
	]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="code-warning-count"]') === null && document.querySelector('[data-slot="semantic-inspector-findings"]') === null && document.querySelector('[data-slot="model-diagram"] [data-code-warning]') === null`,
			),
		Boolean,
		"old findings to leave the changed architecture revision",
		WAIT,
	);
}, 60_000);

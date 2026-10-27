import { expect, test } from "bun:test";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
	ArchitectureModelRead,
	ArchitectureModuleEdit,
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
import { fixtureGit, initializeSource } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;
type Intent =
	| Pick<Extract<ArchitectureModuleEdit, { proposal: unknown }>, "proposal" | "changes">
	| Pick<Extract<ArchitectureModuleEdit, { correction: unknown }>, "correction" | "changes">;

async function edit(
	request: ReturnType<typeof createJsonRequester>,
	state: string,
	intent: Intent,
) {
	const reading = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!reading.body.success) throw new Error(JSON.stringify(reading.body));
	const model = reading.body;
	const target = { model: model.manifest.id, state };
	const claim = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault: request.vault,
			target,
			writer: "fixture-agent",
			reason: "Review the recorded architecture",
			subjects: [
				model.manifest.id,
				state,
				...model.modules.map((module) => module.id),
				...model.proposals.map((proposal) => proposal.id),
			],
		},
	});
	if (!claim.body.success) throw new Error(JSON.stringify(claim.body));
	try {
		const response = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
			method: "POST",
			body: {
				vault: request.vault,
				target,
				expectedRevision: model.revision,
				claim: claim.body.claim.id,
				operationId: crypto.randomUUID(),
				writer: "fixture-agent",
				doing: "Record explicit historical facts",
				...intent,
			},
		});
		if (!response.body.success) throw new Error(JSON.stringify(response.body));
		return response.body;
	} finally {
		await request("/api/architecture/claims/release", {
			method: "POST",
			body: { vault: request.vault, claim: claim.body.claim.id, writer: "fixture-agent" },
		});
	}
}

async function visible(browser: AgentBrowserSession, selector: string): Promise<void> {
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector(${JSON.stringify(selector)}) !== null`),
		Boolean,
		selector,
		WAIT,
	);
}

async function description(browser: AgentBrowserSession, value: string): Promise<void> {
	await visible(browser, '[data-slot="module-list"] [data-module-id="Shop#Gateway"]');
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await pollUntil(
		() =>
			browser.eval<string>(
				`document.querySelector('[data-slot="module-details"] header')?.textContent ?? ""`,
			),
		(text) => text.includes(value),
		"the selected module description",
		WAIT,
	);
}

async function openHistory(browser: AgentBrowserSession): Promise<void> {
	if (
		!(await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-state-history"]')?.open === true`,
		))
	)
		await browser.run(["click", '[data-slot="model-state-history"] summary']);
}

test("historical corrections refresh the lasting reading and expose exact originals and source evidence", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "corrected-history");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	initializeSource(root);
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "src/gateway.ts"), 'export const routes = ["authenticated"];\n');
	fixtureGit(root, "add", ".");
	fixtureGit(root, "commit", "--quiet", "-m", "test: record source evidence");
	const source = Bun.spawnSync(["git", "-C", root, "rev-parse", "HEAD"]);
	if (source.exitCode !== 0) throw new Error(source.stderr.toString());
	const sourceCommit = source.stdout.toString().trim();
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const draft = await edit(request, "Current", {
		proposal: { type: "create", name: "Recorded alternative" },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "An incorrect recorded description." },
			},
		],
	});
	const state = draft.target.state!;
	const original = await edit(request, state, {
		proposal: { type: "shelve", reason: "Keep the recorded alternative." },
		changes: [],
	});
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?modelA=Shop&stateA=${state}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await visible(browser, '[data-slot="architecture-model-stage"][data-connection="live"]');
	await description(browser, "An incorrect recorded description.");
	const corrected = await edit(request, state, {
		correction: {
			previous: original.checkpoint.id,
			reason: "The source already routes authenticated requests.",
			revisions: [{ repo: "github.com/acme/shop", commit: sourceCommit }],
		},
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Routes authenticated requests." },
			},
		],
	});
	// This UI update must arrive even when no live file revision changed.
	expect(corrected.before.digest).toBe(corrected.after.digest);
	await description(browser, "Routes authenticated requests.");
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-correction-checkpoint="${corrected.checkpoint.id}"]') !== null`,
		),
	).toBe(true);
	await openHistory(browser);
	const row = `[data-correction-checkpoint="${corrected.checkpoint.id}"]`;
	expect(
		await browser.eval<string>(
			`document.querySelector('${row} [data-slot="correction-reason"]').textContent`,
		),
	).toBe("The source already routes authenticated requests.");
	expect(
		await browser.eval<string>(`document.querySelector('${row} time').getAttribute('datetime')`),
	).toBe(corrected.checkpoint.correction!.at);
	expect(
		await browser.eval<string>(
			`document.querySelector('${row} [data-source-commit]').getAttribute('data-source-commit')`,
		),
	).toBe(sourceCommit);
	const previous = `${row} [data-correction-previous="${original.checkpoint.id}"]`;
	await browser.run(["scrollintoview", previous]);
	await browser.run(["click", previous]);
	await visible(
		browser,
		`[data-slot="model-checkpoint"][data-checkpoint-id="${original.checkpoint.id}"]`,
	);
	await description(browser, "An incorrect recorded description.");
	expect(
		await browser.eval<number>(`document.querySelectorAll('[data-correction-checkpoint]').length`),
	).toBe(0);
	await browser.run(["back"]);
	await visible(browser, `[data-correction-checkpoint="${corrected.checkpoint.id}"]`);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('stateA')`),
	).toBe(state);
}, 30_000);

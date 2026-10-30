import { expect, test } from "bun:test";
import { cpSync, renameSync, rmSync } from "node:fs";
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
import { initializeSource, selectReading } from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;
type Intent = Pick<Extract<ArchitectureModuleEdit, { changes: unknown }>, "changes"> &
	Pick<Extract<ArchitectureModuleEdit, { proposal: unknown }>, "proposal">;

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
			reason: "Recording a lifecycle decision",
			subjects: [
				model.manifest.id,
				...model.modules.map((module) => module.id),
				...model.proposals.map((proposal) => proposal.id),
			],
		},
	});
	if (!claim.body.success) throw new Error(JSON.stringify(claim.body));
	try {
		const result = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
			method: "POST",
			body: {
				vault: request.vault,
				target,
				expectedRevision: model.revision,
				claim: claim.body.claim.id,
				operationId: crypto.randomUUID(),
				writer: "fixture-agent",
				doing: "Recording an explicit architecture decision",
				...intent,
			},
		});
		if (!result.body.success) throw new Error(JSON.stringify(result.body));
		return result.body;
	} finally {
		await request("/api/architecture/claims/release", {
			method: "POST",
			body: { vault: request.vault, claim: claim.body.claim.id, writer: "fixture-agent" },
		});
	}
}

async function stateIs(browser: AgentBrowserSession, id: string, lifecycle: string): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-state-details"][data-selected-state="${id}"][data-lifecycle="${lifecycle}"]') !== null`,
			),
		Boolean,
		`${lifecycle} state ${id}`,
		WAIT,
	);
}

async function chooseState(
	browser: AgentBrowserSession,
	id: string,
	lifecycle: string,
): Promise<void> {
	await browser.run(["click", '[data-slot="model-reading-selector"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const item = document.querySelector('[data-state-id="${id}"]'); if (!item) return false; const r = item.getBoundingClientRect(); return r.height > 0 && item.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`,
			),
		Boolean,
		"the retained state choice",
		WAIT,
	);
	await browser.run(["click", `[data-state-id="${id}"]`]);
	await stateIs(browser, id, lifecycle);
}

async function openHistory(browser: AgentBrowserSession): Promise<void> {
	const open = await browser.eval<boolean>(
		`document.querySelector('[data-slot="model-state-history"]')?.open === true`,
	);
	if (!open) await browser.run(["click", '[data-slot="model-state-history"] summary']);
}

async function fitted(browser: AgentBrowserSession): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
		const stage = document.querySelector('[data-slot="model-diagram"]');
		const svg = stage?.querySelector('svg');
		if (!stage || !svg || document.querySelector('[data-slot="model-refresh"]')?.disabled) return false;
		const room = stage.getBoundingClientRect(); const picture = svg.getBoundingClientRect();
		return picture.top >= room.top - 1 && picture.bottom <= room.bottom + 1;
	})()`),
		Boolean,
		"the diagram to fit below decision history",
		WAIT,
	);
}

async function gatewayName(browser: AgentBrowserSession): Promise<string | null> {
	return browser.eval<string | null>(
		`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Gateway"] [data-slot="model-module-name"]')?.textContent ?? null`,
	);
}

test("adopted and shelved states remain discoverable with decisions and recoverable retained readings", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "lifecycle-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	initializeSource(root);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const queued = await edit(request, "Current", {
		proposal: {
			type: "create",
			name: "Queued delivery",
			documents: [{ repo: "github.com/acme/shop", path: "docs/queued.md" }],
		},
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Queued API" } }],
	});
	const direct = await edit(request, "Current", {
		proposal: { type: "create", name: "Direct delivery" },
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Direct API" } }],
	});
	const shelved = await edit(request, queued.target.state!, {
		proposal: { type: "shelve", reason: "The queue is not needed." },
		changes: [],
	});
	const adopted = await edit(request, direct.target.state!, {
		proposal: { type: "adopt", reason: "Direct delivery is implemented." },
		changes: [],
	});
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${server.base}/?modelA=Shop`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await stateIs(browser, direct.target.state!, "current");
	await chooseState(browser, queued.target.state!, "shelved");
	await pollUntil(
		() => gatewayName(browser),
		(name) => name === "Queued API",
		"the shelved architecture",
		WAIT,
	);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-state-reason"]').textContent`,
		),
	).toBe("The queue is not needed.");
	await openHistory(browser);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-state-date="shelvedAt"]')?.getAttribute('datetime') ?? null`,
		),
	).toBe(shelved.checkpoint.lifecycle!.at);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-state-documents"]').textContent`,
		),
	).toContain("docs/queued.md");
	await fitted(browser);
	await browser.run(["click", '[data-slot="model-comparison-selector"]']);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('[data-against-id="Current"]') !== null`),
		Boolean,
		"the displaced current comparison choice",
		WAIT,
	);
	await browser.run(["click", '[data-against-id="Current"]']);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-comparison"]')?.getAttribute('data-against') ?? null`,
			),
		(id) => id === "Current",
		"comparison with the old implemented state",
		WAIT,
	);
	expect(await gatewayName(browser)).toBe("Queued API");
	await openHistory(browser);
	await browser.run(["click", '[data-state-link="Current"]']);
	await stateIs(browser, "Current", "historical");
	await pollUntil(
		() => gatewayName(browser),
		(name) => name === "Gateway",
		"the displaced implementation",
		WAIT,
	);
	await selectReading(browser, "current");
	await stateIs(browser, direct.target.state!, "current");
	await openHistory(browser);
	await fitted(browser);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-state-reason"]').textContent`,
		),
	).toBe("Direct delivery is implemented.");
	await selectReading(browser, direct.checkpoint.id);
	await stateIs(browser, direct.target.state!, "draft");
	await selectReading(browser, adopted.checkpoint.id);
	await stateIs(browser, direct.target.state!, "historical");
	await browser.run(["reload"]);
	await stateIs(browser, direct.target.state!, "historical");
	expect(await gatewayName(browser)).toBe("Direct API");
	await chooseState(browser, queued.target.state!, "shelved");
	renameSync(join(root, ".git"), join(root, "retained-git"));
	initializeSource(root);
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('[data-slot="model-error"]') !== null`),
		Boolean,
		"unavailable retained history",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('stateA')`),
	).toBe(queued.target.state!);
	expect(await gatewayName(browser)).not.toBe("Direct API");
	rmSync(join(root, ".git"), { recursive: true });
	renameSync(join(root, "retained-git"), join(root, ".git"));
	await browser.run(["click", '[data-slot="model-refresh"]']);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('[data-slot="model-error"]') === null`),
		Boolean,
		"restored retained history",
		WAIT,
	);
	await stateIs(browser, queued.target.state!, "shelved");
	await pollUntil(
		() => gatewayName(browser),
		(name) => name === "Queued API",
		"the recovered shelved reading",
		WAIT,
	);
}, 60_000);

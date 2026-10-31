import { openAbout, pick } from "./support/canonical-page.ts";
import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
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
	compareCheckpoint,
	initializeSource,
	selectComparison,
	selectReading,
} from "./support/canonical-model.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

/** A flow for the proposal to change, because most changes in a proposal are steps. */
const REQUESTS = {
	schemaVersion: 1,
	id: "Behavior",
	name: "Requests",
	flows: [
		{
			id: "Shop#Request",
			name: "Handle request",
			summary: "The gateway hands a request to the handler.",
			participants: ["Shop#Gateway", "Shop#Handler"],
			steps: [
				{
					id: "Shop#Invoke",
					from: "Shop#Gateway",
					to: "Shop#Handler",
					kind: "sync",
					label: "Handle",
				},
				{
					id: "Shop#Answer",
					from: "Shop#Handler",
					to: "Shop#Gateway",
					kind: "return",
					label: "Done",
				},
			],
		},
	],
};

/**
 * Serve a copy of the shop, in a Git repository of its own.
 * @param resources What ends with the test.
 * @param name The directory of the copy.
 * @param flows A flow collection for a proposal to change.
 * @returns The vault, its server, a requester, the current reading and its address.
 */
async function servedShop(resources: AsyncDisposableStack, name: string, flows?: object) {
	const root = join(browserTestRoots().ownerRoot, name);
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	if (flows !== undefined) writeFileSync(join(vault, "requests.flows.json"), JSON.stringify(flows));
	initializeSource(root);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const { body: initial } = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!initial.success || initial.manifest.current === null)
		throw new Error(JSON.stringify(initial));
	const target = { model: initial.manifest.id, state: initial.manifest.current.id };
	return { vault, server, request, initial, target };
}

type Shop = Awaited<ReturnType<typeof servedShop>>;

/**
 * Claim subjects for a write.
 * @param shop The served shop.
 * @param target The state the claim is on.
 * @param reason Why it claims them.
 * @param subjects What it claims.
 * @returns The claim.
 */
async function claimOn(
	shop: Shop,
	target: Shop["target"],
	reason: string,
	subjects: readonly string[],
) {
	const { vault, request } = shop;
	const { body } = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: { vault, target, writer: "fixture-agent", reason, subjects },
	});
	if (!body.success) throw new Error(JSON.stringify(body));
	return body.claim;
}

/**
 * Where a proposal's walk stands.
 * @param browser The page.
 * @returns The row it stands on, what the tab says and the grammar on show.
 */
function walkPlace(browser: AgentBrowserSession) {
	return browser.eval<{ lit: string | null; tab: string; grammar: string | null }>(`({
		lit: document.querySelector('[data-slot="model-changes"] [data-change-id][aria-selected="true"]')?.getAttribute('data-change-id') ?? null,
		tab: document.querySelector('[data-destination="changes"]')?.textContent ?? '',
		grammar: document.querySelector('[data-slot="model-reading"]')?.getAttribute('data-grammar') ?? null,
	})`);
}

/**
 * Wait for the walk to stand on a change.
 * @param browser The page.
 * @param id The change.
 * @param position The position that the tab shows.
 */
async function standsOn(browser: AgentBrowserSession, id: string, position: string): Promise<void> {
	await pollUntil(
		() => walkPlace(browser),
		(now) => now.lit === id && now.tab.includes(position),
		`the walk at ${position} on ${id}`,
		WAIT,
	);
}

test("proposal comparison draws removed definitions from its coherent base and explains changed fields", async () => {
	await using resources = new AsyncDisposableStack();
	const shop = await servedShop(resources, "compared-model", REQUESTS);
	const { vault, server, request, initial, target } = shop;
	const claimed = await claimOn(shop, target, "Comparing queued architecture", [
		"Shop",
		"Shop#Request",
		"Shop#Answer",
		...initial.modules.map((module) => module.id),
		...initial.relationships.map((edge) => edge.id),
	]);
	const created = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: initial.revision,
			operationId: "replace-worker",
			writer: "fixture-agent",
			doing: "Proposing queued architecture",
			claim: claimed.id,
			proposal: { type: "create", name: "Queue replacement" },
			changes: [
				{ type: "remove-module", subject: "Shop#Worker" },
				{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Queued gateway" } },
				{ type: "remove-step", subject: "Shop#Answer" },
				{ type: "add-module", module: { name: "Queue", kind: "service", order: 30 } },
				{
					type: "add-relationship",
					source: "Shop#Gateway",
					relationship: { to: "Queue", kind: "call", order: 20, label: "Enqueue" },
				},
			],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: claimed.id, writer: "fixture-agent" },
	});
	if (!created.body.success || created.body.target.state === null)
		throw new Error(JSON.stringify(created.body));
	const selected = await request<ArchitectureModelRead>(
		`/api/architecture/model?state=${created.body.target.state}`,
	);
	if (!selected.body.success) throw new Error("The authored draft is unavailable");
	const queue = selected.body.modules.find((module) => module.name === "Queue");
	if (queue === undefined) throw new Error("The draft did not add its queue");
	const browser = resources.use(await createAgentBrowser());
	const address = new URL(server.base);
	address.searchParams.set("modelA", "Shop");
	address.searchParams.set("stateA", created.body.target.state);
	await browser.run(["open", address.href]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"][data-semantic-standing="removed"]') !== null`,
			),
		Boolean,
		"the removed worker from the comparison base",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="${queue.id}"][data-semantic-standing="added"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Gateway"][data-semantic-standing="changed"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Dispatch"][data-semantic-standing="removed"]') !== null`,
		),
	).toBe(true);
	const rows = await browser.eval<string[]>(
		`[...document.querySelectorAll('[data-slot="model-changes"] [data-change-id]')].map(row => row.getAttribute('data-change-id'))`,
	);
	expect(rows).toEqual(expect.arrayContaining(["Shop#Worker", queue.id]));
	expect(rows.at(-1)).toBe("Shop#Answer");
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-interface-unchanged"]') !== null`,
		),
	).toBe(true);
	for (const [index, id] of rows.entries()) {
		await browser.run(index === 0 ? ["click", '[data-slot="model-change-next"]'] : ["press", "n"]);
		await standsOn(browser, id, `${index + 1} of ${rows.length}`);
	}
	expect((await walkPlace(browser)).grammar).toBe("sequence");
	await browser.run(["press", "p"]);
	await standsOn(browser, rows.at(-2) ?? "", `${rows.length - 1} of ${rows.length}`);
	await browser.run(["press", "n"]);
	await standsOn(browser, "Shop#Answer", `${rows.length} of ${rows.length}`);
	const draft = { model: target.model, state: created.body.target.state };
	const secondClaim = await claimOn(shop, draft, "Changing a draft under its reader", [
		"Shop",
		draft.state,
	]);
	const grown = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target: draft,
			expectedRevision: selected.body.revision,
			operationId: "grow-draft",
			writer: "fixture-agent",
			doing: "Adding to the draft",
			claim: secondClaim.id,
			proposal: { type: "edit" },
			changes: [{ type: "add-module", module: { name: "Cache", kind: "service", order: 40 } }],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: secondClaim.id, writer: "fixture-agent" },
	});
	if (!grown.body.success) throw new Error(JSON.stringify(grown.body));
	const current = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!current.body.success) throw new Error(JSON.stringify(current.body));
	await standsOn(browser, "Shop#Answer", `${rows.length + 1} of ${rows.length + 1}`);
	await browser.run(["click", `[data-change-id="Shop#Worker"]`]);
	await pollUntil(
		() => walkPlace(browser),
		(now) => now.lit === "Shop#Worker" && now.grammar === "architecture",
		"the removed module, back in the architecture",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-details"][data-module-id="Shop#Worker"]') !== null && document.querySelector('[data-slot="semantic-inspector-standing"][data-standing="removed"]') !== null`,
			),
		Boolean,
		"the removed module's base definition",
		WAIT,
	);
	await pick(browser, "Shop#Gateway");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="semantic-inspector-moved"] [data-field="name"]') !== null`,
			),
		Boolean,
		"the actual changed field",
		WAIT,
	);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="semantic-inspector-moved"] [data-field="name"]').textContent`,
		),
	).toContain("Queued gateway");
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(JSON.stringify(after.body));
	expect(after.body.revision).toEqual(current.body.revision);
	expect(after.body.modules.map((module) => module.id)).toContain("Shop#Worker");
	expect(after.body.modules.map((module) => module.id)).not.toContain(queue.id);
	const otherClaim = await claimOn(shop, target, "Comparing an independent alternative", [
		"Shop",
		"Shop#Worker",
	]);
	const alternative = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: after.body.revision,
			operationId: "worker-alternative",
			writer: "fixture-agent",
			doing: "Naming an independent alternative",
			claim: otherClaim.id,
			proposal: { type: "create", name: "Other worker" },
			changes: [
				{ type: "edit-module", subject: "Shop#Worker", set: { name: "Alternative worker" } },
			],
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: otherClaim.id, writer: "fixture-agent" },
	});
	if (!alternative.body.success || alternative.body.target.state === null)
		throw new Error(JSON.stringify(alternative.body));
	const alternativeId = alternative.body.target.state;
	await selectComparison(browser, alternativeId);
	await openAbout(browser);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-comparison"][data-against="${alternativeId}"][data-reason="explicit"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"]')?.textContent?.includes('Alternative worker') === true`,
			),
		Boolean,
		"the independent proposal as the explicit base",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(`new URLSearchParams(location.search).get('againstA')`),
	).toBe(alternativeId);
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-comparison"][data-against="${alternativeId}"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"]')?.textContent?.includes('Alternative worker') === true`,
			),
		Boolean,
		"the explicit base after reload",
		WAIT,
	);
	const saved = created.body.checkpoint.id;
	await compareCheckpoint(browser, saved);
	await pollUntil(
		() => browser.eval<string | null>(`new URLSearchParams(location.search).get('againstA')`),
		(against) => against === saved,
		"the checkpoint as the exact base",
		WAIT,
	);
	await selectComparison(browser, "after");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-no-comparison"]') !== null && document.querySelector('[data-slot="model-comparison"]') === null && new URLSearchParams(location.search).get('againstA') === 'after'`,
			),
		Boolean,
		"the state alone, with no comparison",
		WAIT,
	);
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-no-comparison"]') !== null`),
		Boolean,
		"no comparison through a reload",
		WAIT,
	);
	await selectComparison(browser, "current");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-comparison"][data-against="Current"][data-reason="explicit"]') !== null`,
			),
		Boolean,
		"the explicit current base",
		WAIT,
	);
	const workerPath = join(vault, "worker.module.json");
	const worker = JSON.parse(readFileSync(workerPath, "utf8"));
	worker.name = "Current worker revised";
	writeFileSync(workerPath, JSON.stringify(worker));
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-error"][data-code="PREDECESSOR_CHANGED"]') !== null && document.querySelector('[data-slot="model-comparison-unavailable"]') !== null`,
			),
		Boolean,
		"the changed predecessor and unavailable comparison",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"][data-semantic-standing="removed"]') === null`,
			),
		Boolean,
		"the picture without the comparison it can no longer make",
		WAIT,
	);
	await selectReading(browser, created.body.checkpoint.id);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Worker"][data-semantic-standing="removed"]')?.textContent?.includes('Current worker revised') === true`,
			),
		Boolean,
		"the retained draft against the verified newer current base",
		WAIT,
	);
	await openAbout(browser);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-state-details"][data-lifecycle="draft"]') !== null && document.querySelector('[data-slot="model-comparison-unavailable"]') === null`,
		),
	).toBe(true);
}, 60_000);

test("a proposal states its interface changes first, and a row selects its module", async () => {
	await using resources = new AsyncDisposableStack();
	const shop = await servedShop(resources, "interface-changes");
	const { vault, server, request, initial, target } = shop;
	const claimed = await claimOn(shop, target, "Changing two interfaces", [
		"Shop",
		...initial.modules.map((module) => module.id),
		...initial.relationships.map((edge) => edge.id),
	]);
	const created = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: initial.revision,
			operationId: "change-interfaces",
			writer: "fixture-agent",
			doing: "Proposing a worker with parts and no gateway",
			claim: claimed.id,
			proposal: {
				type: "create",
				name: "Worker with parts",
				confirm: ["INHERITANCE_DROPPED"],
			},
			changes: [
				{ type: "remove-module", subject: "Shop#Handler" },
				{ type: "remove-module", subject: "Shop#Gateway" },
				{
					type: "add-module",
					module: { name: "Queue", kind: "service", order: 30, parent: "Shop#Worker" },
				},
			],
		},
	});
	if (!created.body.success || created.body.target.state === null)
		throw new Error(JSON.stringify(created.body));
	const browser = resources.use(await createAgentBrowser());
	const address = new URL(server.base);
	address.searchParams.set("modelA", "Shop");
	address.searchParams.set("stateA", created.body.target.state);
	address.searchParams.set("scopeA", "Shop#Worker");
	await browser.run(["open", address.href]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<string[]>(
				`[...document.querySelectorAll('[data-interface-change], [data-change-id]')].map(row => row.getAttribute('data-interface-change') ?? '')`,
			),
		(rows) => rows.length > 2 && rows.slice(0, 2).every(Boolean) && !rows.slice(2).some(Boolean),
		"the interface changes above the other changes",
		WAIT,
	);
	await browser.run(["click", '[data-interface-change="Shop#Worker"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-reading"]')?.getAttribute('data-scope') === '' && document.querySelector('[data-slot="module-details"][data-module-id="Shop#Worker"]') !== null`,
			),
		Boolean,
		"the changed module, selected on the picture that holds it",
		WAIT,
	);
	expect(
		await browser.eval<boolean[]>(
			`['Shop#Worker', 'Shop#Gateway'].map(id => document.querySelector('[data-interface-change="' + id + '"] [data-fact="notInState"]') !== null)`,
		),
	).toEqual([false, true]);
	await browser.run(["click", '[data-interface-change="Shop#Gateway"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="module-details"][data-module-id="Shop#Gateway"]') !== null && document.querySelector('[data-slot="semantic-inspector-standing"][data-standing="removed"]') !== null`,
			),
		Boolean,
		"the module this state lacks, from the drawing of the comparison",
		WAIT,
	);
}, 60_000);

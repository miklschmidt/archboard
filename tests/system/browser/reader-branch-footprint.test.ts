// The owner of what a branch changed, beside the Measures owner: the view reads only when it opens
// and on Refresh, takes `main` as the base and the checkout as the head, lists the modules against
// the plan, and a row selects its module. A head that is not checked out sets the commits against
// the proposal it adds, and Show on picture opens its branch reading with the list selected. A
// branch reading opens at a ref, offers no Explain, and keeps its address over a reload and history.

import { expect, test } from "bun:test";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	serverTestEnvironment,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { fixtureGit, initializeSource } from "./support/canonical-model.ts";
import { editCanonicalModel } from "./support/canonical-page.ts";
import { serverPath } from "./support/navigator-support.ts";
import { WAIT, drawn } from "./support/reader-page.ts";

/** The lists a footprint shows. */
type ListKey = "changed" | "changedNotNamed" | "namedAndChanged" | "namedNotChanged";

const DIALOG = '[data-slot="model-measures-dialog"]';

/**
 * Commit a change of the file that the fixture's Gateway binds.
 * @param root The repository.
 * @param value What the file exports.
 */
function commitGateway(root: string, value: number): void {
	writeFileSync(join(root, "src/gateway.ts"), `export const gateway = ${value};\n`);
	fixtureGit(root, "add", "src/gateway.ts");
	fixtureGit(root, "commit", "--quiet", "-m", `Gateway ${value}`);
}

/**
 * How many times the page asked for a footprint.
 * @param browser The page.
 * @returns The count.
 */
function footprintReads(browser: AgentBrowserSession): Promise<number> {
	return browser.eval<number>(
		`performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/api/architecture/footprint')).length`,
	);
}

/**
 * The lists the view shows: each list with its modules and their commit counts.
 * @param browser The page.
 * @returns The lists by key.
 */
function lists(browser: AgentBrowserSession) {
	return browser.eval<Partial<Record<ListKey, Record<string, number>>>>(`Object.fromEntries(
		[...document.querySelectorAll('[data-footprint-list]')].map((list) => [
			list.getAttribute('data-footprint-list'),
			Object.fromEntries([...list.querySelectorAll('[data-footprint-module]')].map((row) => [
				row.getAttribute('data-footprint-module'),
				Number(row.getAttribute('data-commits')),
			])),
		]),
	)`);
}

/**
 * Open the branch view of the Measures dialog.
 * @param browser The page.
 */
async function openBranchView(browser: AgentBrowserSession): Promise<void> {
	await browser.run(["click", '[data-column-dialog="measures"]']);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${DIALOG}') !== null`),
		Boolean,
		"the Measures dialog",
		WAIT,
	);
	await browser.run(["click", '[data-measures-tab="branch"]']);
}

/**
 * Wait for the reading of the pane to be, or not to be, a branch reading.
 * @param browser The page.
 * @param moment What the wait is for.
 * @param ref The ref the reading reads at, or null for the vault on disk.
 * @returns The ref, whether Explain is offered, and the address.
 */
function branchReading(browser: AgentBrowserSession, moment: string, ref: string | null = "main") {
	return pollUntil(
		() =>
			browser.eval<{ ref: string | null; explain: boolean; search: string }>(`({
				ref: document.querySelector('[data-slot="model-reading-selector"]')?.getAttribute('data-source-ref') ?? null,
				explain: document.querySelector('[data-slot="model-explain"]') !== null,
				search: location.search,
			})`),
		(shown) => shown.ref === ref,
		`the branch reading ${moment}`,
		WAIT,
	);
}

test("Measures lists what a branch changed, and a branch reading opens at its ref", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "branch-footprint");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	initializeSource(root);
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "src/gateway.ts"), "export const gateway = 0;\n");
	writeFileSync(join(root, "src/worker.ts"), "export const worker = 0;\n");
	fixtureGit(root, "add", "--all");
	fixtureGit(root, "commit", "--quiet", "-m", "Base");
	fixtureGit(root, "checkout", "--quiet", "-b", "feature");
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	// The plan names the Gateway, which the branch changes, and binds the Worker, which it does not.
	const proposal = await editCanonicalModel(
		request,
		vault,
		"plan-branch",
		[
			{ type: "edit-module", subject: "Shop#Gateway", set: { responsibility: "Answers faster" } },
			{
				type: "edit-module",
				subject: "Shop#Worker",
				set: { binding: { repo: "github.com/acme/shop", path: "src/worker.ts" } },
			},
		],
		{ proposal: { type: "create", name: "Faster gateway" } },
	);
	if (proposal.target.state === null) throw new Error(JSON.stringify(proposal));
	fixtureGit(root, "add", "--all");
	fixtureGit(root, "commit", "--quiet", "-m", "Plan");
	commitGateway(root, 1);
	// A branch beside this one plans a change of its own, which the checkout does not hold.
	fixtureGit(root, "checkout", "--quiet", "-b", "other", "main");
	const beside = await editCanonicalModel(
		request,
		vault,
		"plan-beside",
		[
			{
				type: "edit-module",
				subject: "Shop#Worker",
				set: {
					responsibility: "Works from a queue",
					binding: { repo: "github.com/acme/shop", path: "src/worker.ts" },
				},
			},
		],
		{ proposal: { type: "create", name: "Queued worker" } },
	);
	fixtureGit(root, "add", "--all");
	fixtureGit(root, "commit", "--quiet", "-m", "Plan beside");
	fixtureGit(root, "checkout", "--quiet", "feature");
	fixtureGit(root, "checkout", "--quiet", "-b", "broken", "main");
	writeFileSync(join(vault, "model.json"), "invalid\n");
	fixtureGit(root, "add", ".archboard/vault/model.json");
	fixtureGit(root, "commit", "--quiet", "-m", "Invalid model");
	fixtureGit(root, "checkout", "--quiet", "feature");
	const model = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!model.body.success) throw new Error(JSON.stringify(model.body));
	const reading = `${server.base}/?modelA=${model.body.manifest.id}`;

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${reading}&stateA=${proposal.target.state}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await drawn(browser);
	expect(await footprintReads(browser)).toBe(0);

	await openBranchView(browser);
	const planned = await pollUntil(
		() => lists(browser),
		(shown) => Object.keys(shown).length === 3,
		"the three lists against the plan",
		WAIT,
	);
	expect(planned.namedAndChanged).toEqual({ "Shop#Gateway": 1 });
	expect(Object.keys(planned.namedNotChanged ?? {})).toEqual(["Shop#Worker"]);
	expect(Object.keys(planned).toSorted()).toEqual([
		"changedNotNamed",
		"namedAndChanged",
		"namedNotChanged",
	]);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-ref-picker="base"] button')?.getAttribute('data-value') ?? null`,
		),
	).toBe("main");
	expect(await footprintReads(browser)).toBe(1);

	commitGateway(root, 2);
	await browser.run(["click", '[data-slot="footprint-refresh"]']);
	await pollUntil(
		() => lists(browser),
		(shown) => shown.namedAndChanged?.["Shop#Gateway"] === 2,
		"the new commit after Refresh",
		WAIT,
	);

	await browser.run(["click", '[data-footprint-module="Shop#Gateway"] button']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('${DIALOG}') === null && document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id') === 'Shop#Gateway'`,
			),
		Boolean,
		"the row's module selected on its picture",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(`document.querySelector('[data-slot="model-explain"]') !== null`),
	).toBe(true);
	// The view keeps the answer for the same range and reading, so opening it again reads nothing.
	await openBranchView(browser);
	await pollUntil(
		() => lists(browser),
		(shown) => shown.namedAndChanged?.["Shop#Gateway"] === 2,
		"the kept answer",
		WAIT,
	);
	expect(await footprintReads(browser)).toBe(2);

	// A head with invalid inputs reports a failure and can be read again after repair.
	await browser.run(["click", '[data-ref-picker="head"] button']);
	await browser.run(["click", '[data-ref-choice="broken"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="branch-footprint-status"][role="alert"]') !== null`,
			),
		Boolean,
		"the unreadable head's failure",
		WAIT,
	);
	fixtureGit(root, "update-ref", "refs/heads/broken", "main");
	await browser.run(["click", '[data-slot="footprint-refresh"]']);
	await pollUntil(
		() => lists(browser),
		(repaired) => repaired.changed !== undefined,
		"the repaired head after Refresh",
		WAIT,
	);

	// The vault at a head that is not checked out lacks the plan on screen, so the footprint is set
	// against the one proposal that the head adds over the merge base.
	await browser.run(["click", '[data-ref-picker="head"] button']);
	await browser.run(["click", '[data-ref-choice="other"]']);
	const atOther = await pollUntil(
		() =>
			browser.eval<{ against: string | null; vault: string | null }>(`({
				against: document.querySelector('[data-ref-picker="against"] button')?.getAttribute('data-value') ?? null,
				vault: document.querySelector('[data-slot="footprint-vault"]')?.getAttribute('data-vault-read') ?? null,
			})`),
		(shown) => shown.vault === "ref",
		"the footprint at a head that is not checked out",
		WAIT,
	);
	expect(atOther.against).toBe(beside.target.state);

	// Refresh rereads a moved base before choosing the plan that the head adds.
	const originalBase = fixtureGit(root, "rev-parse", "main");
	const currentState = model.body.manifest.current?.id;
	fixtureGit(root, "update-ref", "refs/heads/main", "other");
	await browser.run(["click", '[data-slot="footprint-refresh"]']);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-ref-picker="against"] button')?.getAttribute('data-value') ?? null`,
			),
		(value) => value === currentState,
		"Against after the base moves to the head",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="footprint-refresh"]')?.disabled === false`,
			),
		Boolean,
		"the first refresh to finish",
		WAIT,
	);
	fixtureGit(root, "update-ref", "refs/heads/main", originalBase);
	await browser.run(["click", '[data-slot="footprint-refresh"]']);
	await pollUntil(
		() => lists(browser),
		(restored) => restored.namedNotChanged !== undefined,
		"the plan after restoring the base",
		WAIT,
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-footprint-repository="github.com/acme/shop"]')?.textContent?.includes('${originalBase.slice(0, 7)}') ?? false`,
			),
		Boolean,
		"the restored merge base in the footprint",
		WAIT,
	);

	// Show on picture opens that head's branch reading in that state, and selects the listed module.
	await browser.run(["click", '[data-footprint-show="namedNotChanged"]']);
	const shown = await pollUntil(
		() =>
			browser.eval<{ dialog: boolean; search: string; selected: string | null }>(`({
				dialog: document.querySelector('${DIALOG}') !== null,
				search: location.search,
				selected: document.querySelector('[data-slot="module-details"]')?.getAttribute('data-module-id') ?? null,
			})`),
		(state) => !state.dialog && state.selected === "Shop#Worker",
		"the list on its picture",
		WAIT,
	);
	const address = new URLSearchParams(shown.search);
	expect([address.get("refA"), address.get("stateA"), address.get("scopeA")]).toEqual([
		"other",
		beside.target.state,
		null,
	]);

	// Measures can read the branch-only proposal after Show on picture opens it.
	await openBranchView(browser);
	await pollUntil(
		() => lists(browser),
		(reopened) => Object.keys(reopened).length === 3,
		"the footprint reopened in the branch-only proposal",
		WAIT,
	);
	await browser.run(["press", "Escape"]);

	// `main` holds no proposal, so its reading has only the current state.
	await browser.run(["open", `${reading}&refA=main`]);
	await drawn(browser);
	await browser.run(["reload"]);
	await drawn(browser);
	expect(await branchReading(browser, "after a reload")).toEqual({
		ref: "main",
		explain: false,
		search: expect.stringContaining("refA=main"),
	});
	await browser.run(["back"]);
	await drawn(browser);
	// Back returns to the list that Show on picture opened, which is a branch reading of its own.
	expect((await branchReading(browser, "back on the shown list", "other")).ref).toBe("other");
	await browser.run(["forward"]);
	await drawn(browser);
	expect((await branchReading(browser, "forward again")).ref).toBe("main");
	const atMain = await request<ArchitectureModelRead>(
		`/api/architecture/model?${new URLSearchParams({ ref: "main" })}`,
	);
	if (!atMain.body.success) throw new Error(JSON.stringify(atMain.body));
	expect(atMain.body.proposals).toEqual([]);
}, 30_000);

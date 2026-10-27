import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ArchitectureModelRead } from "@archboard/board/model";
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
import { openModelSidebar } from "./support/canonical-page.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 8_000 } as const;
const CHOICE = '[data-slot="semantic-group-choice"][data-group="fulfillment"]';

/** Read each member's selection ring from the real browser stylesheet. */
function ringed(browser: AgentBrowserSession, ids: readonly string[]): Promise<string[]> {
	return browser.eval<string[]>(`${JSON.stringify(ids)}.filter(id => {
		const halo = document.querySelector('[data-slot="model-diagram"] [data-semantic-id="' + id + '"] > .ab-halo');
		return halo !== null && Number(getComputedStyle(halo).opacity) === 1;
	})`);
}

test("a group selects all canonical members across scopes and changes no architecture", async () => {
	await using resources = new AsyncDisposableStack();
	const vault = vaultIn(join(browserTestRoots().ownerRoot, "module-groups"));
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	const policyPath = join(vault, ".archboard/config.yaml");
	writeFileSync(
		policyPath,
		`${readFileSync(policyPath, "utf8")}  fulfillment: { name: Fulfillment, color: teal }\n  billing: { name: Billing, color: amber }\n`,
	);
	for (const [file, groups] of [
		["internal/handler.module.json", ["fulfillment"]],
		["worker.module.json", ["billing", "fulfillment"]],
	] as const) {
		const path = join(vault, file);
		writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), groups }));
	}
	writeFileSync(
		join(vault, "queue.module.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Queue",
			name: "Queue",
			kind: "module",
			parent: "Shop#Gateway",
			order: 40,
			groups: ["fulfillment"],
			outgoing: [],
		}),
	);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const before = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!before.body.success) throw new Error(JSON.stringify(before.body));
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", server.base]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-diagram"] svg') !== null`),
		Boolean,
		"the canonical drawing",
		WAIT,
	);
	await openModelSidebar(browser);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${CHOICE}') !== null`),
		Boolean,
		"the authored group choice",
		WAIT,
	);
	await browser.run(["click", CHOICE]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-selection-count"]')?.getAttribute('data-count') === '3' && document.querySelector('[data-slot="model-hidden-selection"]')?.getAttribute('data-count') === '2'`,
			),
		Boolean,
		"all members selected, including two hidden descendants",
		WAIT,
	);
	await browser.run(["click", '[data-slot="model-focus"]']);
	const ids = ["Shop#Handler", "Shop#Queue", "Shop#Worker", "Shop#Gateway"];
	await pollUntil(
		() => ringed(browser, ids),
		(members) => members.length === 3,
		"the complete focused group",
		WAIT,
	);
	expect(await ringed(browser, ids)).toEqual(ids.slice(0, 3));
	await openModelSidebar(browser);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('${CHOICE}')?.getAttribute('aria-pressed')`,
		),
	).toBe("true");
	await browser.run(["click", CHOICE]);
	await pollUntil(
		() => ringed(browser, ids),
		(members) => members.length === 0,
		"the group selection cleared",
		WAIT,
	);
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(before.body.revision);
}, 60_000);

import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
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
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function chooseMode(browser: AgentBrowserSession, grammar: string): Promise<void> {
	await browser.run(["click", '[data-slot="model-grammar-selector"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const item = document.querySelector('[data-grammar="${grammar}"]'); if (!item) return false; const rect = item.getBoundingClientRect(); return rect.height > 0 && item.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })()`,
			),
		Boolean,
		"diagram mode choices",
		WAIT,
	);
	await browser.run(["click", `[data-grammar="${grammar}"]`]);
}

async function drawnSubjects(browser: AgentBrowserSession): Promise<string[]> {
	return browser.eval<string[]>(
		`[...new Set([...document.querySelectorAll('[data-slot="model-diagram"] [data-semantic-id]')].map(node => node.getAttribute('data-semantic-id')))]`,
	);
}

test("diagram modes require a relevant flow and restore the prior architecture reading", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "model-modes");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	writeFileSync(
		join(vault, "requests.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Behavior",
			name: "Requests",
			flows: [
				{
					id: "Shop#Request",
					name: "Handle request",
					participants: ["Shop#Gateway", "Shop#Handler", "Shop#Worker"],
					steps: [
						{
							id: "Shop#Invoke",
							from: "Shop#Gateway",
							to: "Shop#Handler",
							kind: "sync",
							label: "Handle",
						},
						{
							id: "Shop#Decide",
							kind: "decision",
							question: "Ready?",
							alternatives: [
								{
									label: "yes",
									steps: [
										{
											id: "Shop#Send",
											from: "Shop#Handler",
											to: "Shop#Worker",
											kind: "sync",
											label: "Dispatch",
										},
										{
											id: "Shop#Loop",
											kind: "loop",
											condition: "More results",
											steps: [
												{
													id: "Shop#Back",
													from: "Shop#Worker",
													to: "Shop#Handler",
													kind: "return",
													label: "Result",
												},
											],
										},
									],
								},
								{ label: "no", steps: [] },
							],
						},
						{
							id: "Shop#Finish",
							from: "Shop#Handler",
							to: "Shop#Gateway",
							kind: "return",
							label: "Response",
						},
					],
				},
				{
					id: "Shop#Retry",
					name: "Retry delivery",
					participants: ["Shop#Handler", "Shop#Worker"],
					steps: [
						{
							id: "Shop#Again",
							from: "Shop#Handler",
							to: "Shop#Worker",
							kind: "async",
							label: "Retry",
						},
					],
				},
				{
					id: "Shop#Other",
					name: "Worker maintenance",
					participants: ["Shop#Worker"],
					steps: [
						{
							id: "Shop#Clean",
							from: "Shop#Worker",
							to: "Shop#Worker",
							kind: "self",
							label: "Clean",
						},
					],
				},
			],
		}),
	);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const before = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!before.body.success) throw new Error(before.body.error);
	const browser = resources.use(await createAgentBrowser());
	const address = new URL(server.base);
	address.searchParams.set("modelA", "Shop");
	address.searchParams.set("scopeA", "Shop#Gateway");
	address.searchParams.set("focusA", "Shop#Handler");
	address.searchParams.set("hideKindsA", "call");
	await browser.run(["open", address.href]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => drawnSubjects(browser),
		(ids) => ids.includes("Shop#Handler"),
		"the focused architecture",
		WAIT,
	);
	await chooseMode(browser, "sequence");
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-slot="model-flow-required"]') !== null`),
		Boolean,
		"an explicit flow choice",
		WAIT,
	);
	expect(await drawnSubjects(browser)).toEqual([]);
	await browser.run(["click", '[data-slot="model-flow-selector"]']);
	await pollUntil(
		() =>
			browser.eval<string[]>(
				`[...document.querySelectorAll('[data-flow-id]')].map(node => node.getAttribute('data-flow-id')).sort()`,
			),
		(ids) => ids.length > 0,
		"relevant flows",
		WAIT,
	);
	expect(
		await browser.eval<string[]>(
			`[...document.querySelectorAll('[data-flow-id]')].map(node => node.getAttribute('data-flow-id')).sort()`,
		),
	).toEqual(["Shop#Request", "Shop#Retry"]);
	await browser.run(["click", '[data-flow-id="Shop#Request"]']);
	await pollUntil(
		() => drawnSubjects(browser),
		(ids) => ids.includes("Shop#Finish"),
		"the complete sequence",
		WAIT,
	);
	expect(await drawnSubjects(browser)).toEqual(
		expect.arrayContaining([
			"Shop#Gateway",
			"Shop#Handler",
			"Shop#Worker",
			"Shop#Invoke",
			"Shop#Decide",
			"Shop#Send",
			"Shop#Loop",
			"Shop#Back",
			"Shop#Finish",
		]),
	);
	await chooseMode(browser, "flowchart");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-reading"][data-grammar="flowchart"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Finish"]') !== null`,
			),
		Boolean,
		"the complete flowchart",
		WAIT,
	);
	expect(await drawnSubjects(browser)).toEqual(
		expect.arrayContaining([
			"Shop#Invoke",
			"Shop#Decide",
			"Shop#Send",
			"Shop#Loop",
			"Shop#Back",
			"Shop#Finish",
		]),
	);
	await chooseMode(browser, "architecture");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-reading"][data-grammar="architecture"][data-scope="Shop#Gateway"]') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Handler"]') !== null`,
			),
		Boolean,
		"the preceding architecture reading",
		WAIT,
	);
	expect(
		await browser.eval<string[]>(
			`['scopeA','focusA','hideKindsA'].map(key => new URLSearchParams(location.search).get(key))`,
		),
	).toEqual(["Shop#Gateway", "Shop#Handler", "call"]);
	expect(await drawnSubjects(browser)).not.toContain("Shop#Finish");
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(before.body.revision);
}, 60_000);

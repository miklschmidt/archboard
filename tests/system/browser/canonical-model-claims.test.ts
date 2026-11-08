import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
	ArchitectureClaimList,
	ArchitectureClaimResult,
	ArchitectureModelRead,
} from "@archboard/model/contract";
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
import { initializeSource } from "./support/canonical-model.ts";
import { pick } from "./support/canonical-page.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 6_000 } as const;
const FIXTURE = resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault");

/** The rows of the left column that a claim can mark, by the subject that each one shows. */
const ROWS = {
	gateway: '[data-module-row="Shop#Gateway"]',
	worker: '[data-module-row="Shop#Worker"]',
	flow: '[data-flow-id="Shop#Request"]',
	walkthrough: '[data-walkthrough-id="Shop#Tour"]',
} as const;

/** The claim mark of the repository switcher, and of the model's row in its list. */
const SWITCHER_MARK = '[data-slot="repository-switcher"] [data-slot="claim-mark"]';
const BADGE = '[data-slot="model-panel"] [data-slot="claim-badge"]';

test("a claim is a status mark on its rows, its model and a selected subject, and nothing to act on", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "claimed-model");
	const vault = vaultIn(root);
	cpSync(FIXTURE, vault, { recursive: true });
	writeFileSync(
		join(vault, "requests.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Behavior",
			name: "Requests",
			flows: [
				{
					id: "Shop#Request",
					name: "Request",
					summary: "Dispatch a request to the worker.",
					participants: ["Shop#Gateway", "Shop#Worker"],
					steps: [
						{
							id: "Shop#Send",
							from: "Shop#Gateway",
							to: "Shop#Worker",
							kind: "sync",
							label: "Dispatch",
						},
					],
				},
			],
		}),
	);
	writeFileSync(
		join(vault, "tour.walkthrough.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Tour",
			name: "Gateway tour",
			target: { state: "current" },
			beats: [
				{
					id: "Shop#Entry",
					title: "The entry",
					narrative: "Requests enter at the gateway.",
					reading: { grammar: "architecture", selection: ["Shop#Gateway"] },
				},
			],
		}),
	);
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
				`document.querySelector('[data-slot="architecture-model-stage"]')?.getAttribute('data-connection') === 'live' && document.querySelector('[data-slot="model-diagram"] svg') !== null && document.querySelector('${ROWS.walkthrough}') !== null`,
			),
		Boolean,
		"the connected reading and its column before an agent claims anything",
		WAIT,
	);
	await browser.eval(
		`document.querySelector('[data-slot="model-diagram"] svg').setAttribute('data-test-scene', 'kept')`,
	);
	const pictureRoom = (): Promise<string> =>
		browser.eval<string>(
			`JSON.stringify(document.querySelector('[data-slot="model-diagram"]').getBoundingClientRect())`,
		);
	const room = await pictureRoom();
	await pick(browser, "Shop#Worker");
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('[data-slot="module-details"]') !== null`),
		Boolean,
		"the unclaimed module in the panel",
		WAIT,
	);
	const focused = (): Promise<string> =>
		browser.eval<string>(`document.activeElement?.outerHTML.slice(0, 200) ?? ""`);
	const focusBefore = await focused();
	expect(await marksOn(browser)).toEqual([]);

	const claimed = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target: { model: model.body.manifest.id, state: model.body.manifest.current.id },
			writer: "Agent Ada",
			reason: "Explain gateway responsibility",
			subjects: ["Shop#Gateway", "Shop#Request", "Shop#Tour"],
		},
	});
	if (!claimed.body.success) throw new Error(claimed.body.error);
	const words = "Claimed by an agent: Explain gateway responsibility";
	// Each claimed row carries the mark, and an unclaimed row carries none.
	await pollUntil(
		() => marksOn(browser),
		(rows) => rows.length === 3,
		"the marks of the claimed rows",
		WAIT,
	);
	expect(await marksOn(browser)).toEqual([ROWS.gateway, ROWS.flow, ROWS.walkthrough]);
	// A claim moves neither the picture nor the focus, and the selected subject that it leaves
	// alone says nothing of it.
	expect(await pictureRoom()).toBe(room);
	expect(await focused()).toBe(focusBefore);
	expect(await browser.eval<boolean>(`document.querySelector('${BADGE}') === null`)).toBe(true);
	// The model reads as claimed in the switcher, and on its row of the repository list.
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${SWITCHER_MARK}') !== null`),
		Boolean,
		"the mark of the claimed model in the switcher",
		WAIT,
	);
	await browser.run(["click", '[data-slot="repository-switcher"]']);
	const listed = await pollUntil(
		() =>
			browser.eval<{ marked: boolean; label: string | null }>(`(() => {
				const row = document.querySelector('[data-slot="repository-dropdown"] [role="treeitem"]');
				return { marked: row?.querySelector('[data-slot="claim-mark"]') != null, label: row?.getAttribute('aria-label') ?? null };
			})()`),
		(row) => row.marked,
		"the mark of the claimed model in the repository list",
		WAIT,
	);
	expect(listed.label).toContain(words);
	await browser.run(["press", "Escape"]);
	// Every mark says the purpose to assistive technology and on hover, never the writer.
	const said = await browser.eval<{ text: string; title: string | null }[]>(
		`[...document.querySelectorAll('[data-slot="claim-mark"]')].map(mark => ({ text: mark.textContent, title: mark.getAttribute('title') }))`,
	);
	expect(said.length).toBeGreaterThanOrEqual(4);
	for (const mark of said) expect(mark).toEqual({ text: words, title: words });
	expect(JSON.stringify(said)).not.toContain("Agent Ada");
	// A mark is status: it is no control and holds none, and nothing offers a take-back.
	expect(
		await browser.eval<boolean>(
			`[...document.querySelectorAll('[data-slot="claim-mark"], [data-slot="claim-badge"]')].every(mark => !mark.hasAttribute('tabindex') && mark.querySelector('button, a, input, [tabindex]') === null)`,
		),
	).toBe(true);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-claim"], [data-slot="model-take-back"]') === null && ![...document.querySelectorAll('button')].some(button => /take back/i.test(button.textContent))`,
		),
	).toBe(true);
	// The head of a selected subject that the claim holds says so, with the purpose.
	await pick(browser, "Shop#Gateway");
	const badge = await pollUntil(
		() =>
			browser.eval<{ text: string; title: string | null } | null>(`(() => {
				const badge = document.querySelector('${BADGE}');
				return badge === null ? null : { text: badge.querySelector('.sr-only')?.textContent ?? '', title: badge.getAttribute('title') };
			})()`),
		(seen) => seen !== null,
		"the badge of the selected claimed subject",
		WAIT,
	);
	expect(badge).toEqual({ text: words, title: words });

	// The agent ends the claim, and every mark leaves with it.
	const released = await request<ArchitectureClaimList>("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: claimed.body.claim.id, writer: "Agent Ada" },
	});
	if (!released.body.success) throw new Error(released.body.error);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="claim-mark"], [data-slot="claim-badge"]') === null`,
			),
		Boolean,
		"every mark to leave once the claim ends",
		WAIT,
	);
	const after = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!after.body.success) throw new Error(after.body.error);
	expect(after.body.revision).toEqual(model.body.revision);
	expect(await pictureRoom()).toBe(room);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-diagram"] svg')?.getAttribute('data-test-scene') ?? null`,
		),
	).toBe("kept");
}, 30_000);

/**
 * Which rows of the left column carry a claim mark.
 * @param browser The page.
 * @returns The rows, by their selector in {@link ROWS}, in the order of the column.
 */
function marksOn(browser: AgentBrowserSession): Promise<string[]> {
	return browser.eval<string[]>(`(() => {
		const rows = ${JSON.stringify(ROWS)};
		return Object.values(rows).filter(row => document.querySelector(row + ' [data-slot="claim-mark"]') !== null);
	})()`);
}

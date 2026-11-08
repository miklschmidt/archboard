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
import { openAbout, startModelWalkthrough } from "./support/canonical-page.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 6_000 } as const;
const FIXTURE = resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault");

test("canonical subject claims show their purpose, not their writer, and let the reader take back control", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "claimed-model");
	const vault = vaultIn(root);
	cpSync(FIXTURE, vault, { recursive: true });
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
	// A claim floats over the picture, so it never changes the room of the picture.
	const pictureRoom = (): Promise<string> =>
		browser.eval<string>(
			`JSON.stringify(document.querySelector('[data-slot="model-diagram"]').getBoundingClientRect())`,
		);
	const room = await pictureRoom();
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
	expect(await claimFrames(browser, claim)).toEqual(["picture"]);
	const notice = await browser.eval<string>(
		`document.querySelector('[data-slot="model-claim"]').textContent`,
	);
	expect(notice).not.toContain("Agent Ada");
	expect(notice).toContain("Explain gateway responsibility");
	expect(notice).toContain("Gateway");
	// The card names its subjects and never counts them.
	expect(notice).not.toMatch(/\d+ subjects?/);
	expect(await pictureRoom()).toBe(room);
	// The card leaves the focus where the reader had it.
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-claim"]').contains(document.activeElement)`,
		),
	).toBe(false);
	// Each pane that reads the vault shows the claim over its own picture.
	const stages = (): Promise<number> =>
		browser.eval<number>(
			`document.querySelectorAll('[data-slot="architecture-model-stage"]').length`,
		);
	const panesWithCard = (): Promise<number> =>
		browser.eval<number>(
			`[...document.querySelectorAll('[data-slot="architecture-model-stage"]')].filter(stage => stage.querySelectorAll('[data-slot="model-claim"][data-claim-id="${claim}"]').length === 1).length`,
		);
	await request("/api/panes/open", { method: "POST", body: {} });
	await pollUntil(stages, (count) => count === 2, "the second pane to read the vault", WAIT);
	await pollUntil(panesWithCard, (count) => count === 2, "the claim in each pane", WAIT);
	await request("/api/panes/close", { method: "POST", body: { pane: "focused" } });
	await pollUntil(stages, (count) => count === 1, "the second pane to close", WAIT);
	expect(await claimFrames(browser, claim)).toEqual(["picture"]);
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

test("a claim stays in reach over About, a walkthrough and a model that cannot be read", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "claim-reach");
	const vault = vaultIn(root);
	cpSync(FIXTURE, vault, { recursive: true });
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
	const target = { model: model.body.manifest.id, state: model.body.manifest.current.id };
	const browser = resources.use(await createAgentBrowser());
	const claimFor = async (reason: string): Promise<string> => {
		const claimed = await request<ArchitectureClaimResult>("/api/architecture/claims", {
			method: "POST",
			body: { vault, target, writer: "Agent Ada", reason, subjects: ["Shop#Gateway"] },
		});
		if (!claimed.body.success) throw new Error(claimed.body.error);
		return claimed.body.claim.id;
	};
	// Take back control from the one card of the claim, wherever it stands.
	const takeBack = async (claim: string): Promise<void> => {
		await browser.run([
			"click",
			`[data-slot="model-claim"][data-claim-id="${claim}"] [data-slot="model-take-back"]`,
		]);
		await pollUntil(
			() => claimFrames(browser, claim),
			(frames) => frames.length === 0,
			"the card of the claim taken back",
			WAIT,
		);
		const claims = await request<ArchitectureClaimList>("/api/architecture/claims");
		if (!claims.body.success) throw new Error(claims.body.error);
		expect(claims.body.claims).toEqual([]);
	};
	await browser.run(["open", `${server.base}/?modelA=${target.model}`]);
	// A pane narrow enough that About's tools stand under the top centre.
	await browser.run(["set", "viewport", "900", "900"]);

	await openAbout(browser);
	const overAbout = await claimFor("Explain the gateway on About");
	await pollUntil(
		() => claimFrames(browser, overAbout),
		(frames) => frames.length === 1 && frames[0] === "about",
		"the claim over About",
		WAIT,
	);
	// Both the title tools and the narrow section bar stay usable beside the card.
	expect(await aboutControlsReachable(browser)).toBe(true);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await browser.run(["click", 'button[aria-label="Open a second pane"]']);
	await pollUntil(
		() => claimFrames(browser, overAbout),
		(frames) => frames.length === 2 && frames.includes("picture") && frames.includes("about"),
		"the claim in two panes with separate surfaces",
		WAIT,
	);
	expect(await aboutControlsReachable(browser)).toBe(true);
	// Scrolling cannot carry the section bar through the card or hide its take-back.
	await browser.eval(
		`document.querySelector('[data-slot="model-about-title"]').parentElement.parentElement.scrollTop = 320`,
	);
	expect(await aboutControlsReachable(browser)).toBe(true);
	await browser.run(["click", 'button[aria-label="Close pane B"]']);
	await pollUntil(
		() => claimFrames(browser, overAbout),
		(frames) => frames.length === 1 && frames[0] === "about",
		"the claim to remain over About after the other pane closes",
		WAIT,
	);
	await takeBack(overAbout);

	const overWalkthrough = await claimFor("Narrate the gateway");
	await startModelWalkthrough(browser, "Shop#Tour");
	await pollUntil(
		() => claimFrames(browser, overWalkthrough),
		(frames) => frames.length === 1 && frames[0] === "walkthrough",
		"the claim over the walkthrough that plays",
		WAIT,
	);
	await takeBack(overWalkthrough);

	// A first read that fails leaves no surface, and the claim stands over the pane.
	const overFailure = await claimFor("Repair the gateway");
	writeFileSync(join(vault, "gateway.module.json"), "{");
	await browser.run(["open", `${server.base}/?modelA=${target.model}`]);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-error"]')?.getAttribute('data-code') ?? null`,
			),
		(code) => code === "MODEL_INVALID",
		"the refusal of the first read",
		WAIT,
	);
	await pollUntil(
		() => claimFrames(browser, overFailure),
		(frames) => frames.length === 1 && frames[0] === "pane",
		"the claim over the pane that has no model",
		WAIT,
	);
	await takeBack(overFailure);
}, 30_000);

/**
 * Where each card of a claim stands: the surface that holds it.
 * @param browser The page.
 * @param claim The claim.
 * @returns The surface of each card.
 */
function claimFrames(browser: AgentBrowserSession, claim: string): Promise<string[]> {
	return browser.eval<string[]>(
		`[...document.querySelectorAll('[data-slot="model-claim"][data-claim-id="${claim}"]')].map(card => card.checkVisibility() ? card.closest('[data-slot="model-claims-frame"]')?.getAttribute('data-frame') ?? 'none' : 'hidden')`,
	);
}

/** Whether the visible About controls receive pointer input, including a clipped outline entry. */
function aboutControlsReachable(browser: AgentBrowserSession): Promise<boolean> {
	return browser.eval<boolean>(`(() => {
		const about = document.querySelector('[data-slot="model-about"]');
		const controls = [...about.querySelectorAll('[data-slot="model-about-title"] button, [data-slot="about-outline-entry"], [data-slot="model-take-back"]')];
		const reachable = (control, box = control.getBoundingClientRect()) => {
			const clip = (control.closest('nav') ?? about).getBoundingClientRect();
			const left = Math.max(box.left, clip.left), right = Math.min(box.right, clip.right);
			const top = Math.max(box.top, clip.top), bottom = Math.min(box.bottom, clip.bottom);
			if (left >= right || top >= bottom) return true;
			return control.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2));
		};
		const heading = about.querySelector('h2');
		const text = document.createRange();
		text.selectNodeContents(heading);
		return controls.length > 0 && controls.every(control => reachable(control)) &&
			[...text.getClientRects()].every(box => reachable(heading, box));
	})()`);
}

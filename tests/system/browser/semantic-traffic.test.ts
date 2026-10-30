// A picture's traffic in the page (TASK-385.01): the renderer draws it as SMIL, and the page
// runs it as Web Animations instead, because SMIL kept an idle board at about one core.
//
// What this catches: SMIL left running in the page; a form the renderer writes that the page
// translates wrongly, so a bar of light is somewhere else than SMIL
// would have put it at the same moment; and a picture put up again for a new version whose
// traffic jumps back to the start instead of running on.

import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
import { serverPath } from "./support/navigator-support.ts";
import { editCanonicalModel } from "./support/canonical-page.ts";
import { initializeSource } from "./support/canonical-model.ts";
import { emulateMedia } from "./support/shell-render-matrix.ts";

const WAIT = { timeoutMs: 8_000 } as const;

/** The authored model draws traffic trains and an independent sequence draws message pulses. */
const EXAMPLE = join(import.meta.dir, "../../../examples/canonical-model/.archboard/vault");

/** The model and its independent flow identity. */
const MODEL = "Shop";
const FLOW = "Shop#Request";
const SEMANTIC_SURFACE = '[data-slot="model-diagram"] [data-slot="semantic-board-surface"]';

/** The moments compared: before the traffic begins, and on into its cycles. */
const MOMENTS = [0.01, 0.5, 1.7, 3.3, 6.1, 9.4];

/** What one comparison found. */
interface Comparison {
	readonly running: number;
	readonly targets: number;
	readonly references: number;
	readonly animations: number;
	readonly mismatches: number;
	readonly first: unknown;
}

/**
 * Compare the page's traffic with SMIL's, in the page itself: the picture on the surface is
 * copied away from the camera with its kept SMIL put back, and both are stood at each moment.
 */
const COMPARE = `(() => {
	const live = document.querySelector('${SEMANTIC_SURFACE} svg');
	const running = live.querySelectorAll('animateTransform').length;
	const reference = live.cloneNode(true);
	for (const kept of reference.querySelectorAll('[data-traffic-motion]')) {
		kept.insertAdjacentHTML('beforeend', kept.getAttribute('data-traffic-motion'));
		kept.removeAttribute('data-traffic-motion');
	}
	const holder = document.createElement('div');
	holder.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none';
	holder.append(reference);
	document.body.append(holder);
	reference.pauseAnimations();
	const targets = [...live.querySelectorAll('[data-traffic-motion]')];
	const references = [...reference.querySelectorAll('*')].filter((element) =>
		[...element.children].some((child) => child.localName === 'animateTransform'));
	const traffic = document.getAnimations().filter((animation) =>
		animation.id === 'picture-clock' && live.contains(animation.effect.target));
	for (const animation of traffic) animation.pause();
	const scale = live.getBoundingClientRect().width / live.width.baseVal.value;
	const look = (element, root, k) => {
		const box = element.getBoundingClientRect();
		const page = root.getBoundingClientRect();
		return {
			x: (box.x + box.width / 2 - page.x) / k,
			y: (box.y + box.height / 2 - page.y) / k,
		};
	};
	const mismatches = [];
	for (const seconds of ${JSON.stringify(MOMENTS)}) {
		for (const animation of traffic) animation.currentTime = seconds * 1000;
		reference.setCurrentTime(seconds);
		targets.forEach((target, index) => {
			const page = look(target, live, scale);
			const smil = look(references[index], reference, 1);
			const apart = Math.hypot(page.x - smil.x, page.y - smil.y) > 1;
			if (apart) mismatches.push({ seconds, index, page, smil });
		});
	}
	holder.remove();
	for (const animation of traffic) animation.play();
	return { running, targets: targets.length, references: references.length,
		animations: traffic.length, mismatches: mismatches.length, first: mismatches[0] ?? null };
})()`;

/**
 * Where the traffic of the picture on the surface stands, in milliseconds, or null without any:
 * the animation furthest along, since one that has finished stands still at its end.
 */
const TRAFFIC_CLOCK = `(() => {
	const live = document.querySelector('${SEMANTIC_SURFACE} svg');
	const times = document.getAnimations()
		.filter((animation) => animation.id === 'picture-clock' && live?.contains(animation.effect.target))
		.map((animation) => animation.currentTime);
	return times.length === 0 ? null : Math.max(...times);
})()`;

/**
 * Open an address and wait for its picture to be at rest.
 * @param browser The page.
 * @param address The address.
 */
async function openAtRest(browser: AgentBrowserSession, address: string): Promise<void> {
	await browser.run(["open", address]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('${SEMANTIC_SURFACE}:not([data-picture-motion]) svg') !== null`,
			),
		(rest) => rest,
		`${address} to be drawn and at rest`,
		WAIT,
	);
}

/**
 * Compare the traffic on the surface with SMIL's, and say what was compared.
 * @param browser The page.
 * @returns The comparison.
 */
async function compareTraffic(browser: AgentBrowserSession): Promise<Comparison> {
	return browser.eval<Comparison>(COMPARE);
}

test("the page runs a picture's traffic where SMIL would, without SMIL, and runs it on across versions", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const root = join(ownerRoot, "vault");
	const vault = vaultIn(root);
	cpSync(EXAMPLE, vault, { recursive: true });
	initializeSource(root);
	writeFileSync(
		join(vault, "request.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Requests",
			name: "Requests",
			flows: [
				{
					id: FLOW,
					name: "Handle request",
					participants: ["Shop#Gateway", "Shop#Worker"],
					steps: [
						{
							id: "Shop#Send",
							from: "Shop#Gateway",
							to: "Shop#Worker",
							kind: "sync",
							label: "Dispatch",
						},
						{
							id: "Shop#Return",
							from: "Shop#Worker",
							to: "Shop#Gateway",
							kind: "return",
							label: "Result",
						},
					],
				},
			],
		}),
	);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["set", "viewport", "1920", "1080"]);

	// Trains on the board, and a pulse a message on its sequence view: every form the renderer writes.
	for (const address of [
		`?modelA=${MODEL}&grammarA=sequence&flowA=${encodeURIComponent(FLOW)}`,
		`?modelA=${MODEL}`,
	]) {
		await openAtRest(browser, `${server.base}/${address}`);
		const compared = await compareTraffic(browser);
		expect(compared.running, `${address} runs SMIL`).toBe(0);
		expect(compared.targets, `${address} runs no traffic`).toBeGreaterThan(0);
		expect(compared.references).toBe(compared.targets);
		expect(compared.animations).toBeGreaterThanOrEqual(compared.targets);
		expect(compared.first, `${address} moves its traffic elsewhere than SMIL`).toBeNull();
	}

	// A new version puts the picture up again; its traffic runs on rather than starting over.
	// The final comparison left the board's live traffic at MOMENTS' last time, then resumed it.
	const before = await browser.eval<number>(TRAFFIC_CLOCK);
	expect(before).toBeGreaterThan(3000);
	await editCanonicalModel(request, vault, "traffic-audit", [
		{ type: "add-module", module: { name: "Audit log", kind: "service", order: 40 } },
	]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('${SEMANTIC_SURFACE}')?.textContent.includes('Audit log') === true` +
					` && document.querySelector('${SEMANTIC_SURFACE}:not([data-picture-motion]) svg') !== null`,
			),
		(drawn) => drawn,
		"the new version to be drawn and at rest",
		WAIT,
	);
	expect(await browser.eval<number>(TRAFFIC_CLOCK)).toBeGreaterThanOrEqual(before);

	// The existing picture answers reduced motion without another layout or read.
	await browser.eval(
		`document.querySelector('${SEMANTIC_SURFACE} svg').setAttribute('data-test-kept', 'motion')`,
	);
	const visibleTraffic = () =>
		browser.eval<number>(
			`[...document.querySelectorAll('${SEMANTIC_SURFACE} .ab-pulse')].filter(node => getComputedStyle(node).display !== 'none').length`,
		);
	const moving = await visibleTraffic();
	expect(moving).toBeGreaterThan(0);
	const restore = await emulateMedia(browser, "light", "reduced-motion");
	try {
		await pollUntil(
			visibleTraffic,
			(count) => count === 0,
			"traffic hidden by reduced motion",
			WAIT,
		);
		expect(
			await browser.eval<boolean>(
				`document.querySelector('${SEMANTIC_SURFACE} svg[data-test-kept="motion"]') !== null`,
			),
		).toBe(true);
	} finally {
		await restore();
	}
	await pollUntil(
		visibleTraffic,
		(count) => count === moving,
		"traffic restored without another picture",
		WAIT,
	);
});

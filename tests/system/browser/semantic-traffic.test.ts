// A picture's traffic in the page (ADR 0071): the renderer draws it as SMIL for an export, and
// in the page the painter draws it on the canvas, on the frame clock.
//
// What this catches: SMIL or a pulse left running in the page; a canvas that stands still while
// a picture has traffic to draw; traffic that a reader who asked for no motion still sees; and a
// painter that goes on asking for frames with nothing to draw.

import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
import { initializeSource } from "./support/canonical-model.ts";
import { emulateMedia } from "./support/shell-render-matrix.ts";

const WAIT = { timeoutMs: 8_000 } as const;

/** How long a look at the canvas waits, which any train of traffic moves in. */
const TRAFFIC_GLANCE_MS = 120;

/** The authored model draws traffic trains and an independent sequence draws message pulses. */
const EXAMPLE = join(import.meta.dir, "../../../examples/canonical-model/.archboard/vault");

/** The model and its independent flow identity. */
const MODEL = "Shop";
const FLOW = "Shop#Request";
const SEMANTIC_SURFACE = '[data-slot="model-diagram"] [data-slot="semantic-board-surface"]';

/** The canvas the picture is painted on. */
const CANVAS = '[data-slot="model-diagram"] [data-slot="picture-canvas"]';

/** The painter drawing the surface. */
const PAINTER = `document.querySelector('${SEMANTIC_SURFACE}')?.getAttribute('data-painter') ?? null`;

/** How many marks of traffic or SMIL the page runs under the canvas. */
const IN_THE_PAGE = `document.querySelectorAll(
	'${SEMANTIC_SURFACE} .ab-pulse, ${SEMANTIC_SURFACE} animateTransform, ${SEMANTIC_SURFACE} [data-traffic-motion]',
).length`;

/** One number for what the canvas shows now. */
const PRINT = `(() => {
	const canvas = document.querySelector('${CANVAS}');
	const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
	let print = 0;
	for (let index = 0; index < data.length; index += 1) print = (Math.imul(print, 31) + data[index]) | 0;
	return print;
})()`;

/**
 * Whether the canvas changes over a moment.
 * @param browser The page.
 * @returns True when it showed something else after it.
 */
async function moves(browser: AgentBrowserSession): Promise<boolean> {
	const first = await browser.eval<number>(PRINT);
	await Bun.sleep(TRAFFIC_GLANCE_MS);
	return (await browser.eval<number>(PRINT)) !== first;
}

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

test("the canvas draws a picture's traffic, the page runs none, and a reader who asked for no motion sees none", async () => {
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
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["set", "viewport", "1920", "1080"]);

	// Trains on the board, and a pulse a message on its sequence view: every form the renderer writes.
	for (const address of [
		`?modelA=${MODEL}&grammarA=sequence&flowA=${encodeURIComponent(FLOW)}`,
		`?modelA=${MODEL}`,
	]) {
		await openAtRest(browser, `${server.base}/${address}`);
		await pollUntil(() => browser.eval<string | null>(PAINTER), Boolean, "the painter", WAIT);
		expect(await browser.eval<number>(IN_THE_PAGE), `${address} runs traffic`).toBe(0);
		expect(await moves(browser), `${address} draws no traffic`).toBe(true);
	}

	// The existing picture answers reduced motion without another layout or read.
	await browser.eval(
		`document.querySelector('${SEMANTIC_SURFACE} svg').setAttribute('data-test-kept', 'motion')`,
	);
	const restore = await emulateMedia(browser, "light", "reduced-motion");
	try {
		await pollUntil(
			() => moves(browser),
			(moving) => !moving,
			"traffic hidden",
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
	await pollUntil(() => moves(browser), Boolean, "traffic back without another picture", WAIT);
});

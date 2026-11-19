import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
} from "./support/agent-browser.ts";
import { pick } from "./support/canonical-page.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

/** The switch that draws the lines of the `call` kind or leaves them out. */
const CALLS = '[data-filter-kind="call"]';

/** The button that clears the selection in the right panel. */
const CLEAR = '[data-slot="semantic-selection-clear"]';

test("reading filters keep a hidden selection, with an explicit reveal action", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "filtered-model");
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	const workerPath = join(vault, "worker.module.json");
	const worker = JSON.parse(readFileSync(workerPath, "utf8"));
	worker.groups = ["public"];
	writeFileSync(workerPath, JSON.stringify(worker));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	const focusedSlot = () =>
		browser.eval<string | undefined>(
			`document.activeElement?.getAttribute('data-slot') ?? document.activeElement?.tagName`,
		);
	await browser.run(["open", `${server.base}/`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"] svg') !== null && document.querySelector('[data-slot="model-diagram"] [data-semantic-kind="group-region"]') === null`,
			),
		Boolean,
		"a first picture with its groups off",
		WAIT,
	);
	await pick(browser, "Shop#Dispatch");
	await browser.run(["click", CALLS]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-hidden-selection"]')?.getAttribute('data-count') === '1' && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Dispatch"]') === null && document.querySelector('${CALLS}')?.getAttribute('aria-checked') === 'false'`,
			),
		Boolean,
		"the hidden selected connection, and the switch that hid it",
		WAIT,
	);
	expect(
		await browser.eval<number>(
			`Number(document.querySelector('[data-slot="model-selection-count"]')?.getAttribute('data-count'))`,
		),
	).toBe(1);
	expect(
		await browser.eval<boolean>(
			`document.querySelector('[data-slot="model-connection-details"]') !== null`,
		),
	).toBe(true);
	expect(
		await browser.eval<string[]>(
			`[...new Set([...document.querySelectorAll('[data-slot="model-diagram"] [data-semantic-kind="node"]')].map(node => node.getAttribute('data-semantic-id')))].sort()`,
		),
	).toEqual([]);
	await browser.run(["click", '[data-slot="model-reveal-selection"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-hidden-selection"]') === null && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Dispatch"]') !== null`,
			),
		Boolean,
		"the revealed selection",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('${CALLS}').getAttribute('aria-checked')`,
		),
	).toBe("true");
	await browser.eval("window.history.back()");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-hidden-selection"]')?.getAttribute('data-count') === '1'`,
			),
		Boolean,
		"the preceding filtered reading",
		WAIT,
	);
	await browser.run(["set", "viewport", "840", "900"]);
	await browser.run(["reload"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('${CALLS}')?.getAttribute('aria-checked') === 'false' && document.querySelector('${CALLS}')?.checkVisibility() === true && document.querySelector('[data-slot="model-empty-diagram"]') !== null`,
			),
		Boolean,
		"the switch still visible in the narrow empty reading after reload",
		WAIT,
	);
	await browser.run(["focus", CALLS]);
	await browser.run(["press", "Space"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('${CALLS}')?.getAttribute('aria-checked') === 'true' && document.querySelector('${CALLS}')?.checkVisibility() === false && document.querySelector('[data-slot="model-diagram"] [data-semantic-id="Shop#Dispatch"]') !== null`,
			),
		Boolean,
		"the hidden kind drawn again and the panel hidden",
		WAIT,
	);
	expect(await focusedSlot()).toBe("model-diagram");
	await pick(browser, "Shop#Dispatch");
	await browser.run(["click", CALLS]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-empty-diagram"]') !== null && document.querySelector('${CLEAR}')?.checkVisibility() === true`,
			),
		Boolean,
		"an empty reading with a selection to clear",
		WAIT,
	);
	await browser.run(["focus", CLEAR]);
	await browser.run(["press", "Space"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('${CLEAR}') === null && document.querySelector('${CALLS}')?.checkVisibility() === true`,
			),
		Boolean,
		"the selection cleared and the Legend still visible",
		WAIT,
	);
	expect(await focusedSlot()).toBe("model-diagram");
}, 60_000);

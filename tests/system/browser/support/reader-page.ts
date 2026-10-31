// What the owners of the right column share: a reader on a copy of the canonical model.

import { cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { startOwnedServer } from "../../support/owned-server.ts";
import { vaultIn } from "../../support/test-vault.ts";
import {
	browserTestRoots,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	serverTestEnvironment,
	type AgentBrowserSession,
} from "./agent-browser.ts";
import { initializeSource } from "./canonical-model.ts";
import { serverPath } from "./navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

/**
 * Wait for the picture to rest.
 * @param browser The page.
 */
async function drawn(browser: AgentBrowserSession): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-diagram"]')?.getAttribute('aria-busy') === 'false' && document.querySelector('[data-picture-motion]') === null`,
			),
		Boolean,
		"the picture at rest",
		WAIT,
	);
}

/**
 * Serve a copy of the canonical model, with what a test adds to it, and open the reader.
 * @param resources What ends with the test.
 * @param name The test's directory.
 * @param write Add to the vault.
 * @returns The page.
 */
async function openReader(
	resources: AsyncDisposableStack,
	name: string,
	write: (vault: string) => void,
): Promise<AgentBrowserSession> {
	const root = join(browserTestRoots().ownerRoot, name);
	const vault = vaultIn(root);
	cpSync(resolve(import.meta.dir, "../../../../examples/canonical-model/.archboard/vault"), vault, {
		recursive: true,
	});
	write(vault);
	initializeSource(root);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", server.base]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await drawn(browser);
	return browser;
}

export { WAIT, drawn, openReader };

import { afterEach, expect, test } from "bun:test";

import { learnServedVault, servedVault } from "@/ui/server-requests";

// A server started without a vault opens a page in no vault when the machine
// knows no repository with one (ADR 0049). The page must say so rather than
// open a pane that names no vault.

const realFetch = globalThis.fetch;

/**
 * Answer `/api/served-vault` with one body.
 * @param body The answer.
 */
function serverAnswers(body: unknown): void {
	globalThis.fetch = Object.assign(async () => Response.json(body), {
		preconnect: realFetch.preconnect,
	});
}

afterEach(() => {
	globalThis.fetch = realFetch;
});

test("a server with no vault to open stops the page before any pane is drawn", async () => {
	serverAnswers({ success: true, vault: null });
	const refused = await learnServedVault().then(
		() => false,
		() => true,
	);
	expect(refused).toBe(true);
	expect(() => servedVault()).toThrow();
});

test("the vault a server names is where a page opens", async () => {
	serverAnswers({ success: true, vault: "/work/shop/.archboard/vault" });
	await learnServedVault();
	expect(servedVault()).toBe("/work/shop/.archboard/vault");
});

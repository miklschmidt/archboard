// A worker answers solve after solve, and which worker answers one depends on
// which were busy. libavoid breaks some ties by where its objects lie in its
// memory, so the engine puts back what it held as loaded before every solve,
// and a graph solved after other work is drawn as it is when solved first
// (ADR 0040: no Track or Blocks solve of the dogfood boards or the wide-board
// fixtures depends on what was solved before it, so no graph here shows it).
// What libavoid holds as loaded must be the same on every host too: the
// environment it writes into its memory at load names the program and the
// locale, which differ between checkouts and between the Archboard server and
// a browser, and moved every later allocation with them.

import { expect, test } from "bun:test";

/**
 * A digest of what libavoid holds as loaded by a host with this program path and these languages.
 * @param program The program path the host runs under.
 * @param languages The languages it prefers.
 * @returns The digest.
 */
async function loadedAs(program: string, languages: readonly string[]): Promise<string> {
	const worker = new Worker(new URL("./loaded-memory-worker.ts", import.meta.url).href);
	try {
		const answer = new Promise<string>((resolve) => {
			worker.addEventListener("message", (event: MessageEvent<string>) => resolve(event.data));
		});
		// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin; the rule is about window.postMessage
		worker.postMessage({ program, languages });
		return await answer;
	} finally {
		worker.terminate();
	}
}

test("libavoid is loaded into the same memory whatever host loads it", async () => {
	const [checkout, browser] = await Promise.all([
		loadedAs("/home/someone/checkout/src/runtime/semantic-renderer/lib/layout-worker.ts", []),
		loadedAs("/w.js", ["fr-CA", "fr"]),
	]);
	expect(browser).toBe(checkout);
});

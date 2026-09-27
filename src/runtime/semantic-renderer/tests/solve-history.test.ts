// A worker answers solve after solve, and which worker answers one depends on
// which were busy. libavoid breaks some ties by where its objects lie in its
// memory, so the engine puts back what it held as loaded before every solve: a
// graph routed after other work is drawn as it is when routed first. The graph
// is a route of the dogfood Archboard server board that the router answered in
// six ways, depending on what it had solved before. What libavoid holds as
// loaded must be the same on every host too: the environment it writes into
// its memory at load names the program and the locale, which differ between
// checkouts and between the Archboard server and a browser, and moved every
// later allocation with them.

import { expect, test } from "bun:test";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { loadLayoutEngine, type AvoidEngine } from "@/transformers/semantic-renderer/engine";
import input from "@/runtime/semantic-renderer/tests/solve-history-graph.json";

/**
 * Whether the loaded module is libavoid's.
 * @param value The module.
 * @returns True when it makes points.
 */
function isAvoid(value: unknown): value is AvoidEngine {
	return typeof value === "object" && value !== null && "Point" in value;
}

test("a graph routed after earlier work is drawn as it is when routed first", async () => {
	const solve = await loadLayoutEngine(async () => {
		const [viz] = await Promise.all([instance(), AvoidLib.load()]);
		return [viz, AvoidLib.getInstance()];
	});
	const avoid = AvoidLib.getInstance();
	if (!isAvoid(avoid)) throw new Error("libavoid did not load");
	const first = solve(structuredClone(input.graph), input.options);
	const kept: unknown[] = [];
	for (let round = 1; round <= 16; round += 1) {
		// Earlier work that left the engine's memory otherwise than it was loaded.
		for (let point = 0; point < round * 7; point += 1) kept.push(new avoid.Point(point, point));
		expect(solve(structuredClone(input.graph), input.options)).toEqual(first);
	}
});

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

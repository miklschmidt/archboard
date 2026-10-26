// Layout workers share every Graphviz answer an earlier solve laid out, and
// the pool every solve's answer, kept across renders (TASK-548.02). What this
// catches: a worker laying a graph out again that another worker laid out,
// and a re-render after an edit that keeps every card's size laying its
// graphs out again, which took a wide board's re-render from under 0.1 s back
// to 1.5 s.
import { afterAll, expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { compiledCore } from "#runtime/services/core.ts";
import { createEnginePool, type EngineWorker } from "#shared/rules/engine/engine-pool.ts";
import { installRendererHost, rendererHost } from "#shared/rules/render/host.ts";
import { SemanticPolicySchema } from "@archboard/board/policy";
import type { VariantContent } from "@archboard/board/content";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: { module: { name: "Module", icon: "RiBox3Line" } },
	relationshipKinds: { call: { name: "Call", dash: "solid", arrowhead: "filled" } },
});

/** Every worker the tests started, stopped when they end. */
const started: Worker[] = [];
afterAll(() => {
	for (const worker of started) worker.terminate();
});

/**
 * A pool of real layout workers, and each graph they told the pool they laid out with Graphviz.
 * @returns The pool's solve, the graphs laid out, and the workers it started.
 */
function observedPool() {
	const laidOut: string[] = [];
	const workers: Worker[] = [];
	const solve = createEnginePool((): EngineWorker => {
		const worker = new Worker(
			new URL("../../../src/runtime/processes/layout-worker.ts", import.meta.url).href,
		);
		started.push(worker);
		workers.push(worker);
		worker.addEventListener("message", (event: MessageEvent<{ graphviz?: string[] }>) => {
			const pairs = event.data.graphviz ?? [];
			for (let index = 0; index < pairs.length; index += 2) laidOut.push(pairs[index]!);
		});
		// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
		worker.postMessage({ core: compiledCore() });
		return worker;
	}, 2);
	return { solve, laidOut, workers };
}

/**
 * A measured graph of two framed blocks of two cards, laid out as blocks.
 * @param options More root options.
 * @returns The graph, as a solve takes it.
 */
function measured(options: Record<string, string> = {}): string {
	const call = { "archboard.relationship.kind": "call" };
	const frame = (id: string) => ({
		id,
		width: 400,
		height: 60,
		layoutOptions: { "archboard.header.size": "60" },
		children: [
			{ id: `${id}1`, width: 340, height: 100 },
			{ id: `${id}2`, width: 340, height: 100 },
		],
		edges: [{ id: `${id}12`, sources: [`${id}1`], targets: [`${id}2`], layoutOptions: call }],
	});
	return JSON.stringify({
		id: "root",
		layoutOptions: { "archboard.blocks.nesting": "blocks", ...options },
		children: [frame("a"), frame("b")],
		edges: [{ id: "ab", sources: ["a1"], targets: ["b2"], layoutOptions: call }],
	});
}

test("a worker lays out no graph that another worker laid out before", async () => {
	const { solve, laidOut, workers } = observedPool();
	await solve(measured());
	expect(laidOut.length).toBeGreaterThan(0);
	// The first worker takes the other graph, so the second takes this reading of the first.
	const other = JSON.stringify({ id: "root", children: [{ id: "x", width: 10, height: 10 }] });
	await Promise.all([solve(other), solve(measured({ "archboard.blocks.read": "true" }))]);
	expect(workers).toHaveLength(2);
	expect(new Set(laidOut).size).toBe(laidOut.length);
});

/**
 * A board of two containers whose cards call each other.
 * @param gateway The name of one card.
 * @returns The board.
 */
function board(gateway: string): VariantContent {
	return orderedFixture({
		nodes: [
			{ id: "edge", name: "Edge", kind: "module" },
			{ id: "core", name: "Core", kind: "module" },
			{ id: "gate", name: gateway, kind: "module", parent: "edge" },
			{ id: "auth", name: "Auth", kind: "module", parent: "edge" },
			{ id: "store", name: "Store", kind: "module", parent: "core" },
			{ id: "queue", name: "Queue", kind: "module", parent: "core" },
		],
		edges: [
			{ id: "ga", from: "gate", to: "auth", kind: "call" },
			{ id: "gs", from: "gate", to: "store", kind: "call" },
			{ id: "aq", from: "auth", to: "queue", kind: "call" },
			{ id: "sq", from: "store", to: "queue", kind: "call" },
		],
	});
}

test("a re-render after a relabel that keeps every card's size lays out no graph again", async () => {
	// Drawn first so the Bun host is installed.
	const warm = orderedFixture({ nodes: [{ id: "warm", name: "Warm", kind: "module" }] });
	await renderArchitecture({ content: warm, theme: "light", policy });
	const host = rendererHost();
	const { solve, laidOut } = observedPool();
	let solves = 0;
	installRendererHost({
		...host,
		solve: (graph, signal) => {
			solves += 1;
			return solve(graph, signal);
		},
	});
	try {
		const drawn = await renderArchitecture({ content: board("Gateway"), theme: "light", policy });
		expect(laidOut.length).toBeGreaterThan(0);
		laidOut.length = 0;
		solves = 0;
		const relabelled = await renderArchitecture({
			content: board("Gatehouse"),
			theme: "light",
			policy,
		});
		expect(solves).toBeGreaterThan(0);
		expect([relabelled.width, relabelled.height]).toEqual([drawn.width, drawn.height]);
		expect(laidOut).toEqual([]);
	} finally {
		installRendererHost(host);
	}
});

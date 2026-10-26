// Layout workers share every Graphviz answer an earlier solve laid out, kept
// across renders (TASK-548.02). What this catches: a re-render after an edit
// that keeps every card's size laying its graphs out again, on whichever
// worker its solves land, which took a wide board's re-render from about
// 0.8 s back to 1.5 s.
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

/** Every worker the test started, stopped when it ends. */
const started: Worker[] = [];
afterAll(() => {
	for (const worker of started) worker.terminate();
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

test("a re-render after a relabel that keeps every card's size lays out no graph again, on any worker", async () => {
	// Drawn first so the Bun host is installed.
	const warm = orderedFixture({ nodes: [{ id: "warm", name: "Warm", kind: "module" }] });
	await renderArchitecture({ content: warm, theme: "light", policy });
	const host = rendererHost();
	/** The graphs Graphviz laid out, as the workers told the pool. */
	let laidOut = 0;
	let solves = 0;
	const pool = createEnginePool((): EngineWorker => {
		const worker = new Worker(
			new URL("../../../src/runtime/processes/layout-worker.ts", import.meta.url).href,
		);
		started.push(worker);
		worker.addEventListener("message", (event: MessageEvent<{ graphviz?: string[] }>) => {
			laidOut += (event.data.graphviz?.length ?? 0) / 2;
		});
		// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
		worker.postMessage({ core: compiledCore() });
		return worker;
	}, 2);
	installRendererHost({
		...host,
		solve: (graph, signal) => {
			solves += 1;
			return pool(graph, signal);
		},
	});
	try {
		const drawn = await renderArchitecture({ content: board("Gateway"), theme: "light", policy });
		expect(laidOut).toBeGreaterThan(0);
		laidOut = 0;
		solves = 0;
		const relabelled = await renderArchitecture({
			content: board("Gatehouse"),
			theme: "light",
			policy,
		});
		expect(solves).toBeGreaterThan(0);
		expect([relabelled.width, relabelled.height]).toEqual([drawn.width, drawn.height]);
		expect(laidOut).toBe(0);
	} finally {
		installRendererHost(host);
	}
});

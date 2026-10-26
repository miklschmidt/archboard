// A relabel that keeps every card's size asks for the same solves as the
// render before it, and the engine pool answers a solve it answered before
// at once (TASK-548.02). What this catches: such a re-render laying its
// solves out again on the layout workers, which took a wide board's
// re-render from about 50 ms back to 0.8 s.
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

test("a re-render after a relabel that keeps every card's size sends no solve to a worker", async () => {
	// Drawn first so the Bun host is installed.
	const warm = orderedFixture({ nodes: [{ id: "warm", name: "Warm", kind: "module" }] });
	await renderArchitecture({ content: warm, theme: "light", policy });
	const host = rendererHost();
	/** The solves the pool sent to a worker. */
	let sent = 0;
	let asked = 0;
	const pool = createEnginePool((): EngineWorker => {
		const worker = new Worker(
			new URL("../../../src/runtime/processes/layout-worker.ts", import.meta.url).href,
		);
		started.push(worker);
		// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
		worker.postMessage({ core: compiledCore() });
		const post = worker.postMessage.bind(worker);
		return Object.assign(worker, {
			postMessage(message: unknown): void {
				sent += 1;
				// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
				post(message);
			},
		});
	}, 2);
	installRendererHost({
		...host,
		solve: (graph, signal) => {
			asked += 1;
			return pool(graph, signal);
		},
	});
	try {
		const drawn = await renderArchitecture({ content: board("Gateway"), theme: "light", policy });
		expect(sent).toBeGreaterThan(0);
		sent = 0;
		asked = 0;
		const relabelled = await renderArchitecture({
			content: board("Gatehouse"),
			theme: "light",
			policy,
		});
		expect(asked).toBeGreaterThan(0);
		expect([relabelled.width, relabelled.height]).toEqual([drawn.width, drawn.height]);
		expect(sent).toBe(0);
	} finally {
		installRendererHost(host);
	}
});

test("a layout worker says it is ready once it instantiated the core, before it is sent a solve", async () => {
	// What this catches: a worker that never says so, which leaves the pool
	// starting its next worker only after this one answers a whole solve (TASK-527).
	const worker = new Worker(
		new URL("../../../src/runtime/processes/layout-worker.ts", import.meta.url).href,
	);
	started.push(worker);
	const said = new Promise<unknown>((resolve) => {
		worker.addEventListener("message", (event) => resolve(event.data), { once: true });
	});
	// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
	worker.postMessage({ core: compiledCore() });
	expect(await said).toEqual({ ready: true });
});

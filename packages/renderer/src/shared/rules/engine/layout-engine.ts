// The layout engine a worker runs, under Bun and in the browser alike. The
// pool's first message hands the worker the renderer core its main thread
// compiled and checked (ADR 0057); the worker instantiates it and answers each
// solve after that, one at a time, with the core's `layOutBoard`, which runs
// Graphviz in the core (ADR 0058). A solve's answer depends on its graph
// alone, so neither which worker answers it nor what that worker solved
// before changes a drawing.
//
// The core remembers the Graphviz answers of the worker's earlier solves. A
// worker tells the pool each graph a solve laid out, with its answer, and the
// pool hands every worker what the others laid out, so no worker lays a graph
// out that an earlier solve laid out on any worker (TASK-548.02).
//
// The worker accepts `{ core }` once, then `{ id, graph }` and
// `{ graphviz }`, and answers each solve with `{ id, data, graphviz }` or
// `{ id, error, fatal, graphviz }`. `graphviz` holds Graphviz answers, graph
// then answer, pair after pair.

import type * as CoreBuild from "#shared/protocol/generated/core/archboard_renderer_wasm.js";
import { engineAborted } from "#shared/rules/engine/engine-pool.ts";

/** What a worker uses of the core: one solve, and remembering what other workers laid out. */
type LayoutCore = Pick<typeof CoreBuild, "layOutBoard" | "rememberGraphvizAnswers">;

/** What a layout worker uses of its global scope. */
interface WorkerScope {
	addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
	postMessage(message: unknown): void;
}

/**
 * Whether a message hands the worker its core.
 * @param message What the pool sent.
 * @returns True for `{ core }`.
 */
function isCore(message: unknown): message is { readonly core: WebAssembly.Module } {
	return (
		typeof message === "object" &&
		message !== null &&
		"core" in message &&
		message.core instanceof WebAssembly.Module
	);
}

/**
 * Whether a message asks for one solve.
 * @param message What the pool sent.
 * @returns True for `{ id, graph }`.
 */
function isSolve(message: unknown): message is { readonly id: number; readonly graph: string } {
	return (
		typeof message === "object" &&
		message !== null &&
		"id" in message &&
		typeof message.id === "number" &&
		"graph" in message &&
		typeof message.graph === "string"
	);
}

/**
 * Whether a message hands the worker Graphviz answers other workers laid out.
 * @param message What the pool sent.
 * @returns True for `{ graphviz }`.
 */
function isGraphviz(message: unknown): message is { readonly graphviz: string[] } {
	return (
		typeof message === "object" &&
		message !== null &&
		"graphviz" in message &&
		Array.isArray(message.graphviz)
	);
}

/**
 * The answer to one solve.
 * @param engine The core, once the worker instantiated it.
 * @param id The solve's number.
 * @param graph The measured graph.
 * @returns The solved graph, or why there is none and whether the worker can
 * answer more, with the Graphviz answers the solve laid out.
 */
async function answer(engine: Promise<LayoutCore>, id: number, graph: string): Promise<unknown> {
	let core: LayoutCore;
	try {
		core = await engine;
	} catch (error) {
		return { id, error: String(error), fatal: true };
	}
	const graphviz: string[] = [];
	try {
		return { id, data: core.layOutBoard(graph, graphviz), graphviz };
	} catch (error) {
		return { id, error: String(error), fatal: engineAborted(error), graphviz };
	}
}

/**
 * Serve the layout engine in this worker.
 * @param scope The worker's global scope.
 * @param instantiate Instantiates the core the pool handed over.
 */
export function serveLayoutEngine(
	scope: WorkerScope,
	instantiate: (core: WebAssembly.Module) => LayoutCore | Promise<LayoutCore>,
): void {
	let ready: Promise<LayoutCore> = Promise.reject(
		new Error("The layout worker was asked to solve before it was handed the renderer core."),
	);
	ready.catch(() => undefined);
	let queue: Promise<void> = Promise.resolve();
	scope.addEventListener("message", (event) => {
		const message = event.data;
		if (isCore(message)) {
			ready = Promise.resolve().then(() => instantiate(message.core));
			ready.catch(() => undefined);
			return;
		}
		const engine = ready;
		if (isGraphviz(message)) {
			// In turn with the solves: a solve sent after these answers finds them.
			queue = queue.then(async () => {
				try {
					(await engine).rememberGraphvizAnswers(message.graphviz);
				} catch {
					// A core that never started or aborted refuses the next solve itself.
				}
				return undefined;
			});
			return;
		}
		if (!isSolve(message)) return;
		queue = queue.then(async () => {
			const reply = await answer(engine, message.id, message.graph);
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
			scope.postMessage(reply);
			return undefined;
		});
	});
}

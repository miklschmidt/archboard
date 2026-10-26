// The layout engine a worker runs, under Bun and in the browser alike. The
// pool's first message hands the worker the renderer core its main thread
// compiled and checked (ADR 0057); the worker instantiates it and answers each
// solve after that, one at a time, with the core's `layOutBoard`, which runs
// Graphviz in the core (ADR 0058). A solve's answer depends on its graph
// alone, so neither which worker answers it nor what that worker solved
// before changes a drawing.
//
// The worker accepts `{ core }` once, then `{ id, graph }`, and answers each
// solve with `{ id, data }` or `{ id, error, fatal }`. It says `{ ready: true }`
// once it instantiated the core, so the pool can start its next worker then
// (TASK-527).

import { engineAborted } from "#shared/rules/engine/engine-pool.ts";

/** One solve: a measured graph, its root options naming how it is laid out, in; its geometry out, each as the core writes it. */
type Solve = (graph: string) => string;

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
 * The answer to one solve.
 * @param engine The core's solve, once the worker instantiated it.
 * @param id The solve's number.
 * @param graph The measured graph.
 * @returns The solved graph, or why there is none and whether the worker can answer more.
 */
async function answer(engine: Promise<Solve>, id: number, graph: string): Promise<unknown> {
	let solve: Solve;
	try {
		solve = await engine;
	} catch (error) {
		return { id, error: String(error), fatal: true };
	}
	try {
		return { id, data: solve(graph) };
	} catch (error) {
		return { id, error: String(error), fatal: engineAborted(error) };
	}
}

/**
 * Serve the layout engine in this worker.
 * @param scope The worker's global scope.
 * @param instantiate Instantiates the core the pool handed over, answering its `layOutBoard`.
 */
export function serveLayoutEngine(
	scope: WorkerScope,
	instantiate: (core: WebAssembly.Module) => Solve | Promise<Solve>,
): void {
	let ready: Promise<Solve> = Promise.reject(
		new Error("The layout worker was asked to solve before it was handed the renderer core."),
	);
	ready.catch(() => undefined);
	let queue: Promise<void> = Promise.resolve();
	scope.addEventListener("message", (event) => {
		const message = event.data;
		if (isCore(message)) {
			ready = Promise.resolve().then(() => instantiate(message.core));
			ready.then(
				// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
				() => scope.postMessage({ ready: true }),
				() => undefined,
			);
			return;
		}
		if (!isSolve(message)) return;
		const engine = ready;
		queue = queue.then(async () => {
			const reply = await answer(engine, message.id, message.graph);
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
			scope.postMessage(reply);
			return undefined;
		});
	});
}

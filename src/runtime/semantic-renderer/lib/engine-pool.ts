// A few private Bun workers own the synchronous Graphviz/libavoid engine pair.
// Candidate drawings can solve concurrently, while each worker processes its
// own messages in order. Idle workers do not keep a CLI process alive.

import { availableParallelism } from "node:os";
import type { RendererHost } from "@/transformers/semantic-renderer/host";

type Solve = RendererHost["solve"];
type Graph = Parameters<Solve>[0];

interface EngineAnswer {
	readonly id: number;
	readonly data?: Graph;
	readonly error?: string;
	readonly fatal?: boolean;
}

interface PooledEngine {
	readonly worker: Worker & Pick<Bun.Worker, "ref" | "unref">;
	readonly waiting: Map<
		number,
		{ resolve: (graph: Graph) => void; reject: (error: Error) => void }
	>;
	answered: boolean;
}

/**
 * Deliver one worker reply to its waiting solve.
 * @param pending The solve waiting for this answer.
 * @param pending.resolve Accepts the solved graph.
 * @param pending.reject Rejects a failed solve.
 * @param answer The worker's answer.
 */
function settleAnswer(
	pending: { resolve: (graph: Graph) => void; reject: (error: Error) => void },
	answer: EngineAnswer,
): void {
	if (answer.error !== undefined) pending.reject(new Error(answer.error));
	else if (answer.data === undefined)
		pending.reject(new Error("The layout worker answered with no graph"));
	else pending.resolve(answer.data);
}

const ceiling = Math.max(1, availableParallelism() - 1);
const engines: PooledEngine[] = [];
let nextId = 0;

/**
 * Check native process lifetime controls.
 * @param worker The Bun worker.
 * @returns Whether it exposes process lifetime controls.
 */
function hasProcessLifetime(worker: Worker): worker is Worker & Pick<Bun.Worker, "ref" | "unref"> {
	return (
		"ref" in worker &&
		typeof worker.ref === "function" &&
		"unref" in worker &&
		typeof worker.unref === "function"
	);
}

/**
 * Evict a stopped worker and reject its pending solves.
 * @param engine The failed worker.
 * @param reason Its failure.
 */
function discard(engine: PooledEngine, reason: string): void {
	const index = engines.indexOf(engine);
	if (index < 0) return;
	engines.splice(index, 1);
	for (const pending of engine.waiting.values()) pending.reject(new Error(reason));
	engine.waiting.clear();
	engine.worker.terminate();
}

/**
 * Start an engine worker.
 * @returns One worker with message and failure listeners installed.
 */
function start(): PooledEngine {
	const worker = new Worker(new URL("./layout-worker.ts", import.meta.url).href);
	if (!hasProcessLifetime(worker)) {
		worker.terminate();
		throw new Error("Architecture layout requires Bun's worker ref/unref lifecycle API");
	}
	const engine: PooledEngine = { worker, waiting: new Map(), answered: false };
	worker.addEventListener("message", (event: MessageEvent<EngineAnswer>) => {
		const answer = event.data;
		if (typeof answer.id !== "number") return;
		const pending = engine.waiting.get(answer.id);
		if (pending === undefined) return;
		engine.waiting.delete(answer.id);
		engine.answered = true;
		settleAnswer(pending, answer);
		if (answer.fatal) discard(engine, answer.error ?? "The layout worker could not initialize");
	});
	worker.addEventListener("error", (event: ErrorEvent) => {
		discard(engine, event.message || "The layout worker stopped");
	});
	engines.push(engine);
	return engine;
}

/**
 * Select an engine for the next solve.
 * @returns An idle, newly started, or least busy worker.
 */
function engineForSolve(): PooledEngine {
	const idle = engines.find((engine) => engine.waiting.size === 0);
	if (idle !== undefined) return idle;
	// Delay pool growth until the first worker has initialized both WASM engines.
	if (engines.length < ceiling && engines.every((engine) => engine.answered)) return start();
	return engines.toSorted((a, b) => a.waiting.size - b.waiting.size)[0]!;
}

/**
 * Solve one graph on a worker, keeping Bun alive only for pending work.
 * @param graph The measured graph.
 * @param layoutOptions Options for placement.
 * @returns The solved graph.
 */
function solveOnEngine(graph: Graph, layoutOptions: Parameters<Solve>[1]): ReturnType<Solve> {
	const engine = engineForSolve();
	const id = nextId++;
	engine.worker.ref();
	return new Promise<Graph>((resolve, reject) => {
		engine.waiting.set(id, { resolve, reject });
		try {
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- Bun Worker has no target origin
			engine.worker.postMessage({ id, graph, layoutOptions });
		} catch (error) {
			engine.waiting.delete(id);
			reject(error);
		}
	}).finally(() => {
		if (engine.waiting.size === 0 && engines.includes(engine)) engine.worker.unref();
	});
}

export { solveOnEngine };

// The layout engine in the browser: a few Web Workers, each running the
// engine and answering one solve at a time.
//
// A render settles several candidate drawings, and a worker answers its
// messages in order, so one worker would queue every candidate behind every
// other. The pool starts a worker only when a solve finds every running one
// busy, up to one fewer than the cores the browser reports, so a small board
// starts one and a wide one spreads its candidates out. The engine is
// deterministic: which worker answers a solve never changes the drawing.
//
// The workers speak the elkjs worker protocol, which the engine's own worker
// entry answers: `{ id, cmd: "layout", graph, layoutOptions }` in, and
// `{ id, data }` or `{ id, error }` back.

import type { RendererHost } from "@/transformers/semantic-renderer/host";

/** What one solve takes and gives, as the renderer host states it. */
type Solve = RendererHost["solve"];
type SolveGraph = Parameters<Solve>[0];

/** What a worker answers one message with. */
interface EngineAnswer {
	readonly id: number;
	readonly data?: SolveGraph;
	readonly error?: { readonly message?: string } | string;
}

/** What the pool uses of a worker: sending it a solve and hearing it answer or stop. */
interface EngineWorker {
	postMessage(message: unknown): void;
	addEventListener(type: "message" | "error", listener: (event: Event) => void): void;
}

/**
 * Whether a message event carries an engine answer.
 * @param event The event.
 * @returns True for an answer with a numeric id.
 */
function isAnswer(event: Event): event is MessageEvent<EngineAnswer> {
	if (!(event instanceof MessageEvent)) return false;
	const data: unknown = event.data;
	return typeof data === "object" && data !== null && "id" in data && typeof data.id === "number";
}

/** One worker, and the solves it has been sent and not yet answered. */
interface PooledEngine {
	readonly worker: EngineWorker;
	readonly waiting: Map<
		number,
		{ resolve: (graph: SolveGraph) => void; reject: (error: Error) => void }
	>;
}

/**
 * How many workers may solve at once: every core the browser reports but one,
 * and at least one. Read from the browser, never fixed for one machine.
 * @param reported `navigator.hardwareConcurrency`, which a browser may withhold.
 * @returns The pool's ceiling.
 */
function workerCeiling(reported: number | undefined): number {
	return Math.max(1, (reported ?? 2) - 1);
}

/**
 * The error a worker's refusal stands for, with its message kept.
 * @param error What the worker sent.
 * @returns An error to reject the solve with.
 */
function engineError(error: NonNullable<EngineAnswer["error"]>): Error {
	const message = typeof error === "string" ? error : error.message;
	return new Error(message ?? "The layout engine failed without saying why.");
}

/**
 * A pool of engine workers.
 * @param startWorker Starts one engine worker.
 * @param ceiling The most workers that may run.
 * @returns The solve the renderer host uses.
 */
function createEnginePool(startWorker: () => EngineWorker, ceiling: number): Solve {
	const engines: PooledEngine[] = [];
	let nextId = 0;

	/**
	 * Start one worker and listen for its answers.
	 * @returns The pooled worker.
	 */
	function start(): PooledEngine {
		const engine: PooledEngine = { worker: startWorker(), waiting: new Map() };
		engine.worker.addEventListener("message", (event) => {
			if (!isAnswer(event)) return;
			const answer = event.data;
			const pending = engine.waiting.get(answer.id);
			if (pending === undefined) return;
			engine.waiting.delete(answer.id);
			if (answer.error !== undefined) pending.reject(engineError(answer.error));
			else if (answer.data === undefined)
				pending.reject(engineError("The layout engine answered with nothing."));
			else pending.resolve(answer.data);
		});
		engine.worker.addEventListener("error", (event) => {
			const said = event instanceof ErrorEvent ? event.message : "";
			const failure = engineError(said === "" ? "The layout engine worker stopped." : said);
			for (const pending of engine.waiting.values()) pending.reject(failure);
			engine.waiting.clear();
		});
		engines.push(engine);
		return engine;
	}

	/**
	 * The idle worker, a new one while the ceiling allows, or the least busy.
	 * @returns The worker to send a solve to.
	 */
	function engineForSolve(): PooledEngine {
		const idle = engines.find((engine) => engine.waiting.size === 0);
		if (idle !== undefined) return idle;
		if (engines.length < ceiling) return start();
		return engines.toSorted((one, other) => one.waiting.size - other.waiting.size)[0]!;
	}

	return (graph, layoutOptions) => {
		const engine = engineForSolve();
		const id = nextId;
		nextId += 1;
		return new Promise<SolveGraph>((resolve, reject) => {
			engine.waiting.set(id, { resolve, reject });
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin; the rule is about window.postMessage
			engine.worker.postMessage({ id, cmd: "layout", graph, layoutOptions });
		});
	};
}

export { createEnginePool, workerCeiling, type EngineWorker };

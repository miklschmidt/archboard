// The layout engine's workers, in the browser and under Bun alike: a few
// workers, each running the Graphviz/libavoid engine pair and answering one
// solve at a time.
//
// A render settles several candidate drawings, and a worker answers its
// messages in order, so one worker would queue every candidate behind every
// other. The pool starts a worker only when a solve finds every running one
// busy and none of them still starting, up to one fewer than the cores the
// place reports, so a small board starts one and a wide one spreads its
// candidates out without compiling the engine a dozen times at once. The engine
// is deterministic: which worker answers a solve never changes the drawing.
//
// An engine that aborts stays aborted: every later solve on that worker fails
// the same way. A worker whose engine aborted or failed to start, or that
// stopped, is replaced, and each solve it held is sent once more to another
// worker; a solve that fails a second time is refused with the engine's words.
//
// The workers accept `{ id, graph, layoutOptions }` and answer with
// `{ id, data }` or `{ id, error, fatal }`.

import type { RendererHost } from "@/transformers/semantic-renderer/host";

/** What one solve takes and gives, as the renderer host states it. */
type Solve = RendererHost["solve"];
type SolveGraph = Parameters<Solve>[0];

/** What a worker answers one message with. */
interface EngineAnswer {
	readonly id: number;
	readonly data?: SolveGraph;
	readonly error?: { readonly message?: string } | string;
	/** Whether the worker can answer nothing more: its engine aborted or never started. */
	readonly fatal?: boolean;
}

/**
 * What the pool uses of a worker: sending it a solve, hearing it answer or
 * stop, and, under Bun, keeping the process alive only while it holds work.
 */
interface EngineWorker {
	postMessage(message: unknown): void;
	addEventListener(type: "message" | "error", listener: (event: Event) => void): void;
	terminate?(): void;
	ref?(): void;
	unref?(): void;
}

/** A solve sent to a worker and not yet answered. */
interface Pending {
	readonly graph: SolveGraph;
	readonly layoutOptions: Parameters<Solve>[1];
	readonly resolve: (graph: SolveGraph) => void;
	readonly reject: (error: Error) => void;
	/** Whether it was sent once more after its first worker failed. */
	readonly retried: boolean;
}

/** One worker, and the solves it has been sent and not yet answered. */
interface PooledEngine {
	readonly worker: EngineWorker;
	/** Whether it has answered anything yet, which is when its engine is compiled. */
	answered: boolean;
	readonly waiting: Map<number, Pending>;
}

/**
 * Whether an engine error means the engine can answer nothing more: a trap in
 * its WebAssembly, or an Emscripten runtime that aborted.
 * @param error What a solve threw.
 * @returns True when the worker must be replaced.
 */
function engineAborted(error: unknown): boolean {
	return error instanceof WebAssembly.RuntimeError || /\babort/iu.test(String(error));
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

/**
 * How many workers may solve at once: every core the place reports but one,
 * and at least one. Read from the place, never fixed for one machine.
 * @param reported The cores reported, which a browser may withhold.
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
 * Deliver an answer from a worker that can go on answering to its solve.
 * @param pending The solve.
 * @param answer What the worker answered.
 */
function settle(pending: Pending, answer: EngineAnswer): void {
	if (answer.error !== undefined) pending.reject(engineError(answer.error));
	else if (answer.data === undefined)
		pending.reject(engineError("The layout engine answered with nothing."));
	else pending.resolve(answer.data);
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
	 * Evict a failed worker: each solve it held goes once more to another
	 * worker, and a solve already sent twice is refused.
	 * @param engine The failed worker.
	 * @param failure Why it failed.
	 */
	function discard(engine: PooledEngine, failure: Error): void {
		const index = engines.indexOf(engine);
		if (index < 0) return;
		engines.splice(index, 1);
		const held = [...engine.waiting.values()];
		engine.waiting.clear();
		engine.worker.terminate?.();
		for (const pending of held) retryOrRefuse(pending, failure);
	}

	/**
	 * Send a solve whose worker failed once more, or refuse one already sent twice.
	 * @param pending The solve.
	 * @param failure Why its worker failed.
	 */
	function retryOrRefuse(pending: Pending, failure: Error): void {
		if (pending.retried) pending.reject(failure);
		else send({ ...pending, retried: true });
	}

	/**
	 * Hear one worker's answer.
	 * @param engine The worker.
	 * @param answer What it answered.
	 */
	function hear(engine: PooledEngine, answer: EngineAnswer): void {
		const pending = engine.waiting.get(answer.id);
		if (pending === undefined) return;
		engine.waiting.delete(answer.id);
		engine.answered = true;
		if (engine.waiting.size === 0) engine.worker.unref?.();
		if (answer.fatal !== true) settle(pending, answer);
		else {
			const failure = engineError(answer.error ?? "The layout worker stopped answering.");
			discard(engine, failure);
			retryOrRefuse(pending, failure);
		}
	}

	/**
	 * Start one worker and listen for its answers.
	 * @returns The pooled worker.
	 */
	function start(): PooledEngine {
		const engine: PooledEngine = { worker: startWorker(), answered: false, waiting: new Map() };
		engine.worker.addEventListener("message", (event) => {
			if (isAnswer(event)) hear(engine, event.data);
		});
		engine.worker.addEventListener("error", (event) => {
			const said = event instanceof ErrorEvent ? event.message : "";
			discard(engine, engineError(said === "" ? "The layout engine worker stopped." : said));
		});
		engines.push(engine);
		return engine;
	}

	/**
	 * The idle worker, a new one while the ceiling allows and none is still
	 * starting, or the least busy.
	 * @returns The worker to send a solve to.
	 */
	function engineForSolve(): PooledEngine {
		const idle = engines.find((engine) => engine.waiting.size === 0);
		if (idle !== undefined) return idle;
		// One worker starting at a time: a worker that has not answered is still
		// compiling the engine, and starting another beside it only compiles it again.
		if (engines.length < ceiling && engines.every((engine) => engine.answered)) return start();
		return engines.toSorted((one, other) => one.waiting.size - other.waiting.size)[0]!;
	}

	/**
	 * Send one solve to a worker.
	 * @param pending The solve.
	 */
	function send(pending: Pending): void {
		const engine = engineForSolve();
		const id = nextId;
		nextId += 1;
		engine.waiting.set(id, pending);
		engine.worker.ref?.();
		try {
			const { graph, layoutOptions } = pending;
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin; the rule is about window.postMessage
			engine.worker.postMessage({ id, graph, layoutOptions });
		} catch (error) {
			engine.waiting.delete(id);
			pending.reject(error instanceof Error ? error : new Error(String(error)));
		}
	}

	return (graph, layoutOptions) =>
		new Promise<SolveGraph>((resolve, reject) => {
			send({ graph, layoutOptions, resolve, reject, retried: false });
		});
}

export { createEnginePool, engineAborted, workerCeiling, type EngineWorker };

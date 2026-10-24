// The layout engine's workers, in the browser and under Bun alike: a few
// workers, each running the Graphviz/libavoid engine pair and solving one
// graph at a time.
//
// A render settles several candidate drawings, and a worker answers its
// messages in order, so one worker would hold every candidate behind every
// other. A solve waits in the pool until a worker is free and goes to the
// first that is: how long the solve a busy worker holds takes is known only
// when it answers, and a candidate sent behind a long one waited for it while
// another worker stood idle (TASK-377). The pool starts a worker only when a
// solve finds every running one busy and none of them still starting, up to
// one fewer than the cores the place reports, so a small board starts one and
// a wide one spreads its candidates out without compiling the engine a dozen
// times at once. A worker is starting until it says its engine is loaded, not
// until it answers its first solve: a first render waited for that whole
// solve before it started a second worker, while every other solve it asked
// for waited behind it (Archboard server routes, Track, TASK-527). Each solve starts from the engine's memory as it was loaded
// (`loadLayoutEngine`), so neither which worker answers a solve nor what that
// worker solved before changes the drawing.
//
// An engine that aborts stays aborted: every later solve on that worker fails
// the same way. A worker whose engine aborted or failed to start, or that
// stopped, is replaced, and the solve it held waits once more for another
// worker; a solve that fails a second time is refused with the engine's words.
//
// A solve asked for ahead can be called off while it waits for a worker: a
// render that no longer needs it frees the worker for one it does. A worker
// that answers or fails a solve that can be called off, while the next one
// waiting can be too, takes it one task later, so the caller weighs the
// answer and calls off what it no longer needs before a worker starts it.
// The queue keeps its order.
//
// A worker may tell what a solve found before it answers. A caller that
// hears a solve weighs what it tells and may call it off while a worker holds
// it: that worker is stopped, so it spends no more of the place's cores on a
// drawing nobody will read, and a worker is started again only when a solve
// waits for one (TASK-527).
//
// The workers accept `{ id, graph, layoutOptions }` and answer with
// `{ id, data }` or `{ id, error, fatal }`, and may tell `{ id, told }` on
// the way. A worker says `{ ready: true }` once its engine is loaded.

import type { RendererHost } from "#shared/rules/render/host.ts";

/** What one solve takes and gives, as the renderer host states it. */
type Solve = RendererHost["solve"];
type SolveGraph = Parameters<Solve>[0];
/** What a worker tells of a solve before it answers, as root options. */
type Told = Parameters<NonNullable<Parameters<Solve>[3]>>[0];

/** What a worker answers one message with. */
interface EngineAnswer {
	readonly id: number;
	readonly data?: SolveGraph;
	readonly error?: { readonly message?: string } | string;
	/** Whether the worker can answer nothing more: its engine aborted or never started. */
	readonly fatal?: boolean;
	/** What it tells of the solve before it answers. */
	readonly told?: Told;
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
	readonly signal: AbortSignal | undefined;
	readonly cancel: () => void;
	readonly resolve: (graph: SolveGraph) => void;
	readonly reject: (error: Error) => void;
	/** Hears what the worker tells of it before it answers; a worker holding a solve somebody hears stops it once it is called off. */
	readonly hear: ((told: Told) => void) | undefined;
	/** Whether it was sent once more after its first worker failed. */
	readonly retried: boolean;
}

/** One worker, and the solve it was sent and has not answered yet. */
interface PooledEngine {
	readonly worker: EngineWorker;
	/** Whether its engine is compiled: it said its engine is loaded, or it answered. */
	started: boolean;
	solving?: Solving | undefined;
}

/** The solve a worker holds, and, for one somebody hears, what stops it once it is called off. */
interface Solving {
	readonly id: number;
	readonly pending: Pending;
	readonly stop?: () => void;
}

/**
 * A solve a worker no longer holds: what would stop it is no longer listening.
 * @param solving The solve.
 */
function released(solving: Solving): void {
	if (solving.stop !== undefined)
		solving.pending.signal?.removeEventListener("abort", solving.stop);
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
 * Whether a message event says that a worker's engine is loaded.
 * @param event The event.
 * @returns True for `{ ready: true }`.
 */
function isReady(event: Event): boolean {
	if (!(event instanceof MessageEvent)) return false;
	const data: unknown = event.data;
	return typeof data === "object" && data !== null && "ready" in data && data.ready === true;
}

/**
 * Whether a worker's message tells what a solve found, rather than answering it.
 * @param answer The message.
 * @returns True when it tells.
 */
function tells(answer: EngineAnswer): answer is EngineAnswer & { readonly told: Told } {
	return answer.told !== undefined && answer.data === undefined && answer.error === undefined;
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
 * What a failure to send a solve is refused with.
 * @param error What sending threw.
 * @returns It, as an error.
 */
function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
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
	/** Solves no worker is free for yet, in the order they were asked. */
	const queued: Pending[] = [];
	let nextId = 0;
	let handoff: MessageChannel | undefined;

	/** Let a cancellable caller finish selecting before queued speculation starts. */
	function handOff(): void {
		if (handoff !== undefined) return;
		const channel = new MessageChannel();
		handoff = channel;
		/** Release the task's ports before allowing the next dispatch. */
		const resume = (): void => {
			channel.port1.close();
			channel.port2.close();
			handoff = undefined;
			dispatch();
		};
		channel.port1.addEventListener("message", resume, { once: true });
		channel.port1.start();
		channel.port2.postMessage(undefined);
	}

	/**
	 * Resume the queue after an answer, allowing its caller to cancel speculation.
	 * @param pending The caller just answered, when one was answered.
	 */
	function dispatchAfter(pending: Pending | undefined): void {
		if (pending?.signal !== undefined && queued[0]?.signal !== undefined) handOff();
		else dispatch();
	}

	/**
	 * Evict a failed worker: the solve it held waits once more for another
	 * worker, or is refused when it was already sent twice.
	 * @param engine The failed worker.
	 * @param failure Why it failed.
	 */
	function discard(engine: PooledEngine, failure: Error): void {
		const index = engines.indexOf(engine);
		if (index < 0) return;
		engines.splice(index, 1);
		const solving = engine.solving;
		if (solving !== undefined) released(solving);
		engine.solving = undefined;
		engine.worker.terminate?.();
		const refused = solving === undefined ? undefined : retryOrRefuse(solving.pending, failure);
		dispatchAfter(refused);
	}

	/**
	 * Stop the worker that holds a solve somebody hears, once its caller
	 * called it off: the caller weighed what it told and needs no answer.
	 * The solve is refused with the signal's reason.
	 * @param engine The worker.
	 */
	function stop(engine: PooledEngine): void {
		const index = engines.indexOf(engine);
		const solving = engine.solving;
		if (index < 0 || solving === undefined) return;
		engines.splice(index, 1);
		released(solving);
		engine.solving = undefined;
		engine.worker.terminate?.();
		solving.pending.reject(solving.pending.signal?.reason);
		dispatch();
	}

	/**
	 * Queue a solve whose worker failed once more, or refuse one already sent twice.
	 * @param pending The solve.
	 * @param failure Why its worker failed.
	 * @returns The caller refused, or nothing when it was queued for a retry.
	 */
	function retryOrRefuse(pending: Pending, failure: Error): Pending | undefined {
		if (pending.retried) pending.reject(failure);
		else if (pending.signal?.aborted === true) pending.reject(pending.signal.reason);
		else {
			queued.push({ ...pending, retried: true });
			pending.signal?.addEventListener("abort", pending.cancel, { once: true });
			return undefined;
		}
		return pending;
	}

	/**
	 * Hear one worker's message about the solve it holds: what it tells of the
	 * solve, or its answer.
	 * @param engine The worker.
	 * @param answer What it said.
	 */
	function heardFrom(engine: PooledEngine, answer: EngineAnswer): void {
		const solving = engine.solving;
		if (solving?.id !== answer.id) return;
		engine.started = true;
		if (tells(answer)) solving.pending.hear?.(answer.told);
		else answered(engine, solving, answer);
	}

	/**
	 * Deliver the answer of the solve a worker held, and free the worker, or
	 * replace a worker that can answer nothing more.
	 * @param engine The worker.
	 * @param solving The solve it held.
	 * @param answer What it answered.
	 */
	function answered(engine: PooledEngine, solving: Solving, answer: EngineAnswer): void {
		if (answer.fatal === true) {
			discard(engine, engineError(answer.error ?? "The layout worker stopped answering."));
			return;
		}
		released(solving);
		engine.solving = undefined;
		engine.worker.unref?.();
		settle(solving.pending, answer);
		dispatchAfter(solving.pending);
	}

	/**
	 * Start one worker and listen for its answers.
	 * @returns The pooled worker.
	 */
	function start(): PooledEngine {
		const engine: PooledEngine = { worker: startWorker(), started: false };
		engine.worker.addEventListener("message", (event) => {
			if (isAnswer(event)) heardFrom(engine, event.data);
			else if (isReady(event)) {
				engine.started = true;
				dispatch();
			}
		});
		engine.worker.addEventListener("error", (event) => {
			const said = event instanceof ErrorEvent ? event.message : "";
			discard(engine, engineError(said === "" ? "The layout engine worker stopped." : said));
		});
		engines.push(engine);
		return engine;
	}

	/**
	 * The idle worker, or a new one while the ceiling allows and none is still
	 * starting.
	 * @returns The worker to send a solve to, or nothing while every one is busy.
	 */
	function freeEngine(): PooledEngine | undefined {
		const idle = engines.find((engine) => engine.solving === undefined);
		if (idle !== undefined) return idle;
		// One worker starting at a time: a worker that has not started is still
		// compiling the engine, and starting another beside it only compiles it again.
		if (engines.length < ceiling && engines.every((engine) => engine.started)) return start();
		return undefined;
	}

	/** Send the queued solves, in the order they were asked, to each worker free for one. */
	function dispatch(): void {
		if (handoff !== undefined) return;
		while (queued.length > 0) {
			const engine = freeEngine();
			if (engine === undefined) return;
			send(engine, queued.shift()!);
		}
	}

	/**
	 * The solve a worker takes: one somebody hears stops with its worker once it is called off.
	 * @param engine The worker.
	 * @param id The solve's id.
	 * @param pending The solve.
	 * @returns What the worker holds.
	 */
	function held(engine: PooledEngine, id: number, pending: Pending): Solving {
		const { signal } = pending;
		if (pending.hear === undefined || signal === undefined) return { id, pending };
		/**
		 * Stop the worker, once the solve is called off.
		 * @returns Nothing.
		 */
		const halt = (): void => stop(engine);
		signal.addEventListener("abort", halt, { once: true });
		return { id, pending, stop: halt };
	}

	/**
	 * Send one solve to a worker.
	 * @param engine The worker.
	 * @param pending The solve.
	 */
	function send(engine: PooledEngine, pending: Pending): void {
		pending.signal?.removeEventListener("abort", pending.cancel);
		const id = nextId;
		nextId += 1;
		const solving = held(engine, id, pending);
		engine.solving = solving;
		engine.worker.ref?.();
		try {
			const { graph, layoutOptions } = pending;
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin; the rule is about window.postMessage
			engine.worker.postMessage({ id, graph, layoutOptions });
		} catch (error) {
			released(solving);
			engine.solving = undefined;
			engine.worker.unref?.();
			pending.reject(asError(error));
		}
	}

	return (graph, layoutOptions, signal, hear) =>
		new Promise<SolveGraph>((resolve, reject) => {
			if (signal?.aborted === true) {
				reject(signal.reason);
				return;
			}
			/**
			 * Remove this caller's solve while it still waits for a worker: one a
			 * worker holds is answered all the same, unless somebody hears it.
			 */
			const cancel = (): void => {
				const index = queued.findIndex((pending) => pending.resolve === resolve);
				if (index < 0) return;
				queued.splice(index, 1);
				reject(signal?.reason);
			};
			queued.push({ graph, layoutOptions, signal, cancel, resolve, reject, hear, retried: false });
			signal?.addEventListener("abort", cancel, { once: true });
			dispatch();
		});
}

export { createEnginePool, engineAborted, workerCeiling, type EngineWorker };

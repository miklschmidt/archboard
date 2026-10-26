// The layout engine's workers, in the browser and under Bun alike: a few
// workers, each running the renderer core, Graphviz included, and solving
// one graph at a time.
//
// A render settles several candidate drawings, and a worker answers its
// messages in order, so one worker would hold every candidate behind every
// other. A solve waits in the pool until a worker is free and goes to the
// first that is: how long the solve a busy worker holds takes is known only
// when it answers, and a candidate sent behind a long one waited for it while
// another worker stood idle (TASK-377). The pool starts a worker only when a
// solve finds every running one busy and none of them still starting, up to
// one fewer than the cores the place reports, so a small board starts one and
// a wide one spreads its candidates out without starting a dozen workers at
// once. A solve's answer depends on its graph alone (`layout-engine.ts`), so
// neither which worker answers a solve nor what that worker solved before
// changes the drawing.
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
// Graphviz's answer depends on its graph alone (ADR 0058), and the solves of
// a render lay many of the same graphs out, as do later renders of a board
// for the graphs an edit left as they were. Each worker's core remembers what
// it laid out, and tells the pool with each answer; the pool remembers it too
// and hands it at once to every other worker, and to each worker it starts. So a
// solve sent after another's answer lays out no graph that one laid out, on
// whichever worker (TASK-548.02). Solves that run at the same time cannot
// share: a worker cannot wait for another while it solves.
//
// The pool also remembers each solve's answer by its graph, so a solve asked
// for again, as every solve of a re-render after an edit that keeps every
// card's size is, is answered at once and reaches no worker.
//
// The workers accept `{ id, graph }` and `{ graphviz }`, and answer with
// `{ id, data, graphviz }` or `{ id, error, fatal, graphviz }`, `graphviz`
// holding Graphviz answers, graph then answer, pair after pair.

import type { RendererHost } from "#shared/rules/render/host.ts";

/** What one solve takes and gives, as the renderer host states it. */
type Solve = RendererHost["solve"];

/** What a worker answers one message with: the solved graph, as the core wrote it. */
interface EngineAnswer {
	readonly id: number;
	readonly data?: string;
	readonly error?: { readonly message?: string } | string;
	/** Whether the worker can answer nothing more: its engine aborted or never started. */
	readonly fatal?: boolean;
	/** The graphs the solve laid out with Graphviz, each followed by its answer. */
	readonly graphviz?: readonly string[];
}

/**
 * The most text the pool remembers of Graphviz answers, graphs and answers
 * together, in characters: 32 Mi, the bound each worker's core keeps too
 * (`crates/archboard-renderer-wasm/src/layout.rs`). Past it, the answers
 * remembered first are forgotten first; a forgotten graph is laid out again,
 * to the same answer.
 */
const REMEMBERED_GRAPHVIZ = 32 * 1024 * 1024;

/**
 * The most text the pool remembers of solves, graphs and answers together, in
 * characters: 16 Mi. The first render of a wide board, such as Agent
 * workbench, solves about 0.5 M of it, so it holds the solves of some thirty
 * wide boards. Past it, the solves remembered first are forgotten first; a
 * forgotten solve is laid out again, to the same answer.
 */
const REMEMBERED_SOLVES = 16 * 1024 * 1024;

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
	readonly graph: string;
	readonly signal: AbortSignal | undefined;
	readonly cancel: () => void;
	readonly resolve: (graph: string) => void;
	readonly reject: (error: Error) => void;
	/** Whether it was sent once more after its first worker failed. */
	readonly retried: boolean;
}

/** One worker, and the solve it was sent and has not answered yet. */
interface PooledEngine {
	readonly worker: EngineWorker;
	/** Whether it has answered anything yet, which is when it has started. */
	answered: boolean;
	solving?: { readonly id: number; readonly pending: Pending } | undefined;
}

/**
 * Whether an engine error means the engine can answer nothing more: a trap in
 * its WebAssembly.
 * @param error What a solve threw.
 * @returns True when the worker must be replaced.
 */
function engineAborted(error: unknown): boolean {
	return error instanceof WebAssembly.RuntimeError;
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
 * Answers by the graphs they answer, oldest first, within a bound.
 * @param bound The most characters they hold, graphs and answers together.
 * @returns Reading one answer, remembering new pairs, and every pair remembered.
 */
function rememberedAnswers(bound: number) {
	const answers = new Map<string, string>();
	let size = 0;
	return {
		/**
		 * The answer remembered for a graph.
		 * @param graph The graph.
		 * @returns Its answer, or nothing when none is remembered.
		 */
		get(graph: string): string | undefined {
			return answers.get(graph);
		},
		/**
		 * Remember answers, forgetting the oldest past the bound.
		 * @param pairs Graphs, each followed by its answer.
		 * @returns The pairs not remembered before, in the same form.
		 */
		learn(pairs: readonly string[]): string[] {
			const fresh: string[] = [];
			for (let index = 0; index + 1 < pairs.length; index += 2) {
				const graph = pairs[index]!;
				const answer = pairs[index + 1]!;
				const length = graph.length + answer.length;
				if (answers.has(graph) || length > bound) continue;
				for (const [oldest, forgotten] of answers) {
					if (size + length <= bound) break;
					answers.delete(oldest);
					size -= oldest.length + forgotten.length;
				}
				answers.set(graph, answer);
				size += length;
				fresh.push(graph, answer);
			}
			return fresh;
		},
		/**
		 * Every pair remembered, to hand a worker that starts.
		 * @returns Graphs, each followed by its answer, oldest first.
		 */
		all(): string[] {
			return [...answers].flat();
		},
	};
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
	const graphviz = rememberedAnswers(REMEMBERED_GRAPHVIZ);
	const solved = rememberedAnswers(REMEMBERED_SOLVES);

	/**
	 * Remember the Graphviz answers one worker laid out, and hand the new ones
	 * to every other worker before it is sent another solve.
	 * @param source The worker that laid them out, which remembers them already.
	 * @param pairs Graphs, each followed by its answer.
	 */
	function share(source: PooledEngine, pairs: readonly string[] | undefined): void {
		if (pairs === undefined || pairs.length === 0) return;
		const fresh = graphviz.learn(pairs);
		if (fresh.length === 0) return;
		for (const engine of engines) {
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
			if (engine !== source) engine.worker.postMessage({ graphviz: fresh });
		}
	}

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
		const held = engine.solving?.pending;
		engine.solving = undefined;
		engine.worker.terminate?.();
		const refused = held === undefined ? undefined : retryOrRefuse(held, failure);
		dispatchAfter(refused);
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
	 * Hear one worker's answer.
	 * @param engine The worker.
	 * @param answer What it answered.
	 */
	function hear(engine: PooledEngine, answer: EngineAnswer): void {
		const solving = engine.solving;
		if (solving?.id !== answer.id) return;
		engine.answered = true;
		share(engine, answer.graphviz);
		if (answer.fatal === true) {
			discard(engine, engineError(answer.error ?? "The layout worker stopped answering."));
			return;
		}
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
		const engine: PooledEngine = { worker: startWorker(), answered: false };
		const remembered = graphviz.all();
		// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
		if (remembered.length > 0) engine.worker.postMessage({ graphviz: remembered });
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
	 * The idle worker, or a new one while the ceiling allows and none is still
	 * starting.
	 * @returns The worker to send a solve to, or nothing while every one is busy.
	 */
	function freeEngine(): PooledEngine | undefined {
		const idle = engines.find((engine) => engine.solving === undefined);
		if (idle !== undefined) return idle;
		// One worker starting at a time: a worker that has not answered is still
		// loading its script and instantiating the core, and a solve sent to it waits for that.
		if (engines.length < ceiling && engines.every((engine) => engine.answered)) return start();
		return undefined;
	}

	/** Send the queued solves, in the order they were asked, to each worker free for one. */
	function dispatch(): void {
		if (handoff !== undefined) return;
		while (queued.length > 0) {
			let engine: PooledEngine | undefined;
			try {
				engine = freeEngine();
			} catch (error) {
				refuseQueued(error);
				return;
			}
			if (engine === undefined) return;
			send(engine, queued.shift()!);
		}
	}

	/**
	 * Refuse the waiting solves when no worker can be started. A later call
	 * can try again without dispatching work whose caller already failed.
	 * @param error Why the worker could not start.
	 */
	function refuseQueued(error: unknown): void {
		const failure = error instanceof Error ? error : new Error(String(error));
		for (const pending of queued.splice(0)) {
			pending.signal?.removeEventListener("abort", pending.cancel);
			pending.reject(failure);
		}
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
		engine.solving = { id, pending };
		engine.worker.ref?.();
		try {
			const { graph } = pending;
			// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin; the rule is about window.postMessage
			engine.worker.postMessage({ id, graph });
		} catch (error) {
			engine.solving = undefined;
			engine.worker.unref?.();
			pending.reject(error instanceof Error ? error : new Error(String(error)));
		}
	}

	return (graph, signal) =>
		new Promise<string>((resolve, reject) => {
			if (signal?.aborted === true) {
				reject(signal.reason);
				return;
			}
			const known = solved.get(graph);
			if (known !== undefined) {
				resolve(known);
				return;
			}
			/**
			 * Remove this caller's solve only while it still waits for a worker:
			 * one a worker holds is answered all the same.
			 */
			const cancel = (): void => {
				const index = queued.findIndex((pending) => pending.cancel === cancel);
				if (index < 0) return;
				queued.splice(index, 1);
				reject(signal?.reason);
			};
			/**
			 * Remember the answer, so the same solve asked again reaches no worker.
			 * @param answer The solved graph.
			 */
			const remember = (answer: string): void => {
				solved.learn([graph, answer]);
				resolve(answer);
			};
			queued.push({ graph, signal, cancel, resolve: remember, reject, retried: false });
			signal?.addEventListener("abort", cancel, { once: true });
			dispatch();
		});
}

export { createEnginePool, engineAborted, workerCeiling, type EngineWorker };

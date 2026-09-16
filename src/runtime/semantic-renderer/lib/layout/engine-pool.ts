// The layout engine, run in a few private workers.
//
// One render settles several candidate drawings of a board (its readings, its
// flank rules, each with its label reservations) and a worker answers its
// messages one at a time, so with a single worker every candidate queued
// behind every other. A few workers let independent candidates solve at once
// (docs/design/layout-rules.md section 22). The engine is deterministic, so
// which worker answers a solve never changes the drawing.

import { availableParallelism } from "node:os";
import ELK from "elkjs/lib/elk-api.js";
import type { ElkNode, LayoutOptions } from "elkjs/lib/elk-api";

/**
 * The most workers that may solve at once: every core the host offers but
 * one, read from the host (macOS or Linux alike) rather than fixed for one
 * machine. Workers start only when a solve finds every running one busy, so a
 * render that never has more than a few candidates in hand starts only a few.
 */
const WORKERS = Math.max(1, availableParallelism() - 1);

/**
 * Use the supported worker transport: Bun's main thread exposes `self`, which
 * the vendor's fake-worker detection otherwise mistakes for a worker scope.
 * @returns A private worker running the installed layout engine.
 * @throws {Error} When the runtime has no worker lifetime control.
 */
function layoutWorker(): Worker & Pick<Bun.Worker, "ref" | "unref"> {
	// The repository also compiles DOM code, whose ambient Worker declaration
	// hides Bun's ref/unref extensions. This server boundary always runs in Bun.
	const worker = new Worker(import.meta.resolve("elkjs/lib/elk-worker.js"));
	if (!hasProcessLifetime(worker)) {
		worker.terminate();
		throw new Error("Architecture layout requires Bun's worker ref/unref lifecycle API");
	}
	return worker;
}

/**
 * Narrow only Bun's process-lifetime additions to the standard worker API.
 * @param worker The worker created at this runtime boundary.
 * @returns Whether the worker provides the two native lifetime methods.
 */
function hasProcessLifetime(worker: Worker): worker is Worker & Pick<Bun.Worker, "ref" | "unref"> {
	return (
		"ref" in worker &&
		typeof worker.ref === "function" &&
		"unref" in worker &&
		typeof worker.unref === "function"
	);
}

/** One worker, and how many solves it has in hand. */
interface LayoutEngine {
	readonly worker: ReturnType<typeof layoutWorker>;
	readonly engine: InstanceType<typeof ELK>;
	pending: number;
}

const engines: LayoutEngine[] = [];

/**
 * The least busy worker, started on the first request that finds every
 * existing one busy.
 * @returns The worker to send a solve to.
 */
function engineForSolve(): LayoutEngine {
	const idle = engines.find((engine) => engine.pending === 0);
	if (idle !== undefined) return idle;
	if (engines.length < WORKERS) {
		const worker = layoutWorker();
		/**
		 * Supply the already owned worker to the vendor API.
		 * @returns The native worker whose lifetime this module owns.
		 */
		const workerFactory = (): Worker => worker;
		const engine = {
			worker,
			engine: new ELK({ algorithms: ["layered"], workerFactory }),
			pending: 0,
		};
		engines.push(engine);
		return engine;
	}
	return engines.toSorted((one, other) => one.pending - other.pending)[0]!;
}

/**
 * Solve one graph, keeping the process alive only while a worker has a solve
 * in hand.
 * @param graph The complete measured graph.
 * @param layoutOptions The options for this solve.
 * @returns Its solved geometry.
 */
async function solveOnEngine(graph: ElkNode, layoutOptions: LayoutOptions): Promise<ElkNode> {
	const owner = engineForSolve();
	owner.pending += 1;
	owner.worker.ref();
	try {
		return await owner.engine.layout(graph, { layoutOptions });
	} finally {
		owner.pending -= 1;
		if (owner.pending === 0) {
			owner.worker.unref();
		}
	}
}

export { solveOnEngine };

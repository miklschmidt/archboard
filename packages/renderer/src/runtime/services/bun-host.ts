// The renderer's host under Bun: the CLI, the rasterizer and the Archboard
// server's render route.
//
// The layout engine is a pool of Bun Workers, each handed the core this
// thread compiled; the theme colours are read from the shared stylesheet on
// disk; the core is this checkout's build of it, and it measures and draws
// every word itself.
//
// The pool runs no more workers than JavaScriptCore has fast WebAssembly
// memories for. A process gets eight memories that grow in place. Every one
// after them is bounds-checked: each grow copies the whole memory, 4 to 16 ms
// a page for a solve's memory, and its solves run about 20% slower. This
// thread's core holds one fast memory, and the code check's tree-sitter holds
// another in the Archboard server, so six are left for workers (TASK-548.05).
// A worker that stops gives its memory back. A browser has no such limit.

import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { readThemeColors } from "#runtime/store/theme/read.ts";
import { THEME_STYLESHEET } from "#runtime/store/assets.ts";
import { installRendererHost } from "#shared/rules/render/host.ts";
import {
	createEnginePool,
	workerCeiling,
	type EngineWorker,
} from "#shared/rules/engine/engine-pool.ts";
import { iconPaths } from "#runtime/operations/icon-paths.ts";
import { compiledCore, loadCore, type Core } from "#runtime/services/core.ts";

let installed = false;

/** The fast WebAssembly memories left for layout workers: eight, less this thread's core and tree-sitter. */
const FAST_MEMORY_WORKERS = 6;

/**
 * How many layout workers the Bun host runs: one fewer than the cores, and
 * no more than the fast WebAssembly memories left for them.
 * @param cores The cores the machine reports.
 * @returns The pool's ceiling.
 */
function bunWorkerCeiling(cores: number): number {
	return Math.min(workerCeiling(cores), FAST_MEMORY_WORKERS);
}

/** The core, once something asked for it. */
let core: Core | undefined;

/**
 * The renderer core, loaded on first use.
 * @returns The core.
 * @throws {CoreBuildError} When there is no build, or it was made from other sources.
 */
function loadedCore(): Core {
	core ??= loadCore();
	return core;
}

/**
 * Start one engine worker, handed the core this thread compiled and checked,
 * which keeps Bun alive only while it holds a solve.
 * @returns The worker.
 * @throws {CoreBuildError} When there is no build, or it was made from other sources.
 * @throws {Error} When this Bun lacks the worker lifetime controls.
 */
function startEngineWorker(): EngineWorker {
	const module = compiledCore();
	const worker = new Worker(new URL("../processes/layout-worker.ts", import.meta.url).href);
	if (!hasProcessLifetime(worker)) {
		worker.terminate();
		throw new Error("Architecture layout requires Bun's worker ref/unref lifecycle API");
	}
	// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage has no target origin
	worker.postMessage({ core: module });
	return worker;
}

/**
 * Whether a worker has Bun's process lifetime controls.
 * @param worker The worker.
 * @returns Whether it exposes ref and unref.
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
 * Install the Bun host once: the core, the theme colours and the engine pool.
 * Every Bun entrypoint of the renderer calls this before drawing or measuring.
 */
function installBunHost(): void {
	if (installed) return;
	installRendererHost({
		core: loadedCore,
		solve: createEnginePool(startEngineWorker, bunWorkerCeiling(availableParallelism())),
		themeColors: readThemeColors(readFileSync(THEME_STYLESHEET, "utf8")),
		iconPaths,
	});
	installed = true;
}

export { bunWorkerCeiling, installBunHost };

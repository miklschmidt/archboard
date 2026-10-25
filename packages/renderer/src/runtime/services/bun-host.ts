// The renderer's host under Bun: the CLI, the rasterizer and the Archboard
// server's render route.
//
// The layout engine is a pool of Bun Workers; the theme colours are read from
// the shared stylesheet on disk; the core is this checkout's build of it, and
// it measures and draws every word itself.

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
import { loadCore, type Core } from "#runtime/services/core.ts";

let installed = false;

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
 * Start one engine worker, which keeps Bun alive only while it holds a solve.
 * @returns The worker.
 * @throws {Error} When this Bun lacks the worker lifetime controls.
 */
function startEngineWorker(): EngineWorker {
	const worker = new Worker(new URL("../processes/layout-worker.ts", import.meta.url).href);
	if (!hasProcessLifetime(worker)) {
		worker.terminate();
		throw new Error("Architecture layout requires Bun's worker ref/unref lifecycle API");
	}
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
		solve: createEnginePool(startEngineWorker, workerCeiling(availableParallelism())),
		themeColors: readThemeColors(readFileSync(THEME_STYLESHEET, "utf8")),
		iconPaths,
	});
	installed = true;
}

export { installBunHost };

// The renderer's host under Bun: the CLI, the rasterizer and the Archboard
// server's render route.
//
// Text is measured by an `@napi-rs/canvas` canvas, installed as the global
// `OffscreenCanvas` Pretext and the renderer measure with, and the four
// diagram font files are registered on it under the family names the SVG
// paints with, so a word is measured in the face a browser will draw it in.
// The layout engine is a pool of Bun Workers; the theme colours are read from
// the shared stylesheet on disk; the core is this checkout's build of it.

import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import { readThemeColors } from "#runtime/store/theme/read.ts";
import { DIAGRAM_FONTS_DIRECTORY, THEME_STYLESHEET } from "#runtime/store/assets.ts";
import { FACES } from "#shared/rules/text/fonts.ts";
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
 * Make a canvas the way `new OffscreenCanvas(width, height)` makes one: called
 * with `new`, a function that returns an object hands that object back, and an
 * `@napi-rs/canvas` canvas has the 2D context, `font` and `measureText` the
 * renderer and Pretext use.
 * @param width The canvas width.
 * @param height The canvas height.
 * @returns The canvas.
 */
function nodeOffscreenCanvas(width: number, height: number) {
	return createCanvas(width, height);
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
 * Read one diagram font file as base64.
 * @param file The file's name.
 * @returns Its bytes, base64 encoded.
 */
function fontBase64(file: string): string {
	return readFileSync(join(DIAGRAM_FONTS_DIRECTORY, file)).toString("base64");
}

/**
 * Install the Bun host once: the canvas, the diagram faces on it, the theme
 * colours and the engine pool. Every Bun entrypoint of the renderer calls this
 * before drawing or measuring.
 * @throws {Error} When a diagram font file cannot be registered.
 */
function installBunHost(): void {
	if (installed) return;
	if (typeof globalThis.OffscreenCanvas === "undefined") {
		Object.defineProperty(globalThis, "OffscreenCanvas", {
			value: nodeOffscreenCanvas,
			configurable: true,
			writable: true,
		});
	}
	for (const face of FACES) {
		if (
			GlobalFonts.registerFromPath(join(DIAGRAM_FONTS_DIRECTORY, face.file), face.cssFamily) ===
			null
		) {
			throw new Error(`Could not register the diagram font ${face.file}`);
		}
	}
	installRendererHost({
		core: loadedCore,
		solve: createEnginePool(startEngineWorker, workerCeiling(availableParallelism())),
		themeColors: readThemeColors(readFileSync(THEME_STYLESHEET, "utf8")),
		fontBase64,
		iconPaths,
	});
	installed = true;
}

export { installBunHost };

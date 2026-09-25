// The renderer's host under Bun: the CLI, the rasterizer and the Archboard
// server's render route.
//
// Text is measured by an `@napi-rs/canvas` canvas, installed as the global
// `OffscreenCanvas` Pretext and the renderer measure with, and the four
// diagram font files are registered on it under the family names the SVG
// paints with, so a word is measured in the face a browser will draw it in.
// The layout engine is a pool of Bun Workers; the theme colours are read from
// the shared stylesheet on disk.

import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import { readThemeColors } from "@/shared/theme/server";
import { FACES, installRendererHost } from "@/transformers/semantic-renderer/host";
import {
	createEnginePool,
	workerCeiling,
	type EngineWorker,
} from "@/transformers/semantic-renderer/engine-pool";
import { iconPaths } from "@/runtime/semantic-renderer/lib/icon-paths";

/** Where the diagram font files live in this checkout. */
const FONT_DIR = fileURLToPath(new URL("../../../ui/shell/assets/fonts/", import.meta.url));

let installed = false;

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
	const worker = new Worker(new URL("./layout-worker.ts", import.meta.url).href);
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
	return readFileSync(`${FONT_DIR}${file}`).toString("base64");
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
		if (GlobalFonts.registerFromPath(`${FONT_DIR}${face.file}`, face.cssFamily) === null) {
			throw new Error(`Could not register the diagram font ${face.file}`);
		}
	}
	installRendererHost({
		solve: createEnginePool(startEngineWorker, workerCeiling(availableParallelism())),
		themeColors: readThemeColors(
			readFileSync(new URL("../../../shared/theme/theme.css", import.meta.url), "utf8"),
		),
		fontBase64,
		iconPaths,
	});
	installed = true;
}

export { installBunHost };

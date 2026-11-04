// The hero's picture, painted once by the product's painter (ADR 0071) into still images that the
// table reads as its textures. The painter draws the cards, lines and labels exactly as the app
// does; the table moves, lights and raises them, so nothing is painted again after the first frame.
// A picture painted once needs no GPU: the CPU painter paints it in milliseconds, where starting
// WebGPU can hold the page for hundreds of milliseconds.
//
// A table in perspective needs more pixels near the eye than far away, so the picture is painted
// at more than one scale: the first image holds all of it, and each further image holds a part
// nearer the eye, finer.

import { startCpuPainter } from "../../../../packages/renderer/src/ui/clients/painter.ts";
import paintingUrl from "../../paintings/hero.painting.json?url";
import { plan } from "./plan";

/** A part of the picture: its left, top, right and bottom edges, 0..1 across and down it. */
export type Region = readonly [number, number, number, number];

/** One image of the picture, and the part of the picture it holds. */
export interface Level {
	readonly image: ImageBitmap;
	readonly region: Region;
}

/** The widest image a level is painted at, in pixels. */
const WIDEST = 3072;

/** The tallest image a level is painted at, in pixels. */
const TALLEST = 2048;

/**
 * A part of the picture grown to the shape of the image that holds it, which is at most
 * WIDEST × TALLEST, from its left and its bottom, which lies nearest the eye.
 * @param region The part.
 * @returns The part, and the size of its image.
 */
function sized(region: Region): { region: Region; width: number; height: number } {
	const [left, top, right, bottom] = region;
	const across = (right - left) * plan.width;
	const down = (bottom - top) * plan.height;
	const scale = Math.min(WIDEST / across, TALLEST / down);
	return {
		region,
		width: Math.round(across * scale),
		height: Math.round(down * scale),
	};
}

/**
 * Let the page run between two steps of the painting, so a scroll is not kept waiting.
 * @returns When the page has had its turn.
 */
function yieldToPage(): Promise<void> {
	return new Promise((done) => setTimeout(done, 0));
}

/**
 * Paint the picture, once for each part.
 * @param regions The parts, the whole picture first.
 * @returns The images, or null when no painter starts or the painting does not read.
 */
export async function paintPicture(regions: readonly Region[]): Promise<Level[] | null> {
	try {
		const painting = fetch(paintingUrl).then((answer) => answer.text());
		const first = document.createElement("canvas");
		const sizes = regions.map(sized);
		first.width = sizes[0]?.width ?? 1;
		first.height = sizes[0]?.height ?? 1;
		const { painter, canvas } = await startCpuPainter(first, true);
		painter.setFarLine(0, 0);
		painter.setTrafficShown(false);
		painter.show(await painting);
		const levels: Level[] = [];
		for (const { region, width, height } of sizes) {
			await yieldToPage();
			canvas.width = width;
			canvas.height = height;
			painter.resize(width, height);
			const [left, top, right] = region;
			const scale = width / ((right - left) * plan.width);
			const now = performance.now();
			painter.setCamera(-left * plan.width * scale, -top * plan.height * scale, scale, 0, now);
			painter.frame(now);
			// The image is taken in the task that painted it, while the canvas still holds the frame.
			levels.push({ image: await createImageBitmap(canvas), region });
		}
		painter.free();
		return levels;
	} catch (cause) {
		console.warn("The hero's picture did not paint.", cause);
		return null;
	}
}

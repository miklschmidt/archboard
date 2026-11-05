// The hero's picture, painted once by the product's painter (ADR 0071) into still images that the
// table reads as its textures. The painter draws the cards, lines and labels exactly as the app
// does; the table moves, lights and raises them, so nothing is painted again after the first frame.
// A picture painted once needs no GPU: the CPU painter paints it in milliseconds, where starting
// WebGPU can hold the page for hundreds of milliseconds.
//
// A table in perspective needs more pixels near the eye than far away, so the picture is painted
// at more than one scale: the first image holds all of it, and each further image holds a part
// nearer the eye, finer. The table says how fine each must be.

import { startCpuPainter } from "../../../../packages/renderer/src/ui/clients/painter.ts";
import paintingUrl from "../../paintings/hero.painting.json?url";
import { plan } from "./plan";

/** A part of the picture: its left, top, right and bottom edges, 0..1 across and down it. */
export type Region = readonly [number, number, number, number];

/** A part of the picture to paint, and how finely: pixels for each unit of the picture. */
export interface Part {
	readonly region: Region;
	readonly density: number;
}

/** One image of the picture, and the part of the picture it holds. */
export interface Level {
	readonly image: ImageBitmap;
	readonly region: Region;
}

/** The longest side an image is painted at: every GPU with WebGL2 takes it as a texture. */
const SIDE = 8192;

/** The most pixels an image is painted at: every browser takes them in one canvas. */
const AREA = 4096 * 4096;

/**
 * The size of a part's image: as fine as the part asks, as far as SIDE and AREA allow.
 * @param part The part.
 * @returns The part's region, and the size of its image.
 */
function sized({ region, density }: Part): { region: Region; width: number; height: number } {
	const [left, top, right, bottom] = region;
	const across = (right - left) * plan.width;
	const down = (bottom - top) * plan.height;
	const scale = Math.min(density, SIDE / across, SIDE / down, Math.sqrt(AREA / (across * down)));
	return {
		region,
		width: Math.max(1, Math.round(across * scale)),
		height: Math.max(1, Math.round(down * scale)),
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
 * @param parts The parts, the whole picture first.
 * @returns The images, or null when no painter starts or the painting does not read.
 */
export async function paintPicture(parts: readonly Part[]): Promise<Level[] | null> {
	try {
		const painting = fetch(paintingUrl).then((answer) => answer.text());
		const first = document.createElement("canvas");
		const sizes = parts.map(sized);
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

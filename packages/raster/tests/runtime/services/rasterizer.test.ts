import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoveredChromiumPath } from "@archboard/headless-chromium";
import { readPngDimensions } from "@archboard/render-recipe";
import { RASTER_MAX_SIDE_PX } from "#runtime/operations/bounds.ts";
import { rasterizeAll } from "#runtime/services/rasterizer.ts";
import { TEST_CHROMIUM_COLD_START_CASE_MS } from "#tests/runtime/services/cold-start-timing.ts";

// The rasterizer is held to what it promises about the bitmap: real pixels of
// the document it is given, exactly the page's size at the stated scale,
// the whole page however tall, and one Chromium for one run over the pictures,
// started only when a picture needs it and provably gone when the run ends,
// however it ends. Layout itself is the renderer's to prove.

// Every run cold-starts its own Chromium.
setDefaultTimeout(TEST_CHROMIUM_COLD_START_CASE_MS);

/** A picture as a capture takes it: a self-contained SVG and its page. */
interface Drawn {
	readonly svg: string;
	readonly width: number;
	readonly height: number;
}

/**
 * A page of one colour, with a darker band across it, as an SVG document states it.
 * @param width How wide the page is.
 * @param height How tall the page is.
 * @param ground The page's colour.
 * @returns The picture.
 */
function page(width: number, height: number, ground = "#336699"): Drawn {
	return {
		svg:
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
			`<rect width="${width}" height="${height}" fill="${ground}"/>` +
			`<rect y="${height - 20}" width="${width}" height="20" fill="#112233"/></svg>`,
		width,
		height,
	};
}

/** A page whose band slides across it forever, as a picture's traffic does. */
const MOVING: Drawn = {
	svg:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">' +
		'<rect width="200" height="100" fill="#336699"/>' +
		'<rect width="20" height="100" fill="#112233"><animate attributeName="x" from="0" to="180" dur="1s" repeatCount="indefinite"/></rect></svg>',
	width: 200,
	height: 100,
};

/**
 * Every capture of a run.
 * @param jobs The pictures.
 * @param options What the run settles.
 * @returns The captures, in order.
 */
function captureAll(
	jobs: Parameters<typeof rasterizeAll>[0],
	options?: Parameters<typeof rasterizeAll>[1],
) {
	return Array.fromAsync(rasterizeAll(jobs, options));
}

/** Whether a process is still there. */
function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/**
 * A Chromium that writes down each start, its pid and its temporary root, and then runs as the
 * real one.
 * @returns Its path, and every start it wrote down so far.
 */
function recordedChromium(): { path: string; starts: () => { pid: number; root: string }[] } {
	const root = mkdtempSync(join(tmpdir(), "archboard-raster-test-"));
	roots.push(root);
	const path = join(root, "chromium");
	const log = join(root, "starts");
	writeFileSync(
		path,
		`#!/bin/sh\nprintf '%s %s\\n' "$$" "$PWD" >> '${log}'\nexec '${discoveredChromiumPath()}' "$@"\n`,
		{ mode: 0o700 },
	);
	return {
		path,
		starts: () =>
			existsSync(log)
				? readFileSync(log, "utf8")
						.trim()
						.split("\n")
						.map((line) => {
							const [pid = "", started = ""] = line.split(" ");
							return { pid: Number(pid), root: started };
						})
				: [],
	};
}

/**
 * Whether everything a start owned is gone: its process and its temporary root.
 * @param start The start.
 * @param start.pid Its process.
 * @param start.root Its temporary root.
 * @returns Whether it is.
 */
function gone(start: { pid: number; root: string }): boolean {
	return !processExists(start.pid) && !existsSync(start.root);
}

describe("what one capture is", () => {
	test("real pixels of the document, at one bitmap pixel per page pixel", async () => {
		const drawn = page(240, 120);
		const [capture, again, other] = await captureAll([
			{ ...drawn, scale: 1 },
			{ ...drawn, scale: 1 },
			{ ...page(240, 120, "#996633"), scale: 1 },
		]);
		expect(readPngDimensions(capture!.png)).toEqual({ width: 240, height: 120 });
		expect(capture).toMatchObject({ width: 240, height: 120 });
		// The same document draws the same bytes: nothing about the capture reads a clock.
		expect(Buffer.from(again!.png).equals(Buffer.from(capture!.png))).toBe(true);
		// Another ground draws other bytes, so this is the document and not a blank page.
		expect(Buffer.from(other!.png).equals(Buffer.from(capture!.png))).toBe(false);
	});

	test("a scale multiplies the bitmap and nothing else, and captures come in the order asked", async () => {
		const drawn = page(240, 120);
		const captures = await captureAll([
			{ ...drawn, scale: 2 },
			{ ...drawn, scale: 0.5 },
		]);
		expect(captures.map(({ png }) => readPngDimensions(png))).toEqual([
			{ width: 480, height: 240 },
			{ width: 120, height: 60 },
		]);
	});

	test("the whole page is captured however far past a display it reaches", async () => {
		const [capture] = await captureAll([{ ...page(300, 4000), scale: 1 }]);
		expect(readPngDimensions(capture!.png)).toEqual({ width: 300, height: 4000 });
	});

	test("a moving document is captured paused at its start, the same every time", async () => {
		const [first, second] = await captureAll([
			{ ...MOVING, scale: 1 },
			{ ...MOVING, scale: 1 },
		]);
		expect(readPngDimensions(first!.png)).toEqual({ width: 200, height: 100 });
		expect(Buffer.from(second!.png).equals(Buffer.from(first!.png))).toBe(true);
	});

	test("a region of the page is drawn at the same scale, as a detail tile", async () => {
		const region = { x: 10, y: 10, width: 120, height: 80 };
		const [tile] = await captureAll([{ ...page(240, 120), scale: 1, region }]);
		expect(readPngDimensions(tile!.png)).toEqual({ width: 120, height: 80 });
	});
});

describe("what is refused", () => {
	test("a bitmap larger than one capture may hold, before any browser starts", async () => {
		const chromium = recordedChromium();
		const refusals = [
			{ svg: "<svg/>", width: RASTER_MAX_SIDE_PX + 1, height: 10, scale: 1 },
			{ svg: "<svg/>", width: 10, height: 10, scale: 8 },
			// A positive CSS region may round to zero bitmap pixels at an allowed
			// scale. Refuse either empty side before Chromium can stall capturing it.
			{
				svg: "<svg/>",
				width: 10,
				height: 10,
				scale: 0.25,
				region: { x: 0, y: 0, width: 1, height: 8 },
			},
			{
				svg: "<svg/>",
				width: 10,
				height: 10,
				scale: 0.25,
				region: { x: 0, y: 0, width: 8, height: 1 },
			},
			{ svg: "<svg/>", width: 0, height: 10, scale: 1 },
		];
		for (const job of refusals) {
			await expect(captureAll([job], { chromiumPath: chromium.path })).rejects.toMatchObject({
				code: "RASTER_BOUNDS_EXCEEDED",
			});
		}
		expect(chromium.starts()).toEqual([]);
	});

	test("no browser at all, by name", async () => {
		await expect(
			captureAll([{ svg: "<svg/>", width: 10, height: 10, scale: 1 }], { chromiumPath: "" }),
		).rejects.toMatchObject({ code: "RASTERIZER_UNAVAILABLE" });
	});
});

describe("how the browser is owned", () => {
	test("Chromium starts with the first picture, serves the whole run, and is gone when it ends", async () => {
		const drawn = page(240, 120);
		const chromium = recordedChromium();
		const run = rasterizeAll(
			[
				{ ...drawn, scale: 1 },
				{ ...drawn, scale: 0.5 },
			],
			{ chromiumPath: chromium.path },
		);
		expect(chromium.starts()).toEqual([]);
		const widths: number[] = [];
		for await (const capture of run) {
			widths.push(capture.width);
			expect(chromium.starts().every((start) => !gone(start))).toBe(true);
		}
		expect(widths).toEqual([240, 120]);
		const starts = chromium.starts();
		expect(starts).toHaveLength(1);
		expect(starts[0]!.root).toContain("archboard-raster-");
		expect(starts.every(gone)).toBe(true);
	});

	test("a run its caller leaves early stops its Chromium before the caller goes on", async () => {
		const drawn = page(240, 120);
		const chromium = recordedChromium();
		for await (const capture of rasterizeAll(
			[
				{ ...drawn, scale: 1 },
				{ ...drawn, scale: 1 },
			],
			{ chromiumPath: chromium.path },
		)) {
			expect(capture.width).toBe(drawn.width);
			break;
		}
		expect(chromium.starts()).toHaveLength(1);
		expect(chromium.starts().every(gone)).toBe(true);
	});

	test("a run that fails part way stops its Chromium before the failure reaches the caller", async () => {
		const drawn = page(240, 120);
		const chromium = recordedChromium();
		const failed = captureAll(
			[
				{ ...drawn, scale: 1 },
				{ svg: "<svg/>", width: RASTER_MAX_SIDE_PX + 1, height: 10, scale: 1 },
			],
			{ chromiumPath: chromium.path },
		);
		await expect(failed).rejects.toMatchObject({ code: "RASTER_BOUNDS_EXCEEDED" });
		expect(chromium.starts()).toHaveLength(1);
		expect(chromium.starts().every(gone)).toBe(true);
	});

	test("a run its caller cancels fails with the caller's reason and stops its Chromium", async () => {
		const drawn = page(240, 120);
		const chromium = recordedChromium();
		const controller = new AbortController();
		const reason = new Error("changed my mind");
		/** The pictures, the second asked for only after the caller has cancelled. */
		async function* pictures() {
			yield { ...drawn, scale: 1 };
			controller.abort(reason);
			yield { ...drawn, scale: 1 };
		}
		await expect(
			captureAll(pictures(), { chromiumPath: chromium.path, signal: controller.signal }),
		).rejects.toBe(reason);
		expect(chromium.starts()).toHaveLength(1);
		expect(chromium.starts().every(gone)).toBe(true);
	});
});

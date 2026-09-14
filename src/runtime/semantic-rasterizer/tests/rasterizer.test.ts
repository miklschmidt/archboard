import { afterAll, describe, expect, test } from "bun:test";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import { renderSemanticView, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import {
	RASTER_MAX_SIDE_PX,
	SemanticRasterError,
	boundsRefusal,
	createSemanticRasterizer,
	readPngDimensions,
	type SemanticRasterizer,
} from "@/runtime/semantic-rasterizer/index";
import { pngRgbCounts } from "./png-colors.ts";

// The rasterizer is held to what it promises about the bitmap: real pixels of
// the renderer's own picture, exactly the diagram's size at the stated scale,
// the whole page however tall, the embedded faces loaded, and a Chromium that
// is provably gone afterwards. Layout itself is the renderer's to prove.

/**
 * One variant, as its own contract reads it.
 * @param content The nodes, relationships and flows.
 * @returns The content.
 */
function variant(content: Record<string, unknown>): VariantContent {
	return VariantContentSchema.parse(content);
}

/** Two parts, one relationship that carries traffic, and one exchange between them. */
const SAMPLE = variant({
	nodes: [
		{ id: "api", name: "API", kind: "service", responsibility: "Takes requests" },
		{ id: "store", name: "Store", kind: "datastore", responsibility: "Keeps rows" },
	],
	edges: [{ id: "reads", from: "api", to: "store", kind: "call", label: "reads", traffic: {} }],
	flows: [
		{
			id: "read",
			name: "One read",
			participants: ["api", "store"],
			steps: [
				{ id: "asks", from: "api", to: "store", label: "asks", kind: "sync" },
				{ id: "answers", from: "store", to: "api", label: "answers", kind: "return" },
			],
		},
	],
});

/**
 * A chain long enough that its page is taller than any display.
 * @param length How many parts.
 * @returns The content.
 */
function tallChain(length: number): VariantContent {
	const ids = Array.from({ length }, (_, index) => `n${index}`);
	return variant({
		nodes: ids.map((id, index) => ({
			id,
			name: `Stage ${index}`,
			kind: "module",
			responsibility: `Does step ${index}`,
		})),
		edges: ids
			.slice(1)
			.map((id, index) => ({ id: `e${index}`, from: ids[index], to: id, kind: "call" })),
		flows: [],
	});
}

/**
 * Draw one diagram the way a file keeps it: faces embedded.
 * @param content What to draw.
 * @param grammar Which picture.
 * @returns The drawing.
 */
function draw(
	content: VariantContent,
	grammar: "architecture" | "data-flow" = "architecture",
): Promise<RenderedDiagram> {
	return renderSemanticView({ content, theme: "light", fonts: "embedded", grammar });
}

/**
 * Whether a process is still there.
 * @param pid The process.
 * @returns Whether a signal reaches it.
 */
function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

const rasterizers: SemanticRasterizer[] = [];

/**
 * A rasterizer this file will stop, whatever a test did.
 * @returns The rasterizer.
 */
function owned(): SemanticRasterizer {
	const rasterizer = createSemanticRasterizer();
	rasterizers.push(rasterizer);
	return rasterizer;
}

afterAll(async () => {
	await Promise.all(rasterizers.map((rasterizer) => rasterizer.stop()));
});

describe("what one capture is", () => {
	test("real pixels of the renderer's picture, at one bitmap pixel per diagram pixel", async () => {
		const drawn = await draw(SAMPLE);
		const rasterizer = owned();
		const capture = await rasterizer.rasterize({ ...drawn, scale: 1 });
		expect(readPngDimensions(capture.png)).toEqual({ width: drawn.width, height: drawn.height });
		expect(capture).toMatchObject({ width: drawn.width, height: drawn.height });
		// The light ground and the white cards are painted, so this is the picture
		// and not a blank page of the right size.
		const colors = pngRgbCounts(capture.png);
		expect(colors.get("246,245,242") ?? 0).toBeGreaterThan(1000);
		expect(colors.get("255,255,255") ?? 0).toBeGreaterThan(1000);
		// Every one of the renderer's faces was declared and loaded before the shot.
		expect(capture.fonts).toBeGreaterThan(0);
		// The same document draws the same bytes: nothing about the capture reads a clock.
		const again = await rasterizer.rasterize({ ...drawn, scale: 1 });
		expect(Buffer.from(again.png).equals(Buffer.from(capture.png))).toBe(true);
	}, 20_000);

	test("a scale multiplies the bitmap and nothing else", async () => {
		const drawn = await draw(SAMPLE);
		const doubled = await owned().rasterize({ ...drawn, scale: 2 });
		expect(readPngDimensions(doubled.png)).toEqual({
			width: drawn.width * 2,
			height: drawn.height * 2,
		});
	}, 20_000);

	test("the whole page is captured however far past a display it reaches", async () => {
		const drawn = await draw(tallChain(24));
		expect(drawn.height).toBeGreaterThan(1080);
		const capture = await owned().rasterize({ ...drawn, scale: 1 });
		expect(readPngDimensions(capture.png)).toEqual({ width: drawn.width, height: drawn.height });
		// The last card sits near the bottom of the page, so the bottom rows are
		// not blank ground: the capture reached the end of the diagram.
		const colors = pngRgbCounts(capture.png);
		expect(colors.get("255,255,255") ?? 0).toBeGreaterThan(24 * 500);
	}, 20_000);

	test("a sequence draws through the data-flow grammar with its animation paused", async () => {
		const drawn = await draw(SAMPLE, "data-flow");
		expect(drawn.svg).toContain("<animate");
		const capture = await owned().rasterize({ ...drawn, scale: 1 });
		expect(readPngDimensions(capture.png)).toEqual({ width: drawn.width, height: drawn.height });
	}, 20_000);

	test("a region of the page is drawn at the same scale, as a detail tile", async () => {
		const drawn = await draw(SAMPLE);
		const region = { x: 10, y: 10, width: 120, height: 80 };
		const tile = await owned().rasterize({ ...drawn, scale: 1, region });
		expect(readPngDimensions(tile.png)).toEqual({ width: 120, height: 80 });
	}, 20_000);
});

describe("what is refused", () => {
	test("a bitmap larger than one capture may hold, before any browser starts", async () => {
		const rasterizer = owned();
		const oversize = rasterizer.rasterize({
			svg: "<svg/>",
			width: RASTER_MAX_SIDE_PX + 1,
			height: 10,
			scale: 1,
		});
		await expect(oversize).rejects.toBeInstanceOf(SemanticRasterError);
		await expect(oversize).rejects.toMatchObject({ code: "RASTER_BOUNDS_EXCEEDED" });
		await expect(
			rasterizer.rasterize({ svg: "<svg/>", width: 10, height: 10, scale: 8 }),
		).rejects.toMatchObject({
			code: "RASTER_BOUNDS_EXCEEDED",
		});
		expect(rasterizer.status().chromiumStarts).toBe(0);
		expect(boundsRefusal({ width: 0, height: 10, scale: 1 })).not.toBeNull();
		expect(boundsRefusal({ width: 10, height: 10, scale: 1 })).toBeNull();
	});

	test("a document whose faces cannot load, rather than a bitmap in a fallback face", async () => {
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><style>@font-face{font-family:"Nowhere";src:url("data:font/ttf;base64,AAAA") format("truetype")}</style>' +
			'<text x="4" y="20" font-family="Nowhere">missing</text></svg>';
		const failed = owned().rasterize({ svg, width: 80, height: 40, scale: 1 });
		await expect(failed).rejects.toMatchObject({ code: "RASTER_FAILED" });
		await expect(failed).rejects.toThrow(/faces did not load/u);
	}, 20_000);

	test("no browser at all, by name", async () => {
		const rasterizer = createSemanticRasterizer({ chromiumPath: "" });
		const refused = rasterizer.rasterize({ svg: "<svg/>", width: 10, height: 10, scale: 1 });
		await expect(refused).rejects.toMatchObject({ code: "RASTERIZER_UNAVAILABLE" });
		await expect(refused).rejects.toThrow(/ARCHBOARD_RENDERER_CHROMIUM/u);
		expect((await rasterizer.stop()).clean).toBe(true);
	});

	test("bytes that are not a PNG", () => {
		expect(() => readPngDimensions(new TextEncoder().encode("<svg/>"))).toThrow(/not a PNG/u);
	});
});

describe("how the browser is owned", () => {
	test("Chromium starts with the first capture, serves the queue in order, and is gone after stop", async () => {
		const drawn = await draw(SAMPLE);
		const rasterizer = createSemanticRasterizer();
		expect(rasterizer.status()).toMatchObject({ chromiumStarts: 0, chromiumPid: null });
		const first = rasterizer.rasterize({ ...drawn, scale: 1 });
		const second = rasterizer.rasterize({ ...drawn, scale: 0.5 });
		expect(rasterizer.status().queued).toBe(2);
		const [one, two] = await Promise.all([first, second]);
		expect(one.width).toBe(drawn.width);
		expect(two.width).toBe(Math.round(drawn.width * 0.5));
		const status = rasterizer.status();
		expect(status.chromiumStarts).toBe(1);
		const pid = status.chromiumPid;
		const tempRoot = status.tempRoot;
		expect(pid).not.toBeNull();
		expect(tempRoot).toContain("archboard-raster-");
		const cleanup = await rasterizer.stop();
		expect(cleanup).toMatchObject({ clean: true, processGone: true, tempRootRemoved: true });
		expect(processExists(pid as number)).toBe(false);
		expect(rasterizer.status().accepting).toBe(false);
		await expect(rasterizer.rasterize({ ...drawn, scale: 1 })).rejects.toMatchObject({
			code: "RASTERIZER_STOPPED",
		});
	}, 20_000);

	test("a queued capture can be cancelled by its caller, and only that one", async () => {
		const drawn = await draw(SAMPLE);
		const rasterizer = owned();
		const controller = new AbortController();
		const running = rasterizer.rasterize({ ...drawn, scale: 1 });
		const cancelled = rasterizer.rasterize({ ...drawn, scale: 1 }, controller.signal);
		const after = rasterizer.rasterize({ ...drawn, scale: 1 });
		controller.abort(new Error("changed my mind"));
		await expect(cancelled).rejects.toThrow("changed my mind");
		expect((await running).width).toBe(drawn.width);
		expect((await after).width).toBe(drawn.width);
		const already = new AbortController();
		already.abort(new Error("never wanted it"));
		await expect(rasterizer.rasterize({ ...drawn, scale: 1 }, already.signal)).rejects.toThrow(
			"never wanted it",
		);
	}, 20_000);
});

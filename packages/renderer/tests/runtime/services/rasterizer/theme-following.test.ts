import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { discoveredChromiumPath } from "#runtime/processes/headless-chromium/process.ts";
import {
	launchHeadlessChromium,
	type HeadlessChromium,
} from "#runtime/processes/headless-chromium/launch.ts";
import { type DevTools } from "#runtime/clients/headless-chromium/devtools.ts";
import { PALETTE } from "#shared/rules/svg/page/theme.ts";
import { renderSemanticView } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { VariantContentSchema } from "@archboard/board/content";
import { themeColor } from "#runtime/store/theme/source.ts";
import {
	SEMANTIC_RASTER_CLEANUP_MS,
	SEMANTIC_RASTER_JOB_TIMEOUT_MS,
	SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
} from "@archboard/timing";
import { TEST_CHROMIUM_COLD_START_CASE_MS } from "#tests/runtime/services/rasterizer/cold-start-timing.ts";
import { withFixtureOrders } from "#tests/runtime/services/rasterizer/fixture-orders.ts";
import { pngRgbCounts } from "#tests/runtime/services/rasterizer/png-colors.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

// The shared Chromium starts cold in beforeAll.
setDefaultTimeout(TEST_CHROMIUM_COLD_START_CASE_MS);

// One file drawn `auto` follows the colour scheme of whoever reads it (TASK-466):
// shown as an image, as a CSS background and inline, under each scheme, it
// paints that scheme's ground and that scheme's cards.

const CONTENT = VariantContentSchema.parse(
	withFixtureOrders({
		nodes: [
			{ id: "api", name: "API", kind: "service", responsibility: "Takes requests" },
			{ id: "store", name: "Store", kind: "datastore", responsibility: "Keeps rows" },
		],
		edges: [{ id: "reads", from: "api", to: "store", kind: "call", label: "reads" }],
		flows: [],
	}),
);

/** How the three placements are stacked on the page, each as tall as the picture. */
const PLACEMENTS = ["image", "background", "inline"] as const;

/** The page behind the placements: a colour no theme paints. */
const PAGE_GROUND = "rgb(255, 0, 255)";

let chromium: HeadlessChromium;
let page: DevTools;
let drawn: RenderedDiagram;

beforeAll(async () => {
	drawn = await renderSemanticView({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: CONTENT,
		theme: "auto",
		fonts: "embedded",
		grammar: "architecture",
		// What an export carries beside the drawing follows the scheme with it.
		frame: { title: "Reads", legend: "horizontal" },
	});
	chromium = await launchHeadlessChromium({
		chromiumPath: discoveredChromiumPath(),
		extraArgs: ["--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb"],
		startupTimeoutMs: SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
		cleanupTimeoutMs: SEMANTIC_RASTER_CLEANUP_MS,
		tempRootPrefix: "archboard-theme-following-",
	});
	page = await chromium.openPage(SEMANTIC_RASTER_STARTUP_TIMEOUT_MS);
	const file = join(chromium.tempRoot, "auto.svg");
	writeFileSync(file, drawn.svg, "utf8");
	const size = `width:${drawn.width}px;height:${drawn.height}px`;
	const html = join(chromium.tempRoot, "page.html");
	writeFileSync(
		html,
		`<!doctype html><html><body style="margin:0;background:${PAGE_GROUND}">` +
			`<img src="auto.svg" style="display:block;${size}">` +
			`<div style="${size};background:url(auto.svg) 0 0/100% 100% no-repeat"></div>` +
			`<div style="${size}">${drawn.svg}</div></body></html>`,
		"utf8",
	);
	await page.call(
		"Emulation.setDeviceMetricsOverride",
		{
			width: Math.ceil(drawn.width),
			height: Math.ceil(drawn.height) * PLACEMENTS.length,
			deviceScaleFactor: 1,
			mobile: false,
		},
		SEMANTIC_RASTER_JOB_TIMEOUT_MS,
	);
	await page.call(
		"Page.navigate",
		{ url: pathToFileURL(html).href },
		SEMANTIC_RASTER_JOB_TIMEOUT_MS,
	);
});

afterAll(async () => {
	await chromium?.stop();
});

/**
 * Every placement of the picture, shot under one colour scheme.
 * @param scheme The reader's colour scheme.
 * @returns Each placement's pixel colours, counted.
 */
async function shotsUnder(scheme: "light" | "dark"): Promise<Map<string, Map<string, number>>> {
	await page.call(
		"Emulation.setEmulatedMedia",
		{ features: [{ name: "prefers-color-scheme", value: scheme }] },
		SEMANTIC_RASTER_JOB_TIMEOUT_MS,
	);
	await page.evaluate(
		`(async () => {
			while (document.readyState !== "complete") await new Promise((done) => setTimeout(done, 20));
			await Promise.all([...document.images].map((image) => image.decode()));
			await document.fonts.ready;
			await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
		})()`,
		{ timeoutMs: SEMANTIC_RASTER_JOB_TIMEOUT_MS },
	);
	const shots = new Map<string, Map<string, number>>();
	for (const [index, placement] of PLACEMENTS.entries()) {
		const shot = await page.call(
			"Page.captureScreenshot",
			{
				format: "png",
				clip: { x: 0, y: index * drawn.height, width: drawn.width, height: drawn.height, scale: 1 },
				fromSurface: true,
			},
			SEMANTIC_RASTER_JOB_TIMEOUT_MS,
		);
		const data = (shot as { data: string }).data;
		shots.set(placement, pngRgbCounts(Uint8Array.from(Buffer.from(data, "base64"))));
	}
	return shots;
}

/**
 * One theme's value of a colour the renderer paints with one page token, as the pixel counter keys it.
 * @param theme The ground.
 * @param colour The palette's `var(--token)`.
 * @returns Its `r,g,b` key.
 */
function rgbIn(theme: "light" | "dark", colour: string): string {
	const name = /^var\((--[\w-]+)\)$/u.exec(colour)?.[1];
	if (name === undefined) throw new Error(`${colour} is not one page token`);
	const hex = themeColor(theme, name);
	return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(",");
}

for (const scheme of ["light", "dark"] as const) {
	test(`under a ${scheme} colour scheme, the one file paints the ${scheme} ground and cards wherever it is shown`, async () => {
		const other = scheme === "light" ? "dark" : "light";
		const area = drawn.width * drawn.height;
		for (const [placement, colours] of await shotsUnder(scheme)) {
			const count = (key: string) => colours.get(key) ?? 0;
			// Much of the picture is its ground, and none of it is the other scheme's.
			expect(count(rgbIn(scheme, PALETTE.background)), placement).toBeGreaterThan(area / 4);
			expect(count(rgbIn(other, PALETTE.background)), placement).toBe(0);
			// The cards stand on this scheme's front edges.
			expect(count(rgbIn(scheme, PALETTE.slabEdge)), placement).toBeGreaterThan(100);
			expect(count("255,0,255"), placement).toBe(0);
		}
	});
}

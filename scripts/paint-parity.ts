// Hold the painters to the SVG (ADR 0071). Every drawing of a corpus is put in
// one real browser three ways: as its SVG, on Vello on the GPU and on Vello on
// the CPU, near and far, and the rasters are compared with a tolerance a reader
// cannot see. It says which readings differ most and keeps the worst places.
//
// Make a corpus with paintings, then run from the repository root in `nix develop`,
// after `bun run build:core`:
//   bun scripts/render-corpus.ts render <corpus> --engines blocks --svg
//   bun scripts/paint-parity.ts <corpus> <out> [--painters gpu,cpu] [--views near,far,traffic]
//     [--only substring] [--browser google-chrome] [--worst 12]
//
// The browser runs with a window, because a GPU adapter is what the run is about.
// A painter's raster is read from its canvas in the frame it drew, because a
// screenshot of a canvas under an emulated size is resampled.

import { spawn } from "node:child_process";
import {
	appendFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

/** The directory the renderer core is built into. */
const CORE = "packages/renderer/src/shared/protocol/generated/core";

/** The largest picture a run draws whole, in pixels across or down. */
const MOST = 4096;

/** How far apart two colours may be, as a share of the most two colours can be. */
const TOLERANCE = 0.1;

/** The share of ink apart below which a run keeps no rasters of a comparison. */
const KEEP = 0.01;

/** The side of the square whose worst places a run reports. */
const TILE = 96;

/** A corpus's list of drawings. */
const Corpus = z.record(
	z.string(),
	z.object({ width: z.number(), height: z.number(), sha256: z.string() }),
);

/** How two rasters of a drawing compare. */
const Compared = z.object({
	ink: z.number(),
	different: z.number(),
	tile: z.object({ x: z.number(), y: z.number(), share: z.number() }),
});

/** What a run writes for one comparison. */
type Result = z.infer<typeof Compared> & {
	readonly key: string;
	readonly painter: string;
	readonly view: string;
	readonly share: number;
};

/** The page: a canvas each painter draws on, and a place for the SVG. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/theme.css">
<style>html,body{margin:0;overflow:hidden;background:var(--background)}
#gpu,#cpu,#svg{position:fixed;left:0;top:0;display:none}
#svg{transform-origin:0 0}</style></head><body><canvas id="gpu"></canvas><canvas id="cpu"></canvas>
<div id="svg"></div><script type="module" src="/page.js"></script></body></html>`;

/** What the page runs. */
const PAGE_SCRIPT = `
import init, { Painter } from "/painter.js";
await init({ module_or_path: "/painter.wasm" });
const gpu = await Painter.gpu(document.getElementById("gpu"), true).catch(() => null);
const cpu = Painter.cpu(document.getElementById("cpu"), true);
const painters = { gpu, cpu };
const svg = document.getElementById("svg");
const shown = (element) => {
	for (const one of [...document.querySelectorAll("canvas"), svg]) one.style.display = one === element ? "block" : "none";
};
window.hasGpu = gpu !== null;
window.keepPainter = async (kind, file) => {
	const painter = painters[kind];
	const canvas = document.getElementById(kind);
	const { painting, theme, width, height, scale, far, traffic } = window.reading;
	document.documentElement.dataset.theme = theme;
	canvas.width = width; canvas.height = height;
	canvas.style.width = width + "px"; canvas.style.height = height + "px";
	shown(canvas);
	painter.resize(width, height);
	painter.setTheme(theme === "dark");
	painter.show(painting);
	painter.setCamera(0, 0, scale, 0, 0);
	painter.setFar(far, 0, 0);
	painter.setTrafficShown(traffic);
	painter.holdTraffic();
	if (traffic) painter.setPictureTime(1.5);
	painter.frame(performance.now());
	const copy = new OffscreenCanvas(width, height);
	copy.getContext("2d").drawImage(canvas, 0, 0);
	await fetch(file, { method: "PUT", body: await copy.convertToBlob({ type: "image/png" }) });
};
window.showSvg = async () => {
	const { markup, theme, scale, far, traffic } = window.reading;
	document.documentElement.dataset.theme = theme;
	svg.innerHTML = markup;
	svg.className = far ? "is-far" : "";
	svg.style.transform = "scale(" + scale + ")";
	const root = svg.querySelector("svg");
	if (traffic) { root.pauseAnimations(); root.setCurrentTime(1.5); }
	else for (const pulse of svg.querySelectorAll(".ab-pulse")) pulse.remove();
	shown(svg);
	await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
};
const pixels = async (url) => {
	const bitmap = await createImageBitmap(await (await fetch(url)).blob());
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const context = canvas.getContext("2d", { willReadFrequently: true });
	context.drawImage(bitmap, 0, 0);
	return context.getImageData(0, 0, bitmap.width, bitmap.height);
};
const luma = (r, g, b) => r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
const inI = (r, g, b) => r * 0.59597799 - g * 0.2741761 - b * 0.32180189;
const inQ = (r, g, b) => r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
const apart = (a, i, b, j) => {
	const [r, g, bl] = [a[i] - b[j], a[i + 1] - b[j + 1], a[i + 2] - b[j + 2]];
	const [y, u, v] = [luma(r, g, bl), inI(r, g, bl), inQ(r, g, bl)];
	return 0.5053 * y * y + 0.299 * u * u + 0.1957 * v * v;
};
const LIMIT = 35215 * ${TOLERANCE} * ${TOLERANCE};
const near = (a, b, x, y, w, h) => {
	const i = (y * w + x) * 4;
	for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
		const [nx, ny] = [x + dx, y + dy];
		if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
		if (apart(a, i, b, (ny * w + nx) * 4) <= LIMIT) return true;
	}
	return false;
};
window.compareRasters = async (first, second, diff) => {
	const [a, b] = [await pixels(first), await pixels(second)];
	const [w, h] = [Math.min(a.width, b.width), Math.min(a.height, b.height)];
	const ground = [a.data[0], a.data[1], a.data[2], 255];
	const out = new ImageData(w, h);
	const tiles = new Map();
	let [ink, different] = [0, 0];
	for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
		const i = (y * w + x) * 4;
		if (apart(a.data, i, ground, 0) > LIMIT || apart(b.data, i, ground, 0) > LIMIT) ink += 1;
		const same = near(a.data, b.data, x, y, w, h) && near(b.data, a.data, x, y, w, h);
		out.data.set(same ? [a.data[i] / 3, a.data[i + 1] / 3, a.data[i + 2] / 3, 255] : [255, 0, 80, 255], i);
		if (same) continue;
		different += 1;
		const tile = Math.floor(y / ${TILE}) * 100000 + Math.floor(x / ${TILE});
		tiles.set(tile, (tiles.get(tile) ?? 0) + 1);
	}
	let worst = [0, 0];
	for (const entry of tiles) if (entry[1] > worst[1]) worst = entry;
	const canvas = new OffscreenCanvas(w, h);
	canvas.getContext("2d").putImageData(out, 0, 0);
	const png = await canvas.convertToBlob({ type: "image/png" });
	await fetch(diff, { method: "PUT", body: png });
	return {
		ink,
		different,
		tile: {
			x: (worst[0] % 100000) * ${TILE},
			y: Math.floor(worst[0] / 100000) * ${TILE},
			share: worst[1] / (${TILE} * ${TILE}),
		},
	};
};
window.ready = true;
`;

/** A page in a browser, as a run speaks to it. */
interface Page {
	readonly send: (method: string, params?: object) => Promise<Record<string, unknown>>;
	readonly evaluate: (expression: string) => Promise<unknown>;
	readonly close: () => Promise<void>;
}

/**
 * Open a page in a browser with a window, over its DevTools.
 * @param browser The browser's program.
 * @param url The page.
 * @returns The page.
 */
async function openPage(browser: string, url: string): Promise<Page> {
	const profile = mkdtempSync(join(tmpdir(), "paint-parity-"));
	const flags = [`--user-data-dir=${profile}`, "--remote-debugging-port=0", "--no-first-run"];
	const child = spawn(browser, [...flags, "--no-default-browser-check", "about:blank"], {
		stdio: ["ignore", "ignore", "pipe"],
	});
	const socketUrl = await new Promise<string>((resolve, reject) => {
		let told = "";
		child.once("error", reject);
		child.stderr.on("data", (data: Buffer) => {
			told += data.toString();
			const found = /DevTools listening on (?<url>ws:\S+)/u.exec(told)?.groups?.["url"];
			if (found !== undefined) resolve(found);
		});
	});
	const port = new URL(socketUrl).port;
	const targets = z
		.array(z.object({ type: z.string(), webSocketDebuggerUrl: z.string() }))
		.parse(await (await fetch(`http://127.0.0.1:${port}/json`)).json());
	const target = targets.find((one) => one.type === "page");
	if (target === undefined) throw new Error("The browser opened no page.");
	const socket = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve) => {
		socket.addEventListener("open", resolve, { once: true });
	});
	const waiting = new Map<number, (reply: Record<string, unknown>) => void>();
	socket.addEventListener("message", (event) => {
		const reply = z
			.looseObject({ id: z.number().optional(), result: z.looseObject({}).optional() })
			.parse(JSON.parse(String(event.data)));
		if (reply.id !== undefined) waiting.get(reply.id)?.(reply.result ?? {});
	});
	let last = 0;
	/**
	 * Say something to the page.
	 * @param method The DevTools method.
	 * @param params What it takes.
	 * @returns The answer.
	 */
	async function send(method: string, params: object = {}): Promise<Record<string, unknown>> {
		last += 1;
		const id = last;
		return new Promise((resolve) => {
			waiting.set(id, resolve);
			socket.send(JSON.stringify({ id, method, params }));
		});
	}
	await send("Page.enable");
	await send("Runtime.enable");
	await send("Page.bringToFront");
	await send("Page.navigate", { url });
	return {
		send,
		/**
		 * Run an expression in the page.
		 * @param expression The expression.
		 * @returns What it came to.
		 */
		evaluate: async (expression) => {
			const reply = await send("Runtime.evaluate", {
				expression,
				awaitPromise: true,
				returnByValue: true,
			});
			const { result, exceptionDetails } = z
				.looseObject({
					result: z.looseObject({ value: z.unknown().optional() }),
					exceptionDetails: z.unknown().optional(),
				})
				.parse(reply);
			if (exceptionDetails !== undefined) {
				throw new Error(`The page failed: ${JSON.stringify(exceptionDetails)}`);
			}
			return result.value;
		},
		/** Close the browser and remove its profile. */
		close: async () => {
			socket.close();
			child.kill("SIGKILL");
			await Bun.sleep(300);
			rmSync(profile, { recursive: true, force: true });
		},
	};
}

/**
 * Serve the page, the painter, and what a run writes.
 * @param out The directory rasters are read from and written to.
 * @returns The server.
 */
function servePage(out: string): ReturnType<typeof Bun.serve> {
	const files: Readonly<Record<string, readonly [string, string]>> = {
		"/painter.js": [join(CORE, "archboard_painter_wasm.js"), "text/javascript"],
		"/painter.wasm": [join(CORE, "archboard_painter_wasm_bg.wasm"), "application/wasm"],
		"/theme.css": ["packages/renderer/assets/theme.css", "text/css"],
	};
	return Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		/**
		 * Answer one request.
		 * @param request The request.
		 * @returns The answer.
		 */
		fetch: async (request) => {
			const { pathname } = new URL(request.url);
			if (request.method === "PUT") {
				await Bun.write(join(out, pathname), await request.arrayBuffer());
				return new Response(null, { status: 204 });
			}
			if (pathname === "/") return new Response(PAGE, { headers: { "content-type": "text/html" } });
			if (pathname === "/page.js") {
				return new Response(PAGE_SCRIPT, { headers: { "content-type": "text/javascript" } });
			}
			const file = files[pathname];
			if (file !== undefined) {
				return new Response(Bun.file(file[0]), { headers: { "content-type": file[1] } });
			}
			return new Response(Bun.file(join(out, pathname)));
		},
	});
}

/**
 * Keep what the browser shows now.
 * @param page The page.
 * @param size The picture's size.
 * @param size.width Across, in pixels.
 * @param size.height Down, in pixels.
 * @param file Where to write it.
 */
async function capture(
	page: Page,
	size: { readonly width: number; readonly height: number },
	file: string,
): Promise<void> {
	const clip = { x: 0, y: 0, ...size, scale: 1 };
	const reply = await page.send("Page.captureScreenshot", { format: "png", clip });
	writeFileSync(file, Buffer.from(z.string().parse(reply["data"]), "base64"));
}

/** What a comparison of one reading needs. */
interface Reading {
	readonly key: string;
	readonly markup: string;
	readonly painting: string;
	readonly theme: string;
	readonly width: number;
	readonly height: number;
}

/**
 * Compare one reading in one view with every painter.
 * @param page The page.
 * @param out Where rasters go.
 * @param reading The reading.
 * @param view The view, and the painters to hold to it.
 * @param view.name Near, far, or traffic.
 * @param view.painters The painters.
 * @returns How each painter compares.
 */
async function compareReading(
	page: Page,
	out: string,
	reading: Reading,
	view: { readonly name: string; readonly painters: readonly string[] },
): Promise<readonly Result[]> {
	const scale = view.name === "far" ? 0.5 : 1;
	const size = {
		width: Math.ceil(reading.width * scale),
		height: Math.ceil(reading.height * scale),
	};
	await page.send("Emulation.setDeviceMetricsOverride", {
		...size,
		deviceScaleFactor: 1,
		mobile: false,
	});
	const shown = {
		...reading,
		...size,
		scale,
		far: view.name === "far",
		traffic: view.name === "traffic",
	};
	await page.evaluate(`window.reading = ${JSON.stringify(shown)}; undefined`);
	const stem = `${reading.key}.${view.name}`;
	await page.evaluate("window.showSvg()");
	await capture(page, size, join(out, `${stem}.svg.png`));
	const results: Result[] = [];
	for (const painter of view.painters) {
		// oxlint-disable-next-line no-await-in-loop -- one page shows one painter at a time
		await page.evaluate(
			`window.keepPainter(${JSON.stringify(painter)}, ${JSON.stringify(`/${stem}.${painter}.png`)})`,
		);
		const compared = Compared.parse(
			// oxlint-disable-next-line no-await-in-loop -- one page shows one painter at a time
			await page.evaluate(
				`window.compareRasters(${JSON.stringify(`/${stem}.svg.png`)}, ${JSON.stringify(`/${stem}.${painter}.png`)}, ${JSON.stringify(`/${stem}.${painter}.diff.png`)})`,
			),
		);
		const share = compared.ink === 0 ? 0 : compared.different / compared.ink;
		results.push({ ...compared, key: reading.key, painter, view: view.name, share });
		if (share < KEEP) {
			rmSync(join(out, `${stem}.${painter}.png`));
			rmSync(join(out, `${stem}.${painter}.diff.png`));
		}
	}
	return results;
}

/** What a run was told to compare. */
interface Run {
	readonly corpus: string;
	readonly out: string;
	readonly painters: readonly string[];
	readonly views: readonly string[];
	readonly only: string;
	readonly browser: string;
	readonly worst: number;
}

/**
 * Read a run's arguments.
 * @returns What it was told to compare.
 */
function runOfArguments(): Run {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			painters: { type: "string", default: "gpu,cpu" },
			views: { type: "string", default: "near,far" },
			only: { type: "string", default: "" },
			browser: { type: "string", default: "google-chrome" },
			worst: { type: "string", default: "12" },
		},
	});
	const [corpus, out] = positionals;
	if (corpus === undefined || out === undefined) {
		throw new Error("Name a corpus and a directory: bun scripts/paint-parity.ts <corpus> <out>.");
	}
	return {
		corpus,
		out,
		painters: values.painters.split(","),
		views: values.views.split(","),
		only: values.only,
		browser: values.browser,
		worst: Number(values.worst),
	};
}

/**
 * The readings of a corpus that a run compares.
 * @param run The run.
 * @returns The readings.
 */
function readingsOf(run: Run): readonly Reading[] {
	const drawn = Corpus.parse(JSON.parse(readFileSync(join(run.corpus, "corpus.json"), "utf8")));
	return Object.entries(drawn)
		.filter(([key, { width, height }]) => key.includes(run.only) && Math.max(width, height) <= MOST)
		.map(([name, { width, height }]) => {
			const key = name.replaceAll(/[^\w-]+/gu, "_");
			const file = join(run.corpus, "svg", `${key}.svg`);
			return {
				key,
				markup: readFileSync(file, "utf8"),
				painting: readFileSync(`${file}.painting.json`, "utf8"),
				theme: name.includes("dark") ? "dark" : "light",
				width,
				height,
			};
		});
}

/**
 * Wait for the page, and refuse a browser without the GPU painter asked for.
 * @param page The page.
 * @param run The run.
 */
async function pageReady(page: Page, run: Run): Promise<void> {
	// oxlint-disable-next-line no-await-in-loop -- the page says it is ready only once
	while ((await page.evaluate("window.ready === true")) !== true) await Bun.sleep(100);
	if ((await page.evaluate("window.hasGpu")) !== true && run.painters.includes("gpu")) {
		throw new Error("This browser gave no GPU painter. Name another with --browser.");
	}
}

/**
 * Write what a run found.
 * @param run The run.
 * @param results Every comparison.
 */
function report(run: Run, results: readonly Result[]): void {
	const sorted = results.toSorted((a, b) => b.share - a.share);
	writeFileSync(join(run.out, "parity.json"), JSON.stringify(sorted, null, "\t"));
	const average = sorted.reduce((sum, one) => sum + one.share, 0) / Math.max(1, sorted.length);
	console.log(
		`${sorted.length} comparisons, ${(average * 100).toFixed(3)}% of ink apart on average.`,
	);
	for (const one of sorted.slice(0, run.worst)) {
		const share = (one.share * 100).toFixed(2);
		const tile = `${one.tile.x},${one.tile.y} ${(one.tile.share * 100).toFixed(0)}%`;
		console.log(`${share}%  ${one.painter} ${one.view} ${one.key}  worst ${tile}`);
	}
}

/**
 * Run the comparison.
 * @returns Once it has written its report.
 */
async function main(): Promise<void> {
	const run = runOfArguments();
	mkdirSync(run.out, { recursive: true });
	const server = servePage(run.out);
	const page = await openPage(run.browser, `http://127.0.0.1:${server.port}/`);
	const results: Result[] = [];
	// Each comparison goes on disk as it ends, so a stopped run keeps what it found.
	const journal = join(run.out, "parity.jsonl");
	try {
		await pageReady(page, run);
		for (const reading of readingsOf(run)) {
			for (const name of run.views) {
				const view = { name, painters: run.painters };
				// oxlint-disable-next-line no-await-in-loop -- one page shows one reading at a time
				const found = await compareReading(page, run.out, reading, view);
				results.push(...found);
				appendFileSync(journal, found.map((one) => `${JSON.stringify(one)}\n`).join(""));
			}
		}
	} finally {
		await page.close();
		await server.stop(true);
	}
	report(run, results);
}

await main();

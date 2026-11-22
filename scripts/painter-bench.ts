// Time the painters on one picture of a corpus (docs/design/painter-webgl-fallback.md).
// A page paints the picture under a moving camera for a number of frames and
// reports the gap between frames, the time of each frame, and how much of it
// drew on the canvas and how much rendered. A strip canvas cuts its strips
// while it draws. Each run opens a fresh browser, and it reports through the
// server, so any browser can run it.
//
// Make a corpus with paintings, then run from the repository root in `nix develop`,
// after `bun run build:core`:
//   bun scripts/render-corpus.ts render <corpus> --engines blocks --svg
//   bun scripts/painter-bench.ts <corpus> <out> --only "(whole model) | blocks | dark"
//     [--painters gpu,webgl,cpu] [--sizes 1920x1080] [--runs 3] [--frames 540]
//     [--browser google-chrome] [--flags=--disable-features=WebGPUService]
//     [--core <directory of a painter build>]

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

/** The directory the renderer core is built into. */
const CORE = "packages/renderer/src/shared/protocol/generated/core";

/** The frames a run draws before it counts any. */
const WARM_FRAMES = 30;

/** The longest a run may take, in milliseconds. */
const RUN_LIMIT_MS = 180_000;

/** A corpus's list of drawings. */
const Corpus = z.record(
	z.string(),
	z.object({ width: z.number(), height: z.number(), sha256: z.string() }),
);

/** What a page reports of one run. */
const Reported = z.record(z.string(), z.unknown());

/** The page: one canvas over the whole window. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/theme.css">
<style>html,body{margin:0;overflow:hidden;background:#000}
canvas{position:fixed;left:0;top:0;width:100vw;height:100vh}</style></head>
<body><script type="module" src="/page.js"></script></body></html>`;

/** What the page runs. */
const PAGE_SCRIPT = `
import init, { Painter } from "/painter.js";
const asked = new URLSearchParams(location.search);
const kind = asked.get("painter");
const [width, height] = asked.get("size").split("x").map(Number);
const frames = Number(asked.get("frames"));
const report = (body) => fetch("/result/" + asked.get("id"), { method: "PUT", body: JSON.stringify(body) });
const fail = (error) => report({ painter: kind, size: [width, height], error: String(error) });
const probe = (attributes) => {
	const gl = document.createElement("canvas").getContext("webgl2", attributes);
	if (gl === null) return null;
	const info = gl.getExtension("WEBGL_debug_renderer_info");
	const has = (name) => gl.getSupportedExtensions().includes(name);
	return {
		renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
		maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
		colorBufferFloat: has("EXT_color_buffer_float"),
		colorBufferHalfFloat: has("EXT_color_buffer_half_float"),
		timerQuery: has("EXT_disjoint_timer_query_webgl2"),
		parallelCompile: has("KHR_parallel_shader_compile"),
	};
};
const quantiles = (values) => {
	const sorted = values.toSorted((a, b) => a - b);
	const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
	const mean = sorted.reduce((sum, one) => sum + one, 0) / sorted.length;
	return { mean, median: at(0.5), p90: at(0.9), p99: at(0.99), max: sorted.at(-1) };
};
try {
	const environment = {
		userAgent: navigator.userAgent,
		webgpu: "gpu" in navigator,
		adapter: "gpu" in navigator ? (await navigator.gpu.requestAdapter()) !== null : false,
		devicePixelRatio,
		webgl: probe({}),
		webglWithoutCaveat: probe({ failIfMajorPerformanceCaveat: true }) !== null,
	};
	await init({ module_or_path: "/painter.wasm" });
	const fixture = await (await fetch("/fixture.json")).json();
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	document.body.append(canvas);
	const started = performance.now();
	let painter;
	if (kind === "gpu") {
		await Painter.warm(() => {});
		painter = Painter.gpu(canvas, fixture.dark);
	} else if (kind === "webgl") painter = Painter.webgl(canvas, fixture.dark);
	else painter = Painter.cpu(canvas, fixture.dark);
	const startMs = performance.now() - started;
	painter.show(fixture.painting);
	painter.setFarLine(0, 0);
	painter.setTrafficShown(false);
	const fit = Math.min(width / fixture.width, height / fixture.height);
	const camera = (index) => {
		const scale = fit * (1 + 0.6 * (0.5 - 0.5 * Math.cos((2 * Math.PI * index) / 240)));
		const x = (width - fixture.width * scale) / 2 + 0.15 * width * Math.sin((2 * Math.PI * index) / 360);
		const y = (height - fixture.height * scale) / 2 + 0.15 * height * Math.cos((2 * Math.PI * index) / 360);
		return [x, y, scale];
	};
	painter.setCamera(...camera(0), 0, 0);
	const [fills, strokes, layers] = painter.countFrame(0);
	const walks = [];
	for (let index = 1; index <= 30; index += 1) {
		painter.setCamera(...camera(index), 0, 0);
		const before = performance.now();
		painter.countFrame(0);
		walks.push(performance.now() - before);
	}
	painter.setCamera(...camera(0), 0, 0);
	const firstStarted = performance.now();
	painter.frame(0);
	const firstMs = performance.now() - firstStarted;
	const rows = [];
	let index = 0;
	let last = 0;
	const step = (stamp) => {
		try {
			const [x, y, scale] = camera(index);
			painter.setCamera(x, y, scale, 0, stamp);
			const before = performance.now();
			painter.frame(stamp);
			const call = performance.now() - before;
			const [encode, render] = painter.lastTimes();
			if (index >= ${WARM_FRAMES}) rows.push({ gap: stamp - last, call, encode, render });
		} catch (error) {
			fail(error);
			return;
		}
		last = stamp;
		index += 1;
		if (rows.length < frames) requestAnimationFrame(step);
		else
			report({
				environment,
				painter: kind,
				size: [width, height],
				paths: { fills, strokes, layers },
				walk: quantiles(walks),
				startMs,
				firstMs,
				frames: rows.length,
				slow: rows.filter((row) => row.gap > 25).length,
				gap: quantiles(rows.map((row) => row.gap)),
				call: quantiles(rows.map((row) => row.call)),
				encode: quantiles(rows.map((row) => row.encode)),
				render: quantiles(rows.map((row) => row.render)),
			});
	};
	requestAnimationFrame((stamp) => {
		last = stamp;
		requestAnimationFrame(step);
	});
} catch (error) {
	fail(error);
}
`;

/** What a run was told to measure. */
interface Run {
	readonly corpus: string;
	readonly out: string;
	readonly only: string;
	readonly painters: readonly string[];
	readonly sizes: readonly string[];
	readonly runs: number;
	readonly frames: number;
	readonly browser: string;
	readonly flags: readonly string[];
	/** The directory of the painter build to measure. */
	readonly core: string;
}

/**
 * Read a run's arguments.
 * @returns What it was told to measure.
 */
function runOfArguments(): Run {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			only: { type: "string", default: "(whole model) | blocks | dark" },
			painters: { type: "string", default: "gpu,webgl,cpu" },
			sizes: { type: "string", default: "1920x1080" },
			runs: { type: "string", default: "3" },
			frames: { type: "string", default: "540" },
			browser: { type: "string", default: "google-chrome" },
			flags: { type: "string", default: "" },
			core: { type: "string", default: CORE },
		},
	});
	const [corpus, out] = positionals;
	if (corpus === undefined || out === undefined) {
		throw new Error("Name a corpus and a directory: bun scripts/painter-bench.ts <corpus> <out>.");
	}
	return {
		corpus,
		out,
		only: values.only,
		painters: z
			.array(z.enum(["gpu", "webgl", "cpu"]))
			.min(1)
			.parse(values.painters.split(",")),
		sizes: z
			.array(z.string().regex(/^[1-9]\d*x[1-9]\d*$/u))
			.min(1)
			.parse(values.sizes.split(",")),
		runs: z.coerce.number().int().positive().parse(values.runs),
		frames: z.coerce.number().int().positive().parse(values.frames),
		browser: values.browser,
		flags: values.flags.split(" ").filter((flag) => flag !== ""),
		core: values.core,
	};
}

/**
 * The picture a run paints: the largest drawing whose name holds `only`.
 * @param run The run.
 * @returns The fixture as the page reads it, and its name.
 */
function fixtureOf(run: Run): { readonly name: string; readonly json: string } {
	const drawn = Corpus.parse(JSON.parse(readFileSync(join(run.corpus, "corpus.json"), "utf8")));
	const [name, size] =
		Object.entries(drawn)
			.filter(([key]) => key.includes(run.only))
			.toSorted(([, a], [, b]) => b.width * b.height - a.width * a.height)[0] ?? [];
	if (name === undefined || size === undefined) throw new Error(`No drawing holds ${run.only}.`);
	const key = name.replaceAll(/[^\w-]+/gu, "_");
	const painting = readFileSync(join(run.corpus, "svg", `${key}.svg.painting.json`), "utf8");
	const json = JSON.stringify({ painting, ...size, dark: name.includes("dark") });
	return { name, json };
}

/**
 * Open a page in a fresh profile of a browser with a window.
 * @param browser The browser's program.
 * @param flags What else the browser is told.
 * @param url The page.
 * @param failed Reject the run if its browser cannot start or exits before reporting.
 * @returns Close the browser and remove its profile.
 */
function openBrowser(
	browser: string,
	flags: readonly string[],
	url: string,
	failed: (error: Error) => void,
): () => Promise<void> {
	const profile = mkdtempSync(join(tmpdir(), "painter-bench-"));
	const firefox = browser.includes("firefox");
	if (firefox) {
		writeFileSync(
			join(profile, "user.js"),
			[
				'user_pref("browser.shell.checkDefaultBrowser", false);',
				'user_pref("browser.aboutwelcome.enabled", false);',
				'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
				'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
				'user_pref("browser.startup.homepage_override.mstone", "ignore");',
			].join("\n"),
		);
	}
	const launch = firefox
		? ["-no-remote", "-new-instance", "-profile", profile, ...flags, url]
		: [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", ...flags, url];
	let child: ReturnType<typeof spawn>;
	try {
		child = spawn(browser, launch, { stdio: "ignore" });
	} catch (error) {
		rmSync(profile, { recursive: true, force: true });
		throw error;
	}
	child.once("error", failed);
	child.once("exit", (code, signal) => {
		failed(new Error(`The browser exited before reporting (${String(code ?? signal)}).`));
	});
	const stopped = new Promise<void>((resolve) => child.once("close", () => resolve()));
	return async () => {
		child.kill("SIGKILL");
		await stopped;
		rmSync(profile, { recursive: true, force: true });
	};
}

/**
 * Measure every painter at every size.
 * @returns Once every run has reported.
 */
async function main(): Promise<void> {
	const run = runOfArguments();
	mkdirSync(run.out, { recursive: true });
	const fixture = fixtureOf(run);
	console.log(`Fixture: ${fixture.name}`);
	const waiting = new Map<string, (body: string) => void>();
	const files: Readonly<Record<string, readonly [Blob | string, string]>> = {
		"/": [PAGE, "text/html"],
		"/page.js": [PAGE_SCRIPT, "text/javascript"],
		"/fixture.json": [fixture.json, "application/json"],
		"/painter.js": [Bun.file(join(run.core, "archboard_painter_wasm.js")), "text/javascript"],
		"/painter.wasm": [
			Bun.file(join(run.core, "archboard_painter_wasm_bg.wasm")),
			"application/wasm",
		],
		"/theme.css": [Bun.file("packages/renderer/assets/theme.css"), "text/css"],
	};
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		/**
		 * Answer one request: a run's report, or a file of the page.
		 * @param request The request.
		 * @returns The answer.
		 */
		fetch: async (request) => {
			const { pathname } = new URL(request.url);
			if (request.method === "PUT" && pathname.startsWith("/result/")) {
				waiting.get(pathname.slice("/result/".length))?.(await request.text());
				return new Response(null, { status: 204 });
			}
			const file = files[pathname];
			return file === undefined
				? new Response(null, { status: 404 })
				: new Response(file[0], { headers: { "content-type": file[1] } });
		},
	});
	/**
	 * Measure one fresh browser and release its process and profile before returning.
	 * @param painter The painter.
	 * @param size The canvas size.
	 * @param attempt The repetition.
	 * @returns The report with its run identity and load.
	 */
	async function measureOne(
		painter: string,
		size: string,
		attempt: number,
	): Promise<z.infer<typeof Reported>> {
		const id = `${painter}-${size}-${String(attempt)}`;
		const { promise: reported, resolve, reject } = Promise.withResolvers<string>();
		waiting.set(id, resolve);
		const limit = setTimeout(
			() => reject(new Error(`${id} did not report in time.`)),
			RUN_LIMIT_MS,
		);
		const query = new URLSearchParams({
			id,
			painter,
			size,
			frames: String(run.frames),
		});
		let close: (() => Promise<void>) | undefined;
		try {
			close = openBrowser(
				run.browser,
				run.flags,
				`http://127.0.0.1:${String(server.port)}/?${query.toString()}`,
				reject,
			);
			const page = Reported.parse(JSON.parse(await reported));
			const body = { ...page, load: loadavg()[0] };
			writeFileSync(join(run.out, `${id}.json`), JSON.stringify(body, null, "\t"));
			console.log(id, JSON.stringify(page["error"] ?? page["gap"]));
			return { id, ...body };
		} finally {
			clearTimeout(limit);
			waiting.delete(id);
			await close?.();
			await Bun.sleep(1500);
		}
	}
	const results: z.infer<typeof Reported>[] = [];
	try {
		for (const size of run.sizes) {
			// The painters take turns, so that a change in the machine's load reaches each alike.
			for (let attempt = 0; attempt < run.runs; attempt += 1) {
				for (const painter of run.painters) {
					// oxlint-disable-next-line no-await-in-loop -- one browser measures at a time
					results.push(await measureOne(painter, size, attempt));
				}
			}
		}
	} finally {
		await server.stop(true);
	}
	writeFileSync(
		join(run.out, "bench.json"),
		JSON.stringify({ fixture: fixture.name, results }, null, "\t"),
	);
	if (results.some((result) => result["error"] !== undefined)) {
		throw new Error("A painter failed. Read the errors in bench.json before comparing timings.");
	}
}

await main();

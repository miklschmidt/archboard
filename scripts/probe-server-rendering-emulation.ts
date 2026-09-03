import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { projectPreviewSnapshot } from "../src/ui/board-preview/index.js";
import { readNote } from "../src/runtime/engine/board-io.js";
import { isBlockId } from "../src/shared/ids/ids.js";

const root = resolve(import.meta.dir, "..");
const fixtureRoot = resolve(root, "docs/design/server-rendering-boundary-fixtures");
const fixtureNote = join(fixtureRoot, "board.excalidraw.md");
const manifest = join(fixtureRoot, "emulation/package.json");
const lockfile = join(fixtureRoot, "emulation/bun.lock");
const installTimeoutMs = 20_000;
const cleanupTimeoutMs = 5_000;

function requirePreflight(): void {
	for (const file of [fixtureNote, manifest, lockfile, join(fixtureRoot, "diagram.mmd")]) {
		if (!existsSync(file)) throw new Error(`Emulation preflight failed: ${file} is absent.`);
	}
}

function ownedOutputDirectory(argv: readonly string[]): string {
	if (argv.length > 0)
		throw new Error(
			"This proof owns its output. Run without arguments; it creates one disposable report directory under the system temporary root.",
		);
	return mkdtempSync(join(tmpdir(), "archboard-server-rendering-emulation-proof-"));
}

function exportFiles(files: Record<string, unknown>): BinaryFiles {
	for (const [id, raw] of Object.entries(files)) {
		if (!raw || typeof raw !== "object") throw new Error(`Persisted file ${id} is invalid.`);
		const file = raw as Record<string, unknown>;
		if (
			file.id !== id ||
			file.mimeType !== "image/png" ||
			typeof file.dataURL !== "string" ||
			!file.dataURL.startsWith("data:image/png;base64,") ||
			typeof file.created !== "number"
		)
			throw new Error(`Persisted file ${id} is not a complete PNG export file.`);
	}
	return files as unknown as BinaryFiles;
}

function fixtureInput(): Record<string, unknown> {
	const content = readNote(fixtureNote);
	if (!content)
		throw new Error(`Cannot read the canonical persisted board fixture: ${fixtureNote}`);
	const scene = projectPreviewSnapshot({
		board: "render-proof",
		fingerprint: "canonical-fixture",
		elements: Array.from(content.elements.values()),
		files: exportFiles(Object.fromEntries(content.files)),
	});
	if (
		scene.elements.length !== 9 ||
		Object.keys(scene.files).length !== 1 ||
		!scene.elements.every((element) => isBlockId(element.id))
	)
		throw new Error("Canonical board read did not produce the expected block-safe render input.");
	return {
		elements: scene.elements,
		files: exportFiles(scene.files),
		appState: { exportBackground: true, viewBackgroundColor: "#f8fafc" },
	};
}

async function install(directory: string): Promise<{ stdout: string; stderr: string }> {
	mkdirSync(directory);
	await Bun.write(join(directory, "package.json"), readFileSync(manifest));
	await Bun.write(join(directory, "bun.lock"), readFileSync(lockfile));
	const child = Bun.spawn({
		cmd: ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
		cwd: directory,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = new Response(child.stdout as ReadableStream<Uint8Array>).text();
	const stderr = new Response(child.stderr as ReadableStream<Uint8Array>).text();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			child.exited,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() =>
						reject(
							new Error(`Disposable emulation dependency install exceeded ${installTimeoutMs} ms.`),
						),
					installTimeoutMs,
				);
			}),
		]);
	} catch (error) {
		if (child.exitCode === null) child.kill("SIGTERM");
		await Promise.race([child.exited, Bun.sleep(cleanupTimeoutMs - 1_000)]);
		if (child.exitCode === null) child.kill("SIGKILL");
		await Promise.race([child.exited, Bun.sleep(1_000)]);
		throw error;
	} finally {
		if (timeout) clearTimeout(timeout);
	}
	const output = { stdout: await stdout, stderr: await stderr };
	if (child.exitCode !== 0)
		throw new Error(`Disposable emulation dependency install failed: ${output.stderr}`);
	return output;
}

function fontFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return fontFiles(path);
		return path.endsWith(".woff2") ? [path] : [];
	});
}

interface GlobalRestore {
	installed: string[];
	restore(): boolean;
}

function installDom(
	window: Record<string, unknown>,
	canvas: Record<string, unknown>,
): GlobalRestore {
	if (!window.FontFace) {
		window.FontFace = class FontFace {
			readonly style: string;
			readonly weight: string;
			readonly stretch: string;
			readonly unicodeRange: string;
			readonly status = "loaded";
			constructor(
				readonly family: string,
				readonly source: string,
				readonly descriptors: Record<string, string> = {},
			) {
				this.style = descriptors.style ?? "normal";
				this.weight = descriptors.weight ?? "normal";
				this.stretch = descriptors.stretch ?? "normal";
				this.unicodeRange = descriptors.unicodeRange ?? "U+0-10FFFF";
			}
			async load(): Promise<this> {
				return this;
			}
		};
	}
	const document = window.document as Record<string, unknown>;
	const faces = new Set<unknown>();
	document.fonts = {
		add: (face: unknown) => faces.add(face),
		has: (face: unknown) => faces.has(face),
		delete: (face: unknown) => faces.delete(face),
		clear: () => faces.clear(),
		check: () => true,
		ready: Promise.resolve(),
	};
	const names = [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"HTMLCanvasElement",
		"HTMLImageElement",
		"SVGElement",
		"SVGSVGElement",
		"CSSStyleSheet",
		"CSSStyleDeclaration",
		"Element",
		"Node",
		"Document",
		"DOMParser",
		"XMLSerializer",
		"getComputedStyle",
		"requestAnimationFrame",
		"cancelAnimationFrame",
		"ResizeObserver",
		"MutationObserver",
		"CustomEvent",
		"Event",
		"EventTarget",
		"File",
		"FileReader",
		"FontFace",
		"localStorage",
		"sessionStorage",
		"location",
		"matchMedia",
		"devicePixelRatio",
	];
	const before = new Map(
		names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
	);
	const backing = new WeakMap<object, Record<string, unknown>>();
	const createCanvas = canvas.createCanvas as (
		width: number,
		height: number,
	) => Record<string, unknown>;
	const nativeFor = (element: Record<string, unknown>) => {
		const present = backing.get(element);
		if (present) return present;
		const native = createCanvas(Number(element.width) || 300, Number(element.height) || 150);
		Object.assign(native, {
			setAttribute: () => undefined,
			removeAttribute: () => undefined,
			style: {},
		});
		backing.set(element, native);
		return native;
	};
	const htmlCanvas = window.HTMLCanvasElement as { prototype: Record<string, unknown> };
	Object.assign(htmlCanvas.prototype, {
		getContext(this: Record<string, unknown>, type: string, ...args: unknown[]) {
			const context = (
				nativeFor(this).getContext as (...values: unknown[]) => Record<string, unknown>
			)(type, ...args);
			return context;
		},
		toDataURL(this: Record<string, unknown>, type = "image/png") {
			return (nativeFor(this).toDataURL as (mime: string) => string)(type);
		},
		toBlob(this: Record<string, unknown>, callback: (blob: Blob) => void, type = "image/png") {
			const buffer = (nativeFor(this).toBuffer as (mime: string) => Uint8Array)(type);
			const copy = new ArrayBuffer(buffer.byteLength);
			new Uint8Array(copy).set(buffer);
			callback(new Blob([copy], { type }));
		},
	});
	for (const name of names) {
		const replacement = window[name];
		if (replacement !== undefined)
			Object.defineProperty(globalThis, name, {
				configurable: true,
				writable: true,
				value: replacement,
			});
	}
	for (const [name, replacement] of Object.entries({
		Image: canvas.Image,
		Path2D: canvas.Path2D,
		ImageData: canvas.ImageData,
		CanvasRenderingContext2D: canvas.CanvasRenderingContext2D,
	})) {
		before.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: replacement,
		});
	}
	return {
		installed: [...before.keys()],
		restore: () => {
			for (const [name, descriptor] of before) {
				if (descriptor) Object.defineProperty(globalThis, name, descriptor);
				else Reflect.deleteProperty(globalThis, name);
			}
			return [...before].every(([name, descriptor]) => {
				const restored = Object.getOwnPropertyDescriptor(globalThis, name);
				return JSON.stringify(restored) === JSON.stringify(descriptor);
			});
		},
	};
}

const output = ownedOutputDirectory(Bun.argv.slice(2));
const dependencyRoot = join(output, "dependencies");
const reportPath = join(output, "report.json");
let report: Record<string, unknown> = {
	status: "failed",
	output: { directory: output, disposable: true },
};
let failure: unknown = null;

try {
	requirePreflight();
	const installed = await install(dependencyRoot);
	const happy = (await import(
		pathToFileURL(join(dependencyRoot, "node_modules/happy-dom/lib/index.js")).href
	)) as {
		Window: new (options?: Record<string, unknown>) => Record<string, unknown>;
	};
	const canvas = (await import(
		pathToFileURL(join(dependencyRoot, "node_modules/@napi-rs/canvas/index.js")).href
	)) as Record<string, unknown>;
	const window = new happy.Window({ url: "http://archboard.local/" });
	const globals = installDom(window, canvas);
	const fonts = fontFiles(
		join(root, "node_modules/@excalidraw/excalidraw/dist/dev/fonts/Excalifont"),
	);
	const fontRegistry = canvas.GlobalFonts as {
		registerFromPath(path: string, family: string): boolean;
		removeAll(): void;
	};
	const registeredFonts = fonts.filter((font) => fontRegistry.registerFromPath(font, "Excalifont"));
	if (fonts.length === 0 || registeredFonts.length !== fonts.length)
		throw new Error(
			`Emulation font preflight failed: discovered ${fonts.length}, registered ${registeredFonts.length}.`,
		);
	report = {
		status: "running",
		output: { directory: output, disposable: true },
		dependencyManifest: manifest,
		install: { stdout: installed.stdout.slice(-2_000), stderr: installed.stderr.slice(-2_000) },
		globals: { installed: globals.installed, restored: false },
		fonts: { discovered: fonts.length, registered: registeredFonts.length },
	};
	const runtimeConsole: string[] = [];
	const originalConsole = Object.fromEntries(
		(["log", "warn", "error"] as const).map((method) => [method, console[method]]),
	) as Pick<Console, "log" | "warn" | "error">;
	for (const method of ["log", "warn", "error"] as const) {
		console[method] = (...values: unknown[]) => {
			runtimeConsole.push(`${method}: ${values.map(String).join(" ")}`.slice(0, 1_000));
		};
	}
	let renderFailure: unknown = null;
	try {
		const { exportToBlob, exportToSvg } = await import("@excalidraw/excalidraw");
		const { DEFAULT_MERMAID_CONFIG } = await import(
			"../src/server/board-rendering/index.js"
		);
		const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
		const input = fixtureInput();
		const png = await exportToBlob({ ...input, mimeType: "image/png" });
		const svg = new XMLSerializer().serializeToString(await exportToSvg(input));
		const diagram = readFileSync(join(fixtureRoot, "diagram.mmd"), "utf8");
		const valid = await parseMermaidToExcalidraw(diagram, DEFAULT_MERMAID_CONFIG);
		let malformed = "accepted";
		try {
			await parseMermaidToExcalidraw("flowchart LR\n  invalid[", DEFAULT_MERMAID_CONFIG);
		} catch (error) {
			malformed = error instanceof Error ? error.name : String(error);
		}
		report = {
			...report,
			status: "passed",
			export: {
				pngBytes: png.size,
				svgBytes: svg.length,
				hasLabel: svg.includes("Service API"),
				hasImage: svg.includes("data:image/png;base64"),
			},
			mermaid: { validElementCount: valid.elements.length, malformed },
		};
		if (png.size < 1 || !svg.includes("Service API") || !svg.includes("data:image/png;base64"))
			throw new Error("Emulation did not render the canonical board fixture.");
		if (valid.elements.length !== 0 || malformed === "accepted")
			throw new Error(
				`Emulation no longer reproduces the Mermaid gap: ${JSON.stringify(report.mermaid)}`,
			);
		if (runtimeConsole.length > 0)
			throw new Error(`Emulation emitted runtime diagnostics: ${JSON.stringify(runtimeConsole)}`);
	} catch (error) {
		renderFailure = error;
	} finally {
		Object.assign(console, originalConsole);
		fontRegistry.removeAll();
		const restored = globals.restore();
		(report.globals as Record<string, unknown>).restored = restored;
		report.runtimeConsole = runtimeConsole.slice(-20);
	}
	if (!(report.globals as Record<string, unknown>).restored)
		throw new Error("Emulation did not restore every installed global.");
	if (renderFailure) throw renderFailure;
} catch (error) {
	failure = error;
	report = {
		...report,
		status: "failed",
		failure:
			error instanceof Error
				? { name: error.name, message: error.message, stack: error.stack }
				: String(error),
	};
} finally {
	rmSync(dependencyRoot, { recursive: true, force: true });
	report.cleanup = { dependencyRootRemoved: !existsSync(dependencyRoot) };
	await Bun.write(reportPath, JSON.stringify(report, null, 2) + "\n");
}

if (failure) throw new Error(`Server emulation proof failed. Disposable report: ${reportPath}`);
globalThis.process.stdout.write(
	`Server emulation proof passed. Disposable report: ${reportPath}\n`,
);

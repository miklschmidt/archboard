import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { projectPreviewSnapshot } from "@/ui/board-preview";
import { readNote } from "@/runtime/engine/board-io";
import { isBlockId } from "@/shared/ids/ids";
import {
	importDependency,
	installDom,
	isRecord,
	registerFonts,
	requireFunction,
	type JsonRecord,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./probe-server-rendering-emulation/emulated-dom.ts";

const root = resolve(import.meta.dir, "..");
const fixtureRoot = resolve(root, "docs/design/server-rendering-boundary-fixtures");
const fixtureNote = join(fixtureRoot, "board.excalidraw.md");
const manifest = join(fixtureRoot, "emulation/package.json");
const lockfile = join(fixtureRoot, "emulation/bun.lock");
const fontDirectory = join(root, "node_modules/@excalidraw/excalidraw/dist/dev/fonts/Excalifont");
const installTimeoutMs = 20_000;
const cleanupTimeoutMs = 5_000;

/**
 * Refuse to run without every fixture the emulation reads.
 * @throws {Error} When a fixture file is absent.
 */
function requirePreflight(): void {
	for (const file of [fixtureNote, manifest, lockfile, join(fixtureRoot, "diagram.mmd")]) {
		if (!existsSync(file)) {
			throw new Error(`Emulation preflight failed: ${file} is absent.`);
		}
	}
}

/**
 * The disposable report directory this proof owns.
 * @param argv The command-line arguments, which must be empty.
 * @returns A fresh temporary directory.
 * @throws {Error} When arguments were passed.
 */
function ownedOutputDirectory(argv: readonly string[]): string {
	if (argv.length > 0) {
		throw new Error(
			"This proof owns its output. Run without arguments; it creates one disposable report directory under the system temporary root.",
		);
	}
	return mkdtempSync(join(tmpdir(), "archboard-server-rendering-emulation-proof-"));
}

/**
 * Whether a persisted file entry is a complete PNG export file under its id.
 * @param id The file id it is stored under.
 * @param file The persisted file record.
 * @returns Whether every export field is present and consistent.
 */
function isPngExportFile(id: string, file: JsonRecord): boolean {
	const dataUrl = file["dataURL"];
	return (
		file["id"] === id &&
		file["mimeType"] === "image/png" &&
		typeof dataUrl === "string" &&
		dataUrl.startsWith("data:image/png;base64,") &&
		typeof file["created"] === "number"
	);
}

/**
 * Validate persisted files as Excalidraw export files.
 * @param files The persisted files keyed by id.
 * @returns The same files typed for export.
 * @throws {Error} When any file is incomplete.
 */
function exportFiles(files: Record<string, unknown>): BinaryFiles {
	for (const [id, raw] of Object.entries(files)) {
		if (!isRecord(raw)) {
			throw new Error(`Persisted file ${id} is invalid.`);
		}
		if (!isPngExportFile(id, raw)) {
			throw new Error(`Persisted file ${id} is not a complete PNG export file.`);
		}
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every entry was validated above; Excalidraw brands FileId and DataURL nominally
	return files as unknown as BinaryFiles;
}

/**
 * The canonical persisted board projected to a render input.
 * @returns The elements, files and app state the export functions take.
 * @throws {Error} When the fixture cannot be read or is not the expected board.
 */
function fixtureInput(): Record<string, unknown> {
	const content = readNote(fixtureNote);
	if (!content) {
		throw new Error(`Cannot read the canonical persisted board fixture: ${fixtureNote}`);
	}
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
	) {
		throw new Error("Canonical board read did not produce the expected block-safe render input.");
	}
	return {
		elements: scene.elements,
		files: exportFiles(scene.files),
		appState: { exportBackground: true, viewBackgroundColor: "#f8fafc" },
	};
}

/**
 * Stop a child that outlived its deadline: SIGTERM, then SIGKILL.
 * @param child The child to stop.
 */
async function stopChild(child: Bun.Subprocess): Promise<void> {
	if (child.exitCode === null) {
		child.kill("SIGTERM");
	}
	await Promise.race([child.exited, Bun.sleep(cleanupTimeoutMs - 1_000)]);
	if (child.exitCode === null) {
		child.kill("SIGKILL");
	}
	await Promise.race([child.exited, Bun.sleep(1_000)]);
}

/**
 * Install the emulation dependencies from the tracked manifest and lockfile
 * into a disposable directory.
 * @param directory The directory to install into.
 * @returns The installer's output.
 * @throws {Error} When the install fails or exceeds its timeout.
 */
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
	const stdout = new Response(child.stdout).text();
	const stderr = new Response(child.stderr).text();
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
		await stopChild(child);
		throw error;
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
	const output = { stdout: await stdout, stderr: await stderr };
	if (child.exitCode !== 0) {
		throw new Error(`Disposable emulation dependency install failed: ${output.stderr}`);
	}
	return output;
}

/**
 * Capture console output during the render so stray diagnostics fail the proof.
 * @param sink Receives each captured line.
 * @returns The step that restores the real console.
 */
function captureConsole(sink: string[]): () => void {
	const original = { log: console.log, warn: console.warn, error: console.error };
	for (const method of ["log", "warn", "error"] as const) {
		/**
		 * Record a console call instead of printing it.
		 * @param values The logged values.
		 */
		console[method] = (...values: unknown[]) => {
			sink.push(`${method}: ${values.map(String).join(" ")}`.slice(0, 1_000));
		};
	}
	return () => {
		Object.assign(console, original);
	};
}

/**
 * The name of a thrown value.
 * @param error The caught value.
 * @returns The error's name, or the value as text.
 */
function errorName(error: unknown): string {
	return error instanceof Error ? error.name : String(error);
}

/**
 * Convert the fixture diagram and a malformed one through Mermaid, recording
 * how each is handled.
 * @returns The valid element count and the malformed diagram's outcome.
 */
async function probeMermaid(): Promise<{ validElementCount: number; malformed: string }> {
	const { DEFAULT_MERMAID_CONFIG } = await import("@/server/board-rendering");
	const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
	const diagram = readFileSync(join(fixtureRoot, "diagram.mmd"), "utf8");
	const valid = await parseMermaidToExcalidraw(diagram, DEFAULT_MERMAID_CONFIG);
	let malformed = "accepted";
	try {
		await parseMermaidToExcalidraw("flowchart LR\n  invalid[", DEFAULT_MERMAID_CONFIG);
	} catch (error) {
		malformed = errorName(error);
	}
	return { validElementCount: valid.elements.length, malformed };
}

interface ExportEvidence {
	pngBytes: number;
	svgBytes: number;
	hasLabel: boolean;
	hasImage: boolean;
}

/**
 * Export the canonical board to PNG and SVG through Excalidraw.
 * @returns What the exports contained.
 */
async function exportFixture(): Promise<ExportEvidence> {
	const { exportToBlob, exportToSvg } = await import("@excalidraw/excalidraw");
	const rawInput = fixtureInput();
	// The persisted fixture is fully validated above; this boundary restores Excalidraw's nominal element brands after deserialization.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the line above
	const input = rawInput as Parameters<typeof exportToBlob>[0] & Parameters<typeof exportToSvg>[0];
	const png = await exportToBlob({ ...input, mimeType: "image/png" });
	const svg = new XMLSerializer().serializeToString(await exportToSvg(input));
	return {
		pngBytes: png.size,
		svgBytes: svg.length,
		hasLabel: svg.includes("Service API"),
		hasImage: svg.includes("data:image/png;base64"),
	};
}

/**
 * Export the canonical board under the emulated DOM and reproduce the Mermaid gap.
 * @returns The export and Mermaid evidence.
 * @throws {Error} When the render or the Mermaid gap is not as expected.
 */
async function renderUnderEmulation(): Promise<JsonRecord> {
	const exported = await exportFixture();
	const mermaid = await probeMermaid();
	if (exported.pngBytes < 1 || !exported.hasLabel || !exported.hasImage) {
		throw new Error("Emulation did not render the canonical board fixture.");
	}
	if (mermaid.validElementCount !== 0 || mermaid.malformed === "accepted") {
		throw new Error(`Emulation no longer reproduces the Mermaid gap: ${JSON.stringify(mermaid)}`);
	}
	return { export: exported, mermaid };
}

const output = ownedOutputDirectory(Bun.argv.slice(2));
const dependencyRoot = join(output, "dependencies");
const reportPath = join(output, "report.json");
let report: JsonRecord = {
	status: "failed",
	output: { directory: output, disposable: true },
};
let failure: unknown = null;

try {
	requirePreflight();
	const installed = await install(dependencyRoot);
	const happy = await importDependency(dependencyRoot, "happy-dom/lib/index.js");
	const canvas = await importDependency(dependencyRoot, "@napi-rs/canvas/index.js");
	const window = Reflect.construct(requireFunction(happy, "Window"), [
		{ url: "http://archboard.local/" },
	]);
	if (!isRecord(window)) {
		throw new Error("happy-dom did not construct a window.");
	}
	const globals = installDom(window, canvas);
	const fonts = registerFonts(canvas, fontDirectory);
	report = {
		status: "running",
		output: { directory: output, disposable: true },
		dependencyManifest: manifest,
		install: { stdout: installed.stdout.slice(-2_000), stderr: installed.stderr.slice(-2_000) },
		globals: { installed: globals.installed, restored: false },
		fonts: { discovered: fonts.discovered, registered: fonts.registered },
	};
	const runtimeConsole: string[] = [];
	const releaseConsole = captureConsole(runtimeConsole);
	let renderFailure: unknown = null;
	let restored = false;
	try {
		report = { ...report, status: "passed", ...(await renderUnderEmulation()) };
		if (runtimeConsole.length > 0) {
			throw new Error(`Emulation emitted runtime diagnostics: ${JSON.stringify(runtimeConsole)}`);
		}
	} catch (error) {
		renderFailure = error;
	} finally {
		releaseConsole();
		fonts.removeAll();
		restored = globals.restore();
		report["globals"] = { installed: globals.installed, restored };
		report["runtimeConsole"] = runtimeConsole.slice(-20);
	}
	if (!restored) {
		throw new Error("Emulation did not restore every installed global.");
	}
	if (renderFailure) {
		throw renderFailure;
	}
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
	report["cleanup"] = { dependencyRootRemoved: !existsSync(dependencyRoot) };
	await Bun.write(reportPath, JSON.stringify(report, null, 2) + "\n");
}

if (failure) {
	throw new Error(`Server emulation proof failed. Disposable report: ${reportPath}`);
}
globalThis.process.stdout.write(
	`Server emulation proof passed. Disposable report: ${reportPath}\n`,
);

import fs from "fs";
import path from "path";
import os from "os";
import { parseArgs, CliUsageError, readStdin } from "../args.js";
import { printJson, note, requireBrowserClient } from "../util.js";
import { ensureCanvasRunning } from "../../core/spawn.js";
import {
	getElements,
	clearCanvas,
	exportImage,
	sendMermaid,
	boardHeading,
} from "../../core/canvas-client.js";
import { buildSceneFile, importScene } from "../../core/scene-document.js";
import { wrapSceneAsObsidianMd, isObsidianExcalidrawMd } from "../../core/obsidian-md.js";
import { describeScene } from "../../core/describe.js";
import { exportToExcalidrawUrl } from "../../core/share-url.js";
import { EXPRESS_SERVER_URL } from "../../core/config.js";

async function readTextFileOrStdin(inputPath: string | undefined): Promise<string> {
	if (!inputPath || inputPath === "-") return await readStdin();
	return fs.readFileSync(path.resolve(inputPath), "utf-8");
}

export async function describe(argv: string[]): Promise<void> {
	parseArgs(argv, {});
	await ensureCanvasRunning();
	const elements = await getElements();
	const heading = await boardHeading();
	// Plain text by design: this is the human/agent-readable scene summary
	process.stdout.write((heading ? heading + "\n\n" : "") + describeScene(elements) + "\n");
}

export async function screenshot(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, {
		out: { takesValue: true },
		format: { takesValue: true },
		"no-background": { takesValue: false },
		pane: { takesValue: true },
	});

	const format = (flags.format as string | undefined) ?? "png";
	if (format !== "png" && format !== "svg") {
		throw new CliUsageError("--format must be png or svg");
	}

	await ensureCanvasRunning();
	await requireBrowserClient("screenshot");

	// A picture is of one pane, and with a proposal in the second one the pane
	// that answers by default is the wrong half of the wall.
	const result = await exportImage(
		format,
		!flags["no-background"],
		typeof flags.pane === "string" ? flags.pane : undefined,
	);

	let outPath = flags.out as string | undefined;
	if (!outPath && format === "svg") {
		process.stdout.write(result.data + "\n");
		return;
	}
	if (!outPath) {
		outPath = path.join(os.tmpdir(), `excalidraw-screenshot-${Date.now()}.png`);
	}

	const resolved = path.resolve(outPath);
	if (format === "svg") {
		fs.writeFileSync(resolved, result.data, "utf-8");
	} else {
		fs.writeFileSync(resolved, Buffer.from(result.data, "base64"));
	}
	printJson({ success: true, file: resolved, format });
}

// The current content of an export destination, or undefined when there is
// nothing there to preserve. Anything unreadable is treated as absent — the
// write itself will surface the real problem.
function readExistingTarget(resolved: string): string | undefined {
	try {
		return fs.readFileSync(resolved, "utf-8");
	} catch {
		return undefined;
	}
}

export async function exportCmd(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, {
		out: { takesValue: true },
		format: { takesValue: true },
		force: { takesValue: false },
	});

	const outPath = typeof flags.out === "string" ? flags.out : undefined;
	// A .md out path means an Obsidian vault destination, where raw .excalidraw
	// JSON only opens in the Excalidraw plugin's compatibility mode.
	const format =
		(flags.format as string | undefined) ?? (outPath?.endsWith(".md") ? "obsidian" : "json");
	if (format !== "json" && format !== "obsidian") {
		throw new CliUsageError("--format must be json or obsidian");
	}

	const resolved = outPath ? path.resolve(outPath) : undefined;
	// An Obsidian note carries state the scene does not — board identity and
	// any other frontmatter the vault put there — so the destination is read
	// before it is overwritten, and its frontmatter is carried across.
	const existing = resolved && format === "obsidian" ? readExistingTarget(resolved) : undefined;
	if (
		existing !== undefined &&
		existing.trim() !== "" &&
		!isObsidianExcalidrawMd(existing) &&
		!flags.force
	) {
		throw new CliUsageError(
			`${resolved} exists and is not an Obsidian .excalidraw.md file; exporting would overwrite it. ` +
				"Pass --force to overwrite it anyway (its frontmatter is still preserved).",
		);
	}

	await ensureCanvasRunning();
	const { scene, elementCount } = await buildSceneFile();
	const output =
		format === "obsidian" ? wrapSceneAsObsidianMd(scene, existing) : JSON.stringify(scene, null, 2);

	if (resolved) {
		fs.writeFileSync(resolved, output, "utf-8");
		printJson({ success: true, file: resolved, elements: elementCount, format });
		return;
	}

	process.stdout.write(output + "\n");
}

export async function importCmd(argv: string[]): Promise<void> {
	const { positionals, flags } = parseArgs(argv, { replace: { takesValue: false } });

	await ensureCanvasRunning();

	const mode = flags.replace ? ("replace" as const) : ("merge" as const);
	// File access belongs to the CLI. The domain import accepts scene data and
	// does not carry a second, caller-specific path policy.
	const data = await readTextFileOrStdin(positionals[0]);
	if (!data.trim()) {
		throw new CliUsageError(
			"No scene provided (pass a .excalidraw / .excalidraw.md file or pipe JSON to stdin)",
		);
	}
	const result = await importScene({ data, mode });

	printJson({ success: true, imported: result.count, files: result.fileCount, mode: result.mode });
}

export async function mermaid(argv: string[]): Promise<void> {
	const { positionals } = parseArgs(argv, {});

	const diagram = await readTextFileOrStdin(positionals[0]);
	if (!diagram.trim()) {
		throw new CliUsageError("No Mermaid diagram provided (pass a file or pipe to stdin)");
	}

	await ensureCanvasRunning();
	// Conversion happens in the browser (mermaid-to-excalidraw needs DOM access)
	await requireBrowserClient("mermaid conversion");

	const result = await sendMermaid(diagram);
	// Which half of the screen to watch. The pane came from the board, so this
	// is a report rather than a choice the caller had to make (TASK-046).
	const where = result.pane
		? result.pane.place === "the only pane"
			? "the only pane"
			: `the ${result.pane.place} pane`
		: "the open canvas tab";
	note(`Conversion happens in ${where}, at ${EXPRESS_SERVER_URL}.`);
	printJson({
		success: result.success ?? true,
		board: result.board,
		pane: result.pane ?? null,
		message: result.message,
	});
}

export async function share(argv: string[]): Promise<void> {
	parseArgs(argv, {});
	await ensureCanvasRunning();
	const elements = await getElements();
	const url = await exportToExcalidrawUrl(elements);
	printJson({ success: true, url });
}

export async function clear(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, { yes: { takesValue: false } });
	if (!flags.yes) {
		throw new CliUsageError("clear wipes the whole canvas; pass --yes to confirm");
	}

	await ensureCanvasRunning();
	const result = await clearCanvas();
	printJson({ success: true, cleared: result.count ?? 0 });
}

import fs from "fs";
import path from "path";
import os from "os";
import { parseArgs, CliUsageError, readStdin } from "./args.js";
import { printJson, note, requireBrowserClient } from "./util.js";
import { ensureCanvasRunning } from "../../runtime/engine/spawn.js";
import {
	getElements,
	clearCanvas,
	exportImage,
	sendMermaid,
	boardHeading,
} from "../../runtime/engine/canvas-client.js";
import { importScene } from "../../runtime/engine/scene-document.js";
import { describeScene } from "../../runtime/engine/describe.js";
import { exportToExcalidrawUrl } from "../../runtime/engine/share-url.js";
import { EXPRESS_SERVER_URL } from "../../runtime/engine/config.js";

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

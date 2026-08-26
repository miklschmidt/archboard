import fs from "fs";
import path from "path";
import os from "os";
import { z } from "zod";
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
import { defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema } from "../command-contract/schemas.js";

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

export const ImportInputSchema = z.object({
	file: z.string().optional(),
	replace: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
export type ImportInput = z.infer<typeof ImportInputSchema>;

export const ImportResultSchema = z.object({
	success: z.literal(true),
	imported: z.number().int().nonnegative(),
	files: z.number().int().nonnegative(),
	mode: z.enum(["merge", "replace"]),
	held: HoldReportSchema.optional(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

export const importContract = defineCommand({
	path: ["import"],
	summary: "Import a .excalidraw or Obsidian .excalidraw.md file (merge by default)",
	usage: "import [scene.excalidraw|note.excalidraw.md|-] [--replace] (or stdin)",
	description:
		"Imports scene data after the canvas prerequisite, merging unless replace is selected.",
	examples: ['archboard import scene.excalidraw --board system --doing "importing scene"'],
	parameters: [
		{
			kind: "option",
			key: "replace",
			spellings: ["--replace"],
			value: "none",
			description: "Replace rather than merge",
		},
		{
			kind: "positional",
			key: "file",
			name: "file",
			route: "stdin-or-file",
			description: "Scene file, or -/omitted for stdin",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: ImportInputSchema },
	result: ImportResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Import receipt",
				presentation: ["result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["write"],
	refusals: [
		{ code: "BOARD_REQUIRED", exit: 2, stream: "stderr", description: "No board was named." },
		{
			code: "CANVAS_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description: "The canvas could not be reached.",
		},
		{ code: "BOARD_CONFLICT", exit: 5, stream: "stderr", description: "The write was refused." },
	],
	relationships: [
		{
			method: "POST",
			path: "/api/elements/batch",
			cardinality: "one",
			description: "Merge imported elements",
		},
		{
			method: "DELETE",
			path: "/api/elements/clear",
			cardinality: "conditional",
			description: "Clear before replace import",
		},
	],
	async handler(input, context) {
		await context.require("server", "import");
		const data =
			input.file && input.file !== "-"
				? context.readTextFile(context.resolvePath(input.file))
				: await context.readStdin();
		if (!data.trim())
			throw new CliUsageError(
				"No scene provided (pass a .excalidraw / .excalidraw.md file or pipe JSON to stdin)",
			);
		const mode = input.replace ? ("replace" as const) : ("merge" as const);
		const result = await importScene({ data, mode });
		return {
			result: {
				success: true as const,
				imported: result.count,
				files: result.fileCount,
				mode: result.mode,
			},
		};
	},
});

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

export const ClearInputSchema = z.object({
	yes: z.literal(true, { error: "clear wipes the whole canvas; pass --yes to confirm" }),
	tail: z.array(z.string()).default([]),
});
export type ClearInput = z.infer<typeof ClearInputSchema>;
export const ClearResultSchema = z.object({
	success: z.literal(true),
	cleared: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
export type ClearResult = z.infer<typeof ClearResultSchema>;

export const clearContract = defineCommand({
	path: ["clear"],
	summary: "Clear the whole canvas",
	usage: "clear --yes",
	description: "Clears the named board only after explicit confirmation.",
	examples: ['archboard clear --yes --board scratch --doing "clearing scratch"'],
	parameters: [
		{
			kind: "option",
			key: "yes",
			spellings: ["--yes"],
			value: "none",
			description: "Confirm the destructive write",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: ClearInputSchema },
	result: ClearResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Clear receipt",
				presentation: ["result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["write"],
	refusals: [
		{ code: "BOARD_REQUIRED", exit: 2, stream: "stderr", description: "No board was named." },
		{
			code: "CANVAS_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description: "The canvas could not be reached.",
		},
		{ code: "BOARD_CONFLICT", exit: 5, stream: "stderr", description: "The clear was refused." },
	],
	relationships: [
		{
			method: "DELETE",
			path: "/api/elements/clear",
			cardinality: "one",
			description: "Clear the board",
		},
	],
	async handler(_input, context) {
		await context.require("server", "clear");
		const result = await clearCanvas();
		return { result: { success: true as const, cleared: result.count ?? 0 } };
	},
});

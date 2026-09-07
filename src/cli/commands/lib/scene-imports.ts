// The two commands that bring an external document onto a board: an Excalidraw scene import
// and a Mermaid conversion. Split from scene.ts to keep that entrypoint under the line limit.
import { z } from "zod";
import { sendMermaid } from "@/runtime/engine/canvas-client";
import { importScene } from "@/runtime/engine/scene-document";
import { defineCommand } from "@/cli/command-contract/contract";
import type { CommandContext } from "@/cli/command-contract/contract";
import { HoldReportSchema } from "@/cli/command-contract/schemas";
import { boardWriteRefusals, commonRefusals, doingRefusal } from "@/cli/command-contract/common";

/**
 * Reads the document a command was pointed at: a named file, or stdin when the positional is
 * omitted or the conventional dash.
 * @param context - The command execution context that owns file and stdin access.
 * @param file - The positional file argument, if any.
 * @returns The document text.
 */
async function readDocumentArgument(
	context: CommandContext,
	file: string | undefined,
): Promise<string> {
	return file && file !== "-"
		? context.readTextFile(context.resolvePath(file))
		: await context.readStdin();
}

const ImportInputSchema = z.object({
	file: z.string().optional(),
	replace: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
type ImportInput = z.infer<typeof ImportInputSchema>;
const ImportDocumentStageSchema = z.string().refine((value) => value.trim().length > 0, {
	message: "No scene provided (pass a .excalidraw / .excalidraw.md file or pipe JSON to stdin)",
});
type ImportDocumentStage = z.infer<typeof ImportDocumentStageSchema>;

const ImportResultSchema = z.object({
	success: z.literal(true),
	imported: z.number().int().nonnegative(),
	files: z.number().int().nonnegative(),
	mode: z.enum(["merge", "replace"]),
	held: HoldReportSchema.optional(),
});
type ImportResult = z.infer<typeof ImportResultSchema>;

const importContract = defineCommand({
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
	input: {
		ingress: ImportInputSchema,
		stages: [
			{
				name: "scene-document",
				when: "before-server",
				description: "Non-empty scene document read from file or stdin",
				schema: ImportDocumentStageSchema,
			},
		],
	},
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
		/**
		 * Import has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["write"],
	refusals: boardWriteRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/elements/batch",
			cardinality: "one",
			description: "Append a merge or atomically replace imported elements and files",
		},
		{
			method: "POST",
			path: "/api/files",
			cardinality: "conditional",
			description: "Best-effort embedded files after a merge import",
		},
	],
	/**
	 * Reads the scene document after the canvas is reachable and imports it, merging unless
	 * --replace was passed.
	 * @param input - The parsed import input.
	 * @param context - The command execution context.
	 * @returns The import receipt with element and file counts.
	 */
	async handler(input, context) {
		await context.require("server", "import");
		const data = context.parse(
			ImportDocumentStageSchema,
			await readDocumentArgument(context, input.file),
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

const MermaidInputSchema = z.object({
	file: z.string().optional(),
	tail: z.array(z.string()).default([]),
});
type MermaidInput = z.infer<typeof MermaidInputSchema>;
const MermaidDiagramStageSchema = z.string().refine((value) => value.trim().length > 0, {
	message: "No Mermaid diagram provided (pass a file or pipe to stdin)",
});
type MermaidDiagramStage = z.infer<typeof MermaidDiagramStageSchema>;
const MermaidResultSchema = z.looseObject({
	success: z.literal(true),
	board: z.string(),
	count: z.number().int().positive(),
	ids: z.array(z.string()).min(1),
	held: HoldReportSchema.optional(),
});
type MermaidResult = z.infer<typeof MermaidResultSchema>;
const mermaidContract = defineCommand({
	path: ["mermaid"],
	summary: "Convert Mermaid into one named persisted board",
	usage: "mermaid [diagram.mmd|-] (or stdin)",
	description:
		"Reads Mermaid text locally, converts it in the server-owned renderer, and commits one board write.",
	examples: ['archboard mermaid diagram.mmd --board system --doing "drawing diagram"'],
	parameters: [
		{
			kind: "positional",
			key: "file",
			name: "file",
			route: "stdin-or-file",
			description: "Mermaid file, or -/omitted for stdin",
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
	input: {
		ingress: MermaidInputSchema,
		stages: [
			{
				name: "mermaid-diagram",
				when: "before-server",
				description: "Non-empty Mermaid source read from file or stdin",
				schema: MermaidDiagramStageSchema,
			},
		],
	},
	result: MermaidResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Mermaid conversion receipt",
				presentation: ["diagnostics", "result", "held-note"],
			},
		],
		/**
		 * Mermaid has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["local-read", "write"],
	refusals: [...commonRefusals, doingRefusal],
	relationships: [
		{
			method: "POST",
			path: "/api/elements/from-mermaid",
			cardinality: "one",
			description: "Convert and write the diagram",
		},
	],
	/**
	 * Reads the Mermaid source locally before contacting the canvas, then converts and writes
	 * it as one board write.
	 * @param input - The parsed mermaid input.
	 * @param context - The command execution context.
	 * @returns The conversion receipt with the written element ids.
	 */
	async handler(input, context) {
		const diagram = context.parse(
			MermaidDiagramStageSchema,
			await readDocumentArgument(context, input.file),
		);
		await context.require("server", "mermaid conversion");
		const result = await sendMermaid(diagram);
		return {
			result: MermaidResultSchema.parse({
				success: true,
				board: result.board,
				count: result.count,
				ids: result.ids,
			}),
		};
	},
});

export {
	ImportInputSchema,
	type ImportInput,
	ImportDocumentStageSchema,
	type ImportDocumentStage,
	ImportResultSchema,
	type ImportResult,
	importContract,
	MermaidInputSchema,
	type MermaidInput,
	MermaidDiagramStageSchema,
	type MermaidDiagramStage,
	MermaidResultSchema,
	type MermaidResult,
	mermaidContract,
};

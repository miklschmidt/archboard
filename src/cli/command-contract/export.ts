import { z } from "zod";
import { buildSceneFile } from "../../runtime/engine/scene-document.js";
import { isObsidianExcalidrawMd, wrapSceneAsObsidianMd } from "../../runtime/engine/obsidian-md.js";
import { CliUsageError, defineCommand, type PendingArtifact } from "./contract.js";
import { HoldReportSchema, PendingArtifactSchema } from "./schemas.js";
import { commonRefusals, tail } from "./lib/common.js";

export const ExportInputSchema = z.object({
	out: z.string().optional(),
	format: z.string().optional(),
	force: z.boolean().default(false),
	tail,
});
export type ExportInput = z.infer<typeof ExportInputSchema>;

const exportFormatSchema = z.enum(["json", "obsidian"], {
	error: "--format must be json or obsidian",
});
const resolvedExportFormatSchema = z
	.object({ format: z.string().optional(), out: z.string().optional() })
	.transform(({ format, out }) => format ?? (out?.endsWith(".md") ? "obsidian" : "json"))
	.pipe(exportFormatSchema)
	.describe("Use the explicit format, otherwise infer obsidian for .md output and json elsewhere.");
export const ExportReceiptSchema = z.object({
	success: z.literal(true),
	file: z.string(),
	elements: z.number().int().nonnegative(),
	format: exportFormatSchema,
	held: HoldReportSchema.optional(),
});
export type ExportReceipt = z.infer<typeof ExportReceiptSchema>;
export const ExportContentSchema = z.string();
export type ExportContent = z.infer<typeof ExportContentSchema>;
export const ExportResultSchema = z.union([ExportContentSchema, ExportReceiptSchema]);
export type ExportResult = z.infer<typeof ExportResultSchema>;

export const exportContract = defineCommand({
	path: ["export"],
	summary: "Export the scene as .excalidraw JSON or Obsidian .excalidraw.md",
	usage:
		"export [--out scene.excalidraw | note.excalidraw.md] [--format json|obsidian] [--force] (a .md out path implies obsidian; --force overwrites a non-Excalidraw destination, still preserving its frontmatter)",
	description: "Builds a portable scene and emits raw content or writes one local file.",
	examples: [
		"archboard export --board payments",
		"archboard export --board payments --out payments.excalidraw",
	],
	parameters: [
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			route: "stdin-or-file",
			description: "Destination file",
		},
		{
			kind: "option",
			key: "format",
			spellings: ["--format"],
			value: "required",
			description: "json or obsidian",
		},
		{
			kind: "option",
			key: "force",
			spellings: ["--force"],
			value: "none",
			description: "Overwrite a non-Excalidraw note",
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
		ingress: ExportInputSchema,
		stages: [
			{
				name: "format",
				when: "before-server",
				description: "Explicit format or .md inference",
				rules: [
					"Use an explicit --format when present.",
					"Otherwise use obsidian for an --out path ending in .md, and json for every other destination or stdout.",
				],
				schema: resolvedExportFormatSchema,
			},
		],
	},
	result: ExportResultSchema,
	output: {
		cases: [
			{
				id: "raw",
				when: { key: "out", present: false },
				mode: "raw",
				held: "none",
				description: "Exact serialized scene content",
			},
			{
				id: "file",
				when: { key: "out", present: true },
				mode: "file-receipt",
				held: "object-field-and-stderr-note",
				description: "Validated file receipt",
				artifact: PendingArtifactSchema,
			},
		],
		select: (input) => (input.out === undefined ? "raw" : "file"),
	},
	prerequisites: ["server", "board"],
	effects: ["local-read", "read", "local-write"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/elements",
			cardinality: "parallel",
			description: "Required scene elements",
		},
		{
			method: "GET",
			path: "/api/files",
			cardinality: "parallel",
			description: "Best-effort image files",
		},
	],
	async handler(input, context) {
		const format = context.parse(resolvedExportFormatSchema, {
			format: input.format,
			out: input.out,
		});
		const resolved = input.out ? context.resolvePath(input.out) : undefined;
		const existing =
			resolved && format === "obsidian" ? context.readOptionalTextFile(resolved) : undefined;
		if (
			existing !== undefined &&
			existing.trim() !== "" &&
			!isObsidianExcalidrawMd(existing) &&
			!input.force
		) {
			throw new CliUsageError(
				`${resolved} exists and is not an Obsidian .excalidraw.md file; exporting would overwrite it. ` +
					"Pass --force to overwrite it anyway (its frontmatter is still preserved).",
			);
		}
		await context.require("server", "Exporting the scene");
		const { scene, elementCount } = await buildSceneFile();
		const content =
			format === "obsidian"
				? wrapSceneAsObsidianMd(scene, existing)
				: JSON.stringify(scene, null, 2);
		if (!resolved) return { result: content };
		const artifact: PendingArtifact = { path: resolved, content, encoding: "utf8" };
		return {
			result: { success: true as const, file: resolved, elements: elementCount, format },
			pendingArtifact: artifact,
		};
	},
});

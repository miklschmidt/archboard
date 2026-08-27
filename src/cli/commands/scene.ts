import os from "os";
import path from "path";
import { z } from "zod";
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
import { defineCommand, type PendingArtifact } from "../command-contract/contract.js";
import {
	HoldReportSchema,
	PaneRefSchema,
	PendingArtifactSchema,
} from "../command-contract/schemas.js";
import {
	boardWriteRefusals,
	commonRefusals,
	doingRefusal,
	serverBrowserRefusals,
} from "../command-contract/common.js";

export const DescribeInputSchema = z.object({ tail: z.array(z.string()).default([]) });
export type DescribeInput = z.infer<typeof DescribeInputSchema>;
export const DescribeResultSchema = z.string();
export type DescribeResult = z.infer<typeof DescribeResultSchema>;

export const describeContract = defineCommand({
	path: ["describe"],
	summary: "AI-readable scene description (plain text)",
	usage: "describe",
	description: "Returns the complete human-readable description for the named board.",
	examples: ["archboard describe --board system"],
	parameters: [
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: DescribeInputSchema },
	result: DescribeResultSchema,
	output: {
		cases: [
			{
				id: "text",
				when: {},
				mode: "text",
				held: "none",
				description: "Scene description",
				presentation: ["result"],
			},
		],
		select: () => "text",
	},
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/elements",
			cardinality: "one",
			description: "Read scene elements",
		},
		{
			method: "GET",
			path: "/api/boards/info",
			cardinality: "one",
			description: "Read the board heading",
		},
	],
	async handler(_input, context) {
		await context.require("server", "describe");
		const elements = await getElements();
		const heading = await boardHeading();
		return { result: (heading ? heading + "\n\n" : "") + describeScene(elements) };
	},
});

export const ScreenshotInputSchema = z.object({
	out: z.string().optional(),
	format: z.enum(["png", "svg"], { error: "--format must be png or svg" }).default("png"),
	noBackground: z.boolean().default(false),
	pane: z.string().optional(),
	tail: z.array(z.string()).default([]),
});
export type ScreenshotInput = z.infer<typeof ScreenshotInputSchema>;
export const ScreenshotReceiptSchema = z.object({
	success: z.literal(true),
	file: z.string(),
	format: z.enum(["png", "svg"]),
	held: HoldReportSchema.optional(),
});
export type ScreenshotReceipt = z.infer<typeof ScreenshotReceiptSchema>;
export const ScreenshotResultSchema = z.union([z.string(), ScreenshotReceiptSchema]);
export type ScreenshotResult = z.infer<typeof ScreenshotResultSchema>;
export const screenshotContract = defineCommand({
	path: ["screenshot"],
	summary: "Capture one pane (needs an open browser tab)",
	usage: "screenshot [--out file.png] [--format png|svg] [--no-background] [--pane <spec>]",
	description: "Renders one pane in the browser and returns raw SVG or a validated file receipt.",
	examples: ["archboard screenshot --board system --out system.png"],
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
			description: "png or svg",
		},
		{
			kind: "option",
			key: "noBackground",
			spellings: ["--no-background"],
			value: "none",
			description: "Render without the canvas background",
		},
		{
			kind: "option",
			key: "pane",
			spellings: ["--pane"],
			value: "required",
			description: "Pane selector",
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
	input: { ingress: ScreenshotInputSchema },
	result: ScreenshotResultSchema,
	output: {
		cases: [
			{ id: "raw-svg", when: {}, mode: "raw", held: "none", description: "Raw SVG image" },
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				held: "object-field-and-stderr-note",
				description: "Written image receipt",
				presentation: ["result", "held-note"],
				artifact: PendingArtifactSchema,
			},
		],
		select: (input) => (input.format === "svg" && input.out === undefined ? "raw-svg" : "file"),
	},
	prerequisites: ["server", "browser"],
	effects: ["browser", "local-write"],
	refusals: serverBrowserRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/export/image",
			cardinality: "one",
			description: "Render the selected pane",
		},
	],
	async handler(input, context) {
		await context.require("server", "screenshot");
		await context.require("browser", "screenshot");
		const image = await exportImage(input.format, !input.noBackground, input.pane);
		if (!input.out && input.format === "svg") return { result: image.data };
		const resolved = context.resolvePath(
			input.out ?? path.join(os.tmpdir(), `excalidraw-screenshot-${Date.now()}.png`),
		);
		const artifact: PendingArtifact =
			input.format === "svg"
				? { path: resolved, content: image.data, encoding: "utf8" }
				: { path: resolved, content: Buffer.from(image.data, "base64"), encoding: "binary" };
		return {
			result: { success: true as const, file: resolved, format: input.format },
			pendingArtifact: artifact,
		};
	},
});

export const ImportInputSchema = z.object({
	file: z.string().optional(),
	replace: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
export type ImportInput = z.infer<typeof ImportInputSchema>;
export const ImportDocumentStageSchema = z.string().refine((value) => value.trim().length > 0, {
	message: "No scene provided (pass a .excalidraw / .excalidraw.md file or pipe JSON to stdin)",
});
export type ImportDocumentStage = z.infer<typeof ImportDocumentStageSchema>;

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
	async handler(input, context) {
		await context.require("server", "import");
		const data = context.parse(
			ImportDocumentStageSchema,
			input.file && input.file !== "-"
				? context.readTextFile(context.resolvePath(input.file))
				: await context.readStdin(),
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

export const MermaidInputSchema = z.object({
	file: z.string().optional(),
	tail: z.array(z.string()).default([]),
});
export type MermaidInput = z.infer<typeof MermaidInputSchema>;
export const MermaidDiagramStageSchema = z.string().refine((value) => value.trim().length > 0, {
	message: "No Mermaid diagram provided (pass a file or pipe to stdin)",
});
export type MermaidDiagramStage = z.infer<typeof MermaidDiagramStageSchema>;
export const MermaidResultSchema = z.looseObject({
	success: z.boolean(),
	board: z.string().optional(),
	pane: PaneRefSchema.nullable(),
	message: z.string().optional(),
	held: HoldReportSchema.optional(),
});
export type MermaidResult = z.infer<typeof MermaidResultSchema>;
export const mermaidContract = defineCommand({
	path: ["mermaid"],
	summary: "Render a Mermaid diagram onto the canvas (needs a browser tab)",
	usage: "mermaid [diagram.mmd|-] (or stdin)",
	description:
		"Reads Mermaid text locally before contacting the canvas, then converts it in the board's pane.",
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
		select: () => "json",
	},
	prerequisites: ["server", "browser", "board", "doing"],
	effects: ["local-read", "browser", "write"],
	refusals: [...commonRefusals, ...serverBrowserRefusals.slice(1), doingRefusal],
	relationships: [
		{
			method: "POST",
			path: "/api/elements/from-mermaid",
			cardinality: "one",
			description: "Convert and write the diagram",
		},
	],
	async handler(input, context) {
		const diagram = context.parse(
			MermaidDiagramStageSchema,
			input.file && input.file !== "-"
				? context.readTextFile(context.resolvePath(input.file))
				: await context.readStdin(),
		);
		await context.require("server", "mermaid conversion");
		await context.require("browser", "mermaid conversion");
		const result = await sendMermaid(diagram);
		const where = result.pane
			? result.pane.place === "the only pane"
				? "the only pane"
				: `the ${result.pane.place} pane`
			: "the open canvas tab";
		return {
			result: MermaidResultSchema.parse({
				success: result.success ?? true,
				board: result.board,
				pane: result.pane ?? null,
				message: result.message,
			}),
			diagnostics: [`Conversion happens in ${where}, at ${EXPRESS_SERVER_URL}.`],
		};
	},
});

export const ShareInputSchema = z.object({ tail: z.array(z.string()).default([]) });
export type ShareInput = z.infer<typeof ShareInputSchema>;
export const ShareResultSchema = z.object({
	success: z.literal(true),
	url: z.string(),
	held: HoldReportSchema.optional(),
});
export type ShareResult = z.infer<typeof ShareResultSchema>;
export const shareContract = defineCommand({
	path: ["share"],
	summary: "Export to a shareable excalidraw.com URL",
	usage: "share",
	description: "Reads only the board elements and uploads an encrypted share payload.",
	examples: ["archboard share --board system"],
	parameters: [
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: ShareInputSchema },
	result: ShareResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Share URL",
				presentation: ["result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/elements",
			cardinality: "one",
			description: "Read elements for the share payload",
		},
	],
	async handler(_input, context) {
		await context.require("server", "share");
		const url = await exportToExcalidrawUrl(await getElements());
		return { result: { success: true as const, url } };
	},
});

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
	refusals: boardWriteRefusals,
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

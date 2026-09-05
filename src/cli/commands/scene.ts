import os from "os";
import path from "path";
import { z } from "zod";
import {
	getElements,
	clearCanvas,
	captureBrowser,
	renderBoard,
	sendMermaid,
	boardHeading,
} from "../../runtime/engine/canvas-client.js";
import { importScene } from "../../runtime/engine/scene-document.js";
import { describeScene } from "../../runtime/engine/describe.js";
import { exportToExcalidrawUrl } from "../../runtime/engine/share-url.js";
import {
	CliUsageError,
	defineCommand,
	type PendingArtifact,
} from "../command-contract/contract.js";
import { HoldReportSchema, PendingArtifactSchema } from "../command-contract/schemas.js";
import {
	boardWriteRefusals,
	commonRefusals,
	doingRefusal,
	serverBrowserRefusals,
} from "../command-contract/common.js";

const DescribeInputSchema = z.object({ tail: z.array(z.string()).default([]) });
type DescribeInput = z.infer<typeof DescribeInputSchema>;
const DescribeResultSchema = z.string();
type DescribeResult = z.infer<typeof DescribeResultSchema>;

const describeContract = defineCommand({
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

const ScreenshotInputSchema = z.object({
	out: z.string().optional(),
	format: z.enum(["png", "svg"], { error: "--format must be png or svg" }).default("png"),
	noBackground: z.boolean().default(false),
	pane: z.string().min(1, "--pane is required"),
	tail: z.array(z.string()).default([]),
});
type ScreenshotInput = z.infer<typeof ScreenshotInputSchema>;
const ScreenshotReceiptSchema = z.object({
	success: z.literal(true),
	file: z.string(),
	format: z.enum(["png", "svg"]),
	held: HoldReportSchema.optional(),
});
type ScreenshotReceipt = z.infer<typeof ScreenshotReceiptSchema>;
const ScreenshotResultSchema = z.union([z.string(), ScreenshotReceiptSchema]);
type ScreenshotResult = z.infer<typeof ScreenshotResultSchema>;
const screenshotContract = defineCommand({
	path: ["browser", "capture"],
	summary: "Capture one explicit live pane (needs an open browser tab)",
	usage: "browser capture --pane <spec> [--out file.png] [--format png|svg] [--no-background]",
	description: "Captures what one connected browser pane currently shows without writing a board.",
	examples: ["archboard browser capture --pane left --out system.png"],
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
			path: "/api/browser/capture",
			cardinality: "one",
			description: "Render the selected pane",
		},
	],
	async handler(input, context) {
		await context.require("server", "screenshot");
		await context.require("browser", "screenshot");
		const image = await captureBrowser(input.format, !input.noBackground, input.pane);
		if (!input.out && input.format === "svg") {
			return { result: image.data };
		}
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

const RenderInputSchema = z.object({
	out: z.string().min(1, "render requires --out <file>"),
	format: z.enum(["png", "svg"], { error: "--format must be png or svg" }).default("png"),
	noBackground: z.boolean().default(false),
	padding: z.coerce.number().int().min(0).max(128).default(16),
	scale: z.coerce.number().min(0.25).max(4).default(1),
	tail: z.array(z.string()).default([]),
});
type RenderInput = z.infer<typeof RenderInputSchema>;
const RenderResultSchema = z.object({
	success: z.literal(true),
	board: z.string(),
	file: z.string(),
	format: z.enum(["png", "svg"]),
	width: z.number().positive(),
	height: z.number().positive(),
	padding: z.number().int().nonnegative(),
	scale: z.number().positive(),
	background: z.boolean(),
	backgroundColor: z.string(),
	sourceFingerprint: z.string(),
});
type RenderResult = z.infer<typeof RenderResultSchema>;
const renderContract = defineCommand({
	path: ["render"],
	summary: "Render one named persisted board to PNG or SVG",
	usage:
		"render --board <key> --out <file> [--format png|svg] [--no-background] [--padding <px>] [--scale <n>]",
	description:
		"Renders one persisted board snapshot in the server-owned renderer. The command never reads or changes a live pane or camera.",
	examples: ["archboard render --board system --out system.png"],
	parameters: [
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
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
			description: "Render with a transparent background",
		},
		{
			kind: "option",
			key: "padding",
			spellings: ["--padding"],
			value: "required",
			description: "Full-board padding in scene pixels, 0 to 128",
		},
		{
			kind: "option",
			key: "scale",
			spellings: ["--scale"],
			value: "required",
			description: "Output scale, 0.25 to 4",
		},
		{
			kind: "positional",
			key: "tail",
			name: "extra",
			repeatable: true,
			description: "Unexpected positional arguments",
		},
	],
	input: { ingress: RenderInputSchema },
	result: RenderResultSchema,
	output: {
		cases: [
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				held: "none",
				description: "Written board render receipt",
				presentation: ["result"],
				artifact: PendingArtifactSchema,
			},
		],
		select: () => "file",
	},
	prerequisites: ["server", "board"],
	effects: ["read", "local-write"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/render/board",
			cardinality: "one",
			description: "Render one immutable persisted snapshot",
		},
	],
	async handler(input, context) {
		if (input.tail.length > 0) {
			throw new CliUsageError("render takes no positional arguments");
		}
		await context.require("server", "board rendering");
		const rendered = await renderBoard({
			format: input.format,
			background: !input.noBackground,
			padding: input.padding,
			scale: input.scale,
		});
		const file = context.resolvePath(input.out);
		const artifact: PendingArtifact =
			rendered.format === "svg"
				? { path: file, content: rendered.data, encoding: "utf8" }
				: { path: file, content: Buffer.from(rendered.data, "base64"), encoding: "binary" };
		return {
			result: RenderResultSchema.parse({ ...rendered, file, data: undefined }),
			pendingArtifact: artifact,
		};
	},
});

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
	async handler(input, context) {
		const diagram = context.parse(
			MermaidDiagramStageSchema,
			input.file && input.file !== "-"
				? context.readTextFile(context.resolvePath(input.file))
				: await context.readStdin(),
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

const ShareInputSchema = z.object({ tail: z.array(z.string()).default([]) });
type ShareInput = z.infer<typeof ShareInputSchema>;
const ShareResultSchema = z.object({
	success: z.literal(true),
	url: z.string(),
	held: HoldReportSchema.optional(),
});
type ShareResult = z.infer<typeof ShareResultSchema>;
const shareContract = defineCommand({
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

const ClearInputSchema = z.object({
	yes: z.literal(true, { error: "clear wipes the whole canvas; pass --yes to confirm" }),
	tail: z.array(z.string()).default([]),
});
type ClearInput = z.infer<typeof ClearInputSchema>;
const ClearResultSchema = z.object({
	success: z.literal(true),
	cleared: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
type ClearResult = z.infer<typeof ClearResultSchema>;

const clearContract = defineCommand({
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

export {
	DescribeInputSchema,
	type DescribeInput,
	DescribeResultSchema,
	type DescribeResult,
	describeContract,
	ScreenshotInputSchema,
	type ScreenshotInput,
	ScreenshotReceiptSchema,
	type ScreenshotReceipt,
	ScreenshotResultSchema,
	type ScreenshotResult,
	screenshotContract,
	RenderInputSchema,
	type RenderInput,
	RenderResultSchema,
	type RenderResult,
	renderContract,
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
	ShareInputSchema,
	type ShareInput,
	ShareResultSchema,
	type ShareResult,
	shareContract,
	ClearInputSchema,
	type ClearInput,
	ClearResultSchema,
	type ClearResult,
	clearContract,
};

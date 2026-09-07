import { z } from "zod";
import { getElements, clearCanvas, boardHeading } from "@/runtime/engine/canvas-client";
import { describeScene } from "@/runtime/engine/describe";
import { exportToExcalidrawUrl } from "@/runtime/engine/share-url";
import { defineCommand } from "@/cli/command-contract/contract";
import { HoldReportSchema } from "@/cli/command-contract/schemas";
import { boardWriteRefusals, commonRefusals } from "@/cli/command-contract/common";
import {
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
} from "@/cli/commands/lib/scene-images";
import {
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
} from "@/cli/commands/lib/scene-imports";

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
		/**
		 * Describe is always plain text.
		 * @returns The text case id.
		 */
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
	/**
	 * Reads the board's elements and heading and renders the prose description.
	 * @param _input - The parsed describe input (unused: the board comes from the request context).
	 * @param context - The command execution context.
	 * @returns The heading, when the board has one, followed by the scene description.
	 */
	async handler(_input, context) {
		await context.require("server", "describe");
		const elements = await getElements();
		const heading = await boardHeading();
		return { result: (heading ? heading + "\n\n" : "") + describeScene(elements) };
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
		/**
		 * Share has one output shape.
		 * @returns The JSON case id.
		 */
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
	/**
	 * Uploads the board's elements as an encrypted excalidraw.com share payload.
	 * @param _input - The parsed share input (unused: the board comes from the request context).
	 * @param context - The command execution context.
	 * @returns The share URL.
	 */
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
		/**
		 * Clear has one output shape.
		 * @returns The JSON case id.
		 */
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
	/**
	 * Wipes the requested board; the --yes confirmation was already enforced by the input schema.
	 * @param _input - The parsed clear input (unused beyond the schema-enforced confirmation).
	 * @param context - The command execution context.
	 * @returns The number of elements cleared.
	 */
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

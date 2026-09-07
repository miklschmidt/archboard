// The two commands that produce an image of a board: a live pane capture and a
// persisted-snapshot render. Split from scene.ts to keep that entrypoint under the line limit.
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { captureBrowser, renderBoard } from "@/runtime/engine/canvas-client";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import type { PendingArtifact } from "@/cli/command-contract/contract";
import { HoldReportSchema, PendingArtifactSchema } from "@/cli/command-contract/schemas";
import { commonRefusals, serverBrowserRefusals } from "@/cli/command-contract/common";

/**
 * Builds the file artifact for an image the server returned: SVG is text, PNG arrives base64.
 * @param file - The resolved destination path.
 * @param format - The image format the server rendered.
 * @param data - The SVG text or base64 PNG payload.
 * @returns The pending artifact the command runner writes after a successful result.
 */
function imageArtifact(file: string, format: "png" | "svg", data: string): PendingArtifact {
	return format === "svg"
		? { path: file, content: data, encoding: "utf8" }
		: { path: file, content: Buffer.from(data, "base64"), encoding: "binary" };
}

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
		/**
		 * An SVG with no destination streams raw to stdout; everything else is written to a file.
		 * @param input - The parsed capture input.
		 * @returns The output case id.
		 */
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
	/**
	 * Captures one live pane; a destination-less SVG is returned inline, otherwise the image is
	 * written to --out or a temporary PNG.
	 * @param input - The parsed capture input.
	 * @param context - The command execution context.
	 * @returns The raw SVG, or a file receipt with the pending artifact.
	 */
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
		return {
			result: { success: true as const, file: resolved, format: input.format },
			pendingArtifact: imageArtifact(resolved, input.format, image.data),
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
		/**
		 * Render always writes a file.
		 * @returns The file case id.
		 */
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
	/**
	 * Renders the persisted snapshot of the requested board in the server-owned renderer and
	 * hands the image back as a file artifact.
	 * @param input - The parsed render input.
	 * @param context - The command execution context.
	 * @returns The render receipt (without image bytes) and the pending artifact.
	 */
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
		return {
			result: RenderResultSchema.parse({ ...rendered, file, data: undefined }),
			pendingArtifact: imageArtifact(file, rendered.format, rendered.data),
		};
	},
});

export {
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
};

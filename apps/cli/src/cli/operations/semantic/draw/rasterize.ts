// Drawing a semantic board to a bitmap on stdout or in a file: the same picture `semantic render`
// draws, rasterized headlessly at one bitmap pixel per diagram pixel unless a
// scale says otherwise (ADR 0023: the renderer owns every coordinate; this
// command owns none and adds none).

import { createHash } from "node:crypto";
import { z } from "zod";
import {
	DiagramThemeSchema,
	LayoutEngineSchema,
	type DrawnBoard,
} from "@archboard/board/render-reply";
import { renderSemanticBoardOnServer } from "@archboard/server-lifecycle/semantic-board-client";
import {
	RASTER_MAX_SCALE,
	RASTER_MIN_SCALE,
	SemanticRasterError,
	createSemanticRasterizer,
	type PageRegion,
	type Capture,
} from "@archboard/renderer/rasterizer";
import {
	SemanticRasterReceiptSchema,
	type SemanticRasterPageSize,
} from "@archboard/renderer/rasterizer";
import { CliUsageError, defineCommand } from "#cli/protocol/contract/contract.ts";
import { refuseNothingDrawn, viewEmptyRefusal } from "#cli/rules/semantic/draw/nothing-drawn.ts";
import { PendingArtifactSchema } from "#cli/protocol/contract/schemas.ts";
import {
	DRAWN_AGAINST,
	SelectorSchema,
	UNNAMED_VARIANT,
	drawnAgainst,
	exportRenderRequest,
	TITLE_OPTION,
	TitleOptionSchema,
	LEGEND_OPTIONS,
	LEGEND_ONLY_REFUSAL,
	LegendInputSchema,
	legendStated,
} from "#cli/operations/semantic/input/semantic-input.ts";
import {
	AGAINST_NO_COMPARISON_REFUSAL,
	AGAINST_OPTION,
	againstAgreesWithComparison,
	resolvedAgainst,
} from "#cli/operations/semantic/draw/drawn-against.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { copyImageToClipboard } from "#cli/operations/semantic/draw/image-clipboard.ts";
import { pictureReceipt } from "#cli/rules/semantic/draw/drawn-receipt.ts";

const THEMES = DiagramThemeSchema.options;

const RasterizeInputSchema = z
	.object({
		name: z.string(),
		variant: SelectorSchema.optional(),
		view: SelectorSchema.optional(),
		theme: DiagramThemeSchema.default("light"),
		layout: LayoutEngineSchema.optional(),
		against: SelectorSchema.optional(),
		noComparison: z.boolean().default(false),
		title: TitleOptionSchema,
		...LegendInputSchema,
		scale: z.coerce.number().min(RASTER_MIN_SCALE).max(RASTER_MAX_SCALE).default(1),
		region: z
			.string()
			.regex(
				/^\d+,\d+,[1-9]\d*,[1-9]\d*$/u,
				"--region takes x,y,width,height in whole diagram pixels",
			)
			.transform((text) => {
				const [x = 0, y = 0, width = 1, height = 1] = text.split(",").map(Number);
				return { x, y, width, height };
			})
			.optional(),
		out: z.string().optional(),
		clipboard: z.boolean().default(false),
	})
	.refine(legendStated, LEGEND_ONLY_REFUSAL)
	.refine(againstAgreesWithComparison, AGAINST_NO_COMPARISON_REFUSAL)
	.refine((input) => !input.clipboard || input.out === undefined, {
		message: "Use either --clipboard or --out, not both.",
		path: ["clipboard"],
	});

const ClipboardResultSchema = SemanticRasterReceiptSchema.omit({ file: true }).extend({
	clipboard: z.object({
		formats: z.tuple([z.literal("image/png"), z.literal("text/html")]),
		description: z.string(),
	}),
});

const rasterizerUnavailableRefusal = {
	code: "RASTERIZER_UNAVAILABLE",
	exit: 4,
	stream: "stderr" as const,
	description:
		"No Chromium or Google Chrome executable was found, or the one named could not start.",
};
const rasterBoundsRefusal = {
	code: "RASTER_BOUNDS_EXCEEDED",
	exit: 2,
	stream: "stderr" as const,
	description: "The bitmap the diagram and scale ask for is larger than one capture may be.",
};
const rasterFailedRefusal = {
	code: "RASTER_FAILED",
	exit: 1,
	stream: "stderr" as const,
	description: "The browser did not produce the bitmap the diagram asks for; nothing was written.",
};

/**
 * The requested region, refused when it reaches outside the page: a tile
 * that is partly ground would be a picture of nothing anybody asked for.
 * @param region What was asked for, if anything.
 * @param page The diagram's page.
 * @returns The region, or undefined for the whole page.
 * @throws {CliUsageError} When the region leaves the page.
 */
function regionWithin(
	region: PageRegion | undefined,
	page: SemanticRasterPageSize,
): PageRegion | undefined {
	if (region === undefined) return undefined;
	if (region.x + region.width > page.width || region.y + region.height > page.height) {
		throw new CliUsageError(
			`--region ${region.x},${region.y},${region.width},${region.height} reaches outside the ${page.width}×${page.height} diagram.`,
		);
	}
	return region;
}

/**
 * Identify the picture whose accessibility metadata is copied with it.
 * @param drawn The selected board picture.
 * @param input The export choices.
 * @returns The board, variant and view identity, including any crop or comparison.
 */
function clipboardIdentity(drawn: DrawnBoard, input: z.infer<typeof RasterizeInputSchema>): string {
	const against = drawnAgainst(drawn, input.noComparison);
	return `${input.region === undefined ? "" : "Region of "}${drawn.board}, variant ${drawn.variant.name}${drawn.view === null ? "" : `, view ${drawn.view.name}`}${against === null ? "" : `. Compared with ${against.name}`}`;
}

/**
 * Capture one board and finish browser cleanup before any destination changes.
 * @param drawn The self-contained SVG and its page size.
 * @param input The bitmap scale and optional region.
 * @param signal The caller's cancellation signal.
 * @returns The complete PNG after clean browser teardown.
 * @throws {SemanticRasterError} When capture or cleanup fails.
 */
async function captureBoard(
	drawn: DrawnBoard,
	input: z.infer<typeof RasterizeInputSchema>,
	signal: AbortSignal,
): Promise<Capture> {
	const rasterizer = createSemanticRasterizer();
	let capture;
	let cleanup;
	try {
		capture = await rasterizer.rasterize(
			{
				svg: drawn.svg,
				width: drawn.width,
				height: drawn.height,
				scale: input.scale,
				region: regionWithin(input.region, drawn),
			},
			signal,
		);
	} finally {
		cleanup = await rasterizer.stop();
	}
	if (!cleanup.clean) {
		throw new SemanticRasterError(
			"RASTER_FAILED",
			`The rasterizer's cleanup was not clean: ${cleanup.errors.join("; ")}`,
		);
	}
	return capture;
}

const semanticRasterizeContract = defineCommand({
	path: ["semantic", "rasterize"],
	shared: ["url", "directory"],
	summary: "Draw a semantic board as PNG, headlessly, at native scale",
	description:
		"Draws the same picture `semantic render` draws and rasterizes it in a private headless Chromium: " +
		"one bitmap pixel per diagram pixel by default, whatever the display or any open pane is doing. " +
		"The whole diagram is captured, never fitted or cropped; a bitmap that would exceed what one " +
		"capture may hold is refused. Traffic animation is paused at its first frame. Needs a Chromium or " +
		"Google Chrome executable on PATH or named by ARCHBOARD_RENDERER_CHROMIUM. " +
		"Without --out or --clipboard, stdout carries PNG bytes. " +
		"Use --clipboard to copy PNG and HTML with the accessible description on Linux and macOS. " +
		"Use --no-comparison to hide comparison marks and removed subjects. " +
		"Use --against to draw relative to another variant, marking only what the drawn variant changes over it and " +
		"leaving out the Planned frame.",
	examples: [
		"archboard semantic rasterize pipeline --out pipeline.png",
		'archboard semantic rasterize pipeline --view "Startup exchange" --scale 2 --out startup@2x.png',
		"archboard semantic rasterize pipeline --clipboard",
		'archboard semantic rasterize pipeline --variant "TASK-2" --against "TASK-1" --out task-2.png',
		'archboard semantic rasterize pipeline --view "Startup exchange" --clipboard --no-comparison',
	],
	parameters: [
		{
			kind: "positional",
			key: "name",
			name: "name",
			required: true,
			description: "The board's name",
		},
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			placeholder: "file.png",
			description:
				"Write the PNG to this file and print a JSON receipt. Without --out or --clipboard, print PNG bytes to stdout.",
		},
		{
			kind: "option",
			key: "clipboard",
			spellings: ["--clipboard"],
			value: "none",
			description:
				"Copy PNG and self-contained HTML with its description, then print a JSON receipt. Uses the local Linux or macOS clipboard. Cannot be combined with --out.",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			description: `Which variant to draw, by id or name; ${UNNAMED_VARIANT}. ${DRAWN_AGAINST}`,
		},
		{
			kind: "option",
			key: "view",
			spellings: ["--view"],
			value: "required",
			placeholder: "view",
			description:
				"Which shared board view to draw, by id or name, or Everything for every part; the overview when absent",
		},
		AGAINST_OPTION,
		{
			kind: "option",
			key: "noComparison",
			spellings: ["--no-comparison"],
			value: "none",
			description:
				"Hide comparison marks and removed subjects; draw the selected variant without standing decoration",
		},
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			placeholder: "theme",
			choices: THEMES,
			default: "light",
			description: "Which ground to draw on",
		},
		{
			kind: "option",
			key: "layout",
			spellings: ["--layout"],
			value: "required",
			placeholder: "engine",
			choices: LayoutEngineSchema.options,
			description: "Which layout engine lays the architecture out; the default one when absent",
		},
		TITLE_OPTION,
		...LEGEND_OPTIONS,
		{
			kind: "option",
			key: "scale",
			spellings: ["--scale"],
			value: "required",
			placeholder: "factor",
			default: "1",
			description: `Bitmap pixels per diagram pixel, ${RASTER_MIN_SCALE} to ${RASTER_MAX_SCALE}; 1 is native`,
		},
		{
			kind: "option",
			key: "region",
			spellings: ["--region"],
			value: "required",
			placeholder: "x,y,width,height",
			description:
				"Draw only this rectangle of the diagram's page, in diagram pixels: a native-detail tile of a large diagram, never the diagram itself",
		},
	],
	input: { ingress: RasterizeInputSchema },
	result: z.union([
		SemanticRasterReceiptSchema,
		ClipboardResultSchema,
		z.instanceof(Uint8Array<ArrayBufferLike>).meta({ description: "The PNG image as bytes." }),
	]),
	output: {
		cases: [
			{
				id: "clipboard",
				when: { key: "clipboard", present: true },
				mode: "json",
				description: "The copied image, its formats and its HTML description",
			},
			{
				id: "file",
				when: { key: "out", present: true },
				mode: "file-receipt",
				description: "The PNG that was written",
				artifact: PendingArtifactSchema,
			},
			{
				id: "stdout",
				when: {},
				mode: "raw",
				description: "The PNG image as bytes when no destination is specified",
			},
		],
		/**
		 * Choose image bytes, a file receipt or a clipboard receipt.
		 * @param input The requested destination.
		 * @returns The output case's id.
		 */
		select: (input) =>
			input.clipboard ? "clipboard" : input.out === undefined ? "stdout" : "file",
	},
	prerequisites: ["server"],
	effects: ["read", "local-write"],
	refusals: [
		serverRefusal,
		viewEmptyRefusal,
		rasterizerUnavailableRefusal,
		rasterBoundsRefusal,
		rasterFailedRefusal,
		{
			code: "CLIPBOARD_UNAVAILABLE",
			exit: 4,
			stream: "stderr",
			description: "The native clipboard is unavailable on this desktop.",
		},
		{
			code: "CLIPBOARD_FAILED",
			exit: 1,
			stream: "stderr",
			description: "The native clipboard did not accept both image formats.",
		},
	],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/render",
			cardinality: "one",
			description: "Draw the variant",
		},
	],
	/**
	 * Draw the board and rasterize it.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The PNG bytes or the file or clipboard receipt.
	 * @throws {Error} When the board or the view has nothing to draw.
	 * @throws {SemanticRasterError} When no browser can draw it or the bitmap is not what was asked for.
	 */
	async handler(input, context) {
		await context.require("server", "semantic rasterize");
		const drawn = await renderSemanticBoardOnServer(
			input.name,
			exportRenderRequest({ ...input, against: await resolvedAgainst(input.name, input) }),
		);
		if ("empty" in drawn) refuseNothingDrawn(drawn);
		const capture = await captureBoard(drawn, input, context.signal);
		if (!input.clipboard && input.out === undefined) return { result: capture.png };
		const receipt = {
			success: true as const,
			board: drawn.board,
			version: drawn.version,
			variant: drawn.variant,
			comparedWith: drawnAgainst(drawn, input.noComparison),
			view: drawn.view,
			theme: input.theme,
			width: capture.width,
			height: capture.height,
			scale: input.scale,
			diagram: { width: drawn.width, height: drawn.height },
			region: input.region ?? null,
			...pictureReceipt(drawn, input.noComparison),
			source: {
				renderer: "semantic-renderer" as const,
				svgSha256: createHash("sha256").update(drawn.svg).digest("hex"),
				motion: "paused-at-start" as const,
			},
		};
		if (input.out !== undefined) {
			const file = context.resolvePath(input.out);
			return {
				result: { ...receipt, file },
				pendingArtifact: { path: file, content: capture.png, encoding: "binary" as const },
			};
		}
		const description = await copyImageToClipboard(
			{
				png: capture.png,
				width: capture.width,
				height: capture.height,
				svg: drawn.svg,
				description: clipboardIdentity(drawn, input),
			},
			context.signal,
		);
		const clipboard: z.infer<typeof ClipboardResultSchema>["clipboard"] = {
			formats: ["image/png", "text/html"],
			description,
		};
		return { result: { ...receipt, clipboard } };
	},
});

export { SemanticRasterError, semanticRasterizeContract };

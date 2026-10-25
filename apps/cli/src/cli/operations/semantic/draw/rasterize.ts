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
	type Capture,
} from "@archboard/renderer/rasterizer";
import { SemanticRasterReceiptSchema } from "@archboard/renderer/rasterizer";
import { embedRecipeInPng, type RenderRecipe } from "@archboard/renderer/recipe";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { regionWithin } from "#cli/rules/semantic/draw/raster-region.ts";
import { refuseNothingDrawn, viewEmptyRefusal } from "#cli/rules/semantic/draw/nothing-drawn.ts";
import { PendingArtifactSchema } from "#cli/protocol/contract/schemas.ts";
import {
	DRAWN_AGAINST,
	SelectorSchema,
	UNNAMED_VARIANT,
	drawnAgainst,
	exportRenderRequest,
} from "#cli/operations/semantic/input/semantic-input.ts";
import {
	drawnLegend,
	LEGEND_OPTIONS,
	LegendInputSchema,
	legendStated,
	NO_LEGEND_REFUSAL,
	TITLE_OPTION,
	TitleOptionSchema,
} from "#cli/operations/semantic/draw/framing-options.ts";
import {
	AGAINST_NO_COMPARISON_REFUSAL,
	AGAINST_OPTION,
	againstAgreesWithComparison,
	resolvedAgainst,
} from "#cli/operations/semantic/draw/drawn-against.ts";
import {
	boardHeldRefusal,
	claimRevokedRefusal,
	doingRefusal,
	serverRefusal,
} from "#cli/protocol/contract/refusals.ts";
import { copyImageToClipboard } from "#cli/operations/semantic/draw/image-clipboard.ts";
import { pictureReceipt } from "#cli/rules/semantic/draw/drawn-receipt.ts";
import {
	recipeOfPicture,
	vaultRepositoryUnknownRefusal,
} from "#cli/rules/semantic/draw/picture-recipe.ts";
import {
	plannedFile,
	requireTrackable,
	TRACK_NEEDS_OUT,
	TRACK_OPTION,
	TRACK_RELATIONSHIP,
	TrackedReceiptSchema,
	trackedField,
	trackHasOut,
	trackOutsideCheckoutRefusal,
	trackVaultUnregisteredRefusal,
} from "#cli/operations/semantic/draw/tracked-embed.ts";

const THEMES = DiagramThemeSchema.options;

const RasterizeInputSchema = z
	.object({
		name: z.string(),
		variant: SelectorSchema.optional(),
		view: SelectorSchema.optional(),
		theme: DiagramThemeSchema.default("dark"),
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
		track: z.boolean().default(false),
	})
	.refine(trackHasOut, TRACK_NEEDS_OUT)
	.refine(legendStated, NO_LEGEND_REFUSAL)
	.refine(againstAgreesWithComparison, AGAINST_NO_COMPARISON_REFUSAL)
	.refine((input) => !input.clipboard || input.out === undefined, {
		message: "Use either --clipboard or --out, not both.",
		path: ["clipboard"],
	});

/** The receipt of a PNG written to a file, with what --track listed. */
const FileResultSchema = SemanticRasterReceiptSchema.extend({
	tracked: TrackedReceiptSchema.optional(),
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
	description:
		"The browser did not produce the bitmap the diagram asks for, or the server's picture carried no " +
		"render recipe for it; nothing was written.",
};

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

/**
 * The recipe of the SVG the bitmap is drawn from, and the scale and region that
 * draw it from that SVG, so every PNG this command gives out, on stdout, in a
 * file or on the clipboard, carries one recipe (ADR 0057). Read before any
 * browser starts: a picture without one is refused.
 * @param svg The SVG the server drew, which carries its recipe.
 * @param input The bitmap's scale and region.
 * @returns The recipe the bitmap carries.
 * @throws {SemanticRasterError} When the SVG carries no recipe to give.
 */
function bitmapRecipe(svg: string, input: z.infer<typeof RasterizeInputSchema>): RenderRecipe {
	const read = recipeOfPicture(svg);
	if ("problem" in read) throw new SemanticRasterError("RASTER_FAILED", read.problem);
	return { ...read.recipe, raster: { scale: input.scale, region: input.region ?? null } };
}

const semanticRasterizeContract = defineCommand({
	path: ["semantic", "rasterize"],
	shared: ["url", "directory", "doing"],
	summary: "Draw a semantic board as PNG, headlessly, at native scale",
	description: [
		"Draws the same picture that `semantic render` draws, and rasterizes it in a private headless Chromium. It needs a Chromium or Google Chrome executable on PATH, or one that ARCHBOARD_RENDERER_CHROMIUM names.",
		"",
		"The picture:",
		"- One bitmap pixel for each diagram pixel by default, whatever the display or an open pane does.",
		"- The whole diagram, never fitted or cropped. A bitmap larger than one capture can hold is refused.",
		"- The traffic animation stops at its first frame.",
		"- Each PNG carries the render recipe of its SVG, with the scale and the region, in a text chunk.",
		"",
		"Output:",
		"- Without --out or --clipboard, stdout carries the PNG bytes.",
		"- --clipboard copies PNG and HTML with the accessible description, on Linux and macOS.",
		"- With --out and --track, the board lists the file as a tracked embed before the file is written, as `semantic render` describes.",
		"",
		"Comparison:",
		"- --no-comparison hides the comparison marks and the removed subjects.",
		"- --against draws relative to another variant. It marks only what the drawn variant changes over that variant, and leaves out the Planned frame.",
	].join("\n"),
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
			default: "dark",
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
		TRACK_OPTION,
	],
	input: { ingress: RasterizeInputSchema },
	result: z.union([
		FileResultSchema,
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
	effects: ["read", "local-write", "server-state-write"],
	refusals: [
		serverRefusal,
		viewEmptyRefusal,
		rasterizerUnavailableRefusal,
		rasterBoundsRefusal,
		rasterFailedRefusal,
		vaultRepositoryUnknownRefusal,
		trackOutsideCheckoutRefusal,
		trackVaultUnregisteredRefusal,
		doingRefusal,
		boardHeldRefusal,
		claimRevokedRefusal,
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
		TRACK_RELATIONSHIP,
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
		const planned = await plannedFile(input, context);
		const drawn = await renderSemanticBoardOnServer(
			input.name,
			exportRenderRequest({
				...input,
				legend: drawnLegend(input),
				against: await resolvedAgainst(input.name, input),
			}),
		);
		if ("empty" in drawn) refuseNothingDrawn(drawn);
		const recipe = bitmapRecipe(drawn.svg, input);
		requireTrackable(planned, recipe);
		const capture = await captureBoard(drawn, input, context.signal);
		const png = embedRecipeInPng(capture.png, recipe);
		if (!input.clipboard && input.out === undefined) return { result: png };
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
				fonts: "embedded" as const,
				svgSha256: createHash("sha256").update(drawn.svg).digest("hex"),
				facesLoaded: capture.fonts,
				motion: "paused-at-start" as const,
			},
		};
		if (planned.file !== undefined) {
			const { file } = planned;
			return {
				result: { ...receipt, file, ...(await trackedField(input.name, planned)) },
				pendingArtifact: { path: file, content: png, encoding: "binary" as const },
			};
		}
		const description = await copyImageToClipboard(
			{
				png,
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

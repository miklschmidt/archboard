// Drawing a semantic board to a bitmap: the same picture `semantic render`
// draws, rasterized headlessly at one bitmap pixel per diagram pixel unless a
// scale says otherwise (ADR 0023: the renderer owns every coordinate; this
// command owns none and adds none).

import { createHash } from "node:crypto";
import { z } from "zod";
import { DiagramThemeSchema } from "@/shared/semantic-board/index";
import { renderSemanticBoardOnCanvas } from "@/runtime/semantic-board-client/index";
import {
	RASTER_MAX_SCALE,
	RASTER_MIN_SCALE,
	SemanticRasterError,
	createSemanticRasterizer,
	type PageRegion,
} from "@/runtime/semantic-rasterizer/index";
import {
	SemanticRasterReceiptSchema,
	type SemanticRasterPageSize,
} from "@/runtime/semantic-rasterizer/receipt";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { PendingArtifactSchema } from "@/cli/command-contract/schemas";
import { SelectorSchema, drawnAgainst } from "@/cli/commands/lib/semantic-input";
import { serverRefusal } from "@/cli/command-contract/common";

const THEMES = DiagramThemeSchema.options;

const RasterizeInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema.optional(),
	view: SelectorSchema.optional(),
	theme: DiagramThemeSchema.default("light"),
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
	out: z.string(),
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

const semanticRasterizeContract = defineCommand({
	path: ["semantic", "rasterize"],
	shared: ["url"],
	summary: "Draw a semantic board to a PNG file, headlessly, at native scale",
	description:
		"Draws the same picture `semantic render` draws and rasterizes it in a private headless Chromium: " +
		"one bitmap pixel per diagram pixel by default, whatever the display or any open pane is doing. " +
		"The whole diagram is captured, never fitted or cropped; a bitmap that would exceed what one " +
		"capture may hold is refused. Traffic animation is paused at its first frame. Needs a Chromium or " +
		"Google Chrome executable on PATH or named by ARCHBOARD_RENDERER_CHROMIUM.",
	examples: [
		"archboard semantic rasterize pipeline --out pipeline.png",
		'archboard semantic rasterize pipeline --view "Startup exchange" --scale 2 --out startup@2x.png',
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
			required: true,
			description: "Where to write the PNG",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			description:
				"Which variant to draw, by id or name; the current one when absent. A variant with a predecessor is drawn as the comparison with it, and the receipt names that predecessor",
		},
		{
			kind: "option",
			key: "view",
			spellings: ["--view"],
			value: "required",
			placeholder: "view",
			description: "Which shared board view to draw, by id or name; the whole variant when absent",
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
	result: SemanticRasterReceiptSchema,
	output: {
		cases: [
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				description: "The PNG that was written",
				artifact: PendingArtifactSchema,
			},
		],
		/**
		 * One answer: the file.
		 * @returns The output case's id.
		 */
		select: () => "file",
	},
	prerequisites: ["server"],
	effects: ["read", "local-write"],
	refusals: [serverRefusal, rasterizerUnavailableRefusal, rasterBoundsRefusal, rasterFailedRefusal],
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
	 * @returns The file receipt.
	 * @throws {CliUsageError} When the board has nothing on it.
	 * @throws {SemanticRasterError} When no browser can draw it or the bitmap is not what was asked for.
	 */
	async handler(input, context) {
		await context.require("server", "semantic rasterize");
		const drawn = await renderSemanticBoardOnCanvas(input.name, {
			...(input.variant === undefined ? {} : { variant: input.variant }),
			...(input.view === undefined ? {} : { view: input.view }),
			theme: input.theme,
			// The page loads nothing but the document, so the faces travel in it.
			fonts: "embedded",
		});
		if ("empty" in drawn) {
			throw new CliUsageError(
				`Semantic board "${drawn.board}" has nothing on it yet, so there is nothing to draw.`,
			);
		}
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
				context.signal,
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
		const file = context.resolvePath(input.out);
		return {
			result: {
				success: true as const,
				board: drawn.board,
				version: drawn.version,
				variant: drawn.variant,
				comparedWith: drawnAgainst(drawn),
				view: drawn.view,
				theme: input.theme,
				file,
				width: capture.width,
				height: capture.height,
				scale: input.scale,
				diagram: { width: drawn.width, height: drawn.height },
				region: input.region ?? null,
				source: {
					renderer: "semantic-renderer" as const,
					fonts: "embedded" as const,
					svgSha256: createHash("sha256").update(drawn.svg).digest("hex"),
					facesLoaded: capture.fonts,
					motion: "paused-at-start" as const,
				},
			},
			pendingArtifact: { path: file, content: capture.png, encoding: "binary" as const },
		};
	},
});

export { SemanticRasterError, semanticRasterizeContract };

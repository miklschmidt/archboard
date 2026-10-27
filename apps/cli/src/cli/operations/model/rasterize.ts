import { createHash } from "node:crypto";
import { z } from "zod";
import {
	ArchitectureRenderRequestSchema,
	ArchitectureRenderResultSchema,
} from "@archboard/board/model";
import {
	ArchitectureRasterReceiptSchema,
	createSemanticRasterizer,
	RASTER_MIN_SCALE,
	RASTER_MAX_SCALE,
} from "@archboard/renderer/rasterizer";
import { readRenderRecipe, embedRecipeInPng } from "@archboard/renderer/recipe";
import { renderArchitectureFlowOnServer } from "#cli/clients/server/architecture-model.ts";
import { PendingArtifactSchema } from "#cli/protocol/contract/schemas.ts";
import { modelRenderContract } from "#cli/operations/model/render.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { regionWithin } from "#cli/rules/semantic/draw/raster-region.ts";
type Picture = Extract<z.infer<typeof ArchitectureRenderResultSchema>, { success: true }>;
const RegionSchema = z
	.string()
	.regex(/^\d+,\d+,[1-9]\d*,[1-9]\d*$/u)
	.transform((text) => {
		const [x = 0, y = 0, width = 1, height = 1] = text.split(",").map(Number);
		return { x, y, width, height };
	});
/**
 * Capture a canonical SVG through the existing private rasterizer.
 * @param picture The complete server-rendered picture.
 * @param scale Bitmap pixels per diagram pixel.
 * @param region The optional diagram region.
 * @param signal The invocation cancellation signal.
 * @returns The PNG and its measured source evidence.
 */
async function captureArchitecture(
	picture: Picture,
	scale: number,
	region: z.output<typeof RegionSchema> | undefined,
	signal: AbortSignal,
) {
	const rasterizer = createSemanticRasterizer();
	try {
		const capture = await rasterizer.rasterize(
			{
				svg: picture.svg,
				width: picture.width,
				height: picture.height,
				scale,
				region: regionWithin(region, picture),
			},
			signal,
		);
		const read = readRenderRecipe(Buffer.from(picture.svg));
		if (read.kind !== "recipe" || !("model" in read.recipe))
			throw new Error("The canonical picture carries no reproducible recipe.");
		const recipe = { ...read.recipe, raster: { scale, region: region ?? null } };
		return {
			png: embedRecipeInPng(capture.png, recipe),
			width: capture.width,
			height: capture.height,
			source: {
				renderer: "semantic-renderer" as const,
				fonts: "embedded" as const,
				svgSha256: createHash("sha256").update(picture.svg).digest("hex"),
				facesLoaded: capture.fonts,
				motion: "paused-at-start" as const,
			},
		};
	} finally {
		const cleanup = await rasterizer.stop();
		if (!cleanup.clean)
			throw new Error(
				`The canonical rasterizer did not stop cleanly: ${cleanup.errors.join("; ")}`,
			);
	}
}
const modelRasterizeContract = defineCommand({
	...modelRenderContract,
	path: ["model", "rasterize"],
	summary: "Capture a canonical reading as a reproducible PNG",
	description:
		"Uses the same canonical projection and SVG renderer, then captures it through the existing local rasterizer.",
	examples: ["archboard model rasterize --module Gateway --out gateway.png"],
	parameters: [
		...modelRenderContract.parameters,
		{
			kind: "option",
			key: "scale",
			spellings: ["--scale"],
			value: "required",
			placeholder: "factor",
			description: "Bitmap pixels per diagram pixel",
		},
		{
			kind: "option",
			key: "region",
			spellings: ["--region"],
			value: "required",
			placeholder: "x,y,width,height",
			description: "An exact region inside the diagram page",
		},
	],
	input: {
		ingress: ArchitectureRenderRequestSchema.extend({
			out: z.string(),
			theme: z.enum(["light", "dark"]).default("dark"),
			scale: z.coerce.number().min(RASTER_MIN_SCALE).max(RASTER_MAX_SCALE).default(1),
			region: RegionSchema.optional(),
		}),
	},
	result: z.union([ArchitectureRasterReceiptSchema, ArchitectureRenderResultSchema.options[1]]),
	output: {
		cases: [
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				artifact: PendingArtifactSchema,
				description: "The canonical PNG receipt",
			},
		],
		select: () => "file",
	},
	/**
	 * Capture the selected canonical reading and install its artifact after success.
	 * @param input The reading and bitmap selectors.
	 * @param context The invocation capabilities.
	 * @returns The measured PNG receipt or structured reading refusal.
	 */
	async handler(input, context) {
		await context.require("server", "model rasterize");
		const { out, scale, region, ...request } = input;
		const picture = await renderArchitectureFlowOnServer(request);
		if (!picture.success)
			return {
				result: picture,
				outcome: "unavailable",
				diagnostics: picture.diagnostics.map(
					(item) => `${item.code}: ${item.message} ${item.recovery}`,
				),
			};
		const { svg: _svg, atlas: _atlas, ...receipt } = picture;
		const { png, ...capture } = await captureArchitecture(picture, scale, region, context.signal);
		const file = context.resolvePath(out);
		return {
			result: {
				...receipt,
				...capture,
				file,
				theme: input.theme,
				scale,
				region: region ?? null,
				diagram: { width: picture.width, height: picture.height },
			},
			pendingArtifact: { encoding: "binary" as const, path: file, content: png },
		};
	},
});
export { captureArchitecture, modelRasterizeContract };

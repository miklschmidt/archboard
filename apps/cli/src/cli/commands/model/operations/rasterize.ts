import { createHash } from "node:crypto";
import { z } from "zod";
import { modelShape, type ModelReply } from "@archboard/model-contract";
import { rasterizeAll, rasterScaleSchema } from "@archboard/raster";
import { readRenderRecipe, replaceRenderRecipe } from "@archboard/render-recipe";
import { renderArchitectureFlowOnServer } from "#cli/server-access/clients/architecture-model.ts";
import { pendingArtifactSchema } from "#cli/contract/protocol/schemas.ts";
import {
	modelRenderContract,
	requireGrammarForFlow,
} from "#cli/commands/model/operations/render.ts";
import { defineCommand } from "#cli/contract/protocol/contract.ts";
import { regionWithin } from "#cli/commands/model/rules/raster-region.ts";
type Picture = Extract<ModelReply<"render">, { success: true }>;
const RegionSchema = z
	.string()
	.regex(/^\d+,\d+,[1-9]\d*,[1-9]\d*$/u)
	.transform((text) => {
		const [x = 0, y = 0, width = 1, height = 1] = text.split(",").map(Number);
		return { x, y, width, height };
	});
/**
 * Capture a canonical SVG in its own private Chromium, carrying the picture's recipe.
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
	const job = {
		svg: picture.svg,
		width: picture.width,
		height: picture.height,
		scale,
		region: regionWithin(region, picture),
	};
	const [capture] = await Array.fromAsync(rasterizeAll([job], { signal }));
	if (capture === undefined) throw new Error("The rasterizer answered no capture.");
	const read = readRenderRecipe(Buffer.from(picture.svg));
	if (read.kind !== "recipe" || !("model" in read.recipe))
		throw new Error("The canonical picture carries no reproducible recipe.");
	const recipe = { ...read.recipe, raster: { scale, region: region ?? null } };
	return {
		png: replaceRenderRecipe(capture.png, recipe),
		width: capture.width,
		height: capture.height,
		source: {
			renderer: "semantic-renderer" as const,
			svgSha256: createHash("sha256").update(picture.svg).digest("hex"),
			motion: "paused-at-start" as const,
		},
	};
}
const modelRasterizeContract = defineCommand({
	...modelRenderContract,
	path: ["model", "rasterize"],
	summary: "Capture a canonical reading as a reproducible PNG",
	description:
		"Uses the same canonical projection and SVG renderer, then captures it through the existing local rasterizer.",
	examples: ["archboard model rasterize --module Gateway --out gateway.png"],
	parameters: [
		...modelRenderContract.parameters.filter(({ key }) => key !== "theme" && key !== "out"),
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			placeholder: "theme",
			choices: ["light", "dark"],
			default: "dark",
			description: "The ground the bitmap holds",
		},
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			placeholder: "file.png",
			required: true,
			description: "Write the PNG to this file",
		},
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
		ingress: modelShape("renderRequest").extend({
			out: z.string(),
			theme: z.enum(["light", "dark"]).default("dark"),
			scale: rasterScaleSchema().default(1),
			region: RegionSchema.optional(),
		}),
	},
	result: z.union([modelShape("rasterReceipt"), modelShape("refusal")]),
	output: {
		cases: [
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				artifact: pendingArtifactSchema(),
				description: "The canonical PNG receipt",
			},
		],
		/**
		 * Select the file output case.
		 * @returns The declared output identity.
		 */
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
		requireGrammarForFlow(request);
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

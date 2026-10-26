// Drawing an embed again from its recipe, and writing it (ADR 0057). The
// server's render route draws the SVG with the recipe's choices; a PNG is the
// bitmap of that SVG at the recipe's scale and region, which only a browser
// draws, so the browser starts for the first PNG that `--fix` writes and stops
// before the check answers.

import {
	embedRecipeInPng,
	recipeRenderRequest,
	replaceRenderRecipe,
} from "@archboard/renderer/recipe";
import { createSemanticRasterizer } from "@archboard/renderer/rasterizer";
import { renderSemanticBoardOnServer } from "#cli/clients/server/semantic-boards.ts";
import { writeFileAtomic } from "@archboard/workspace/atomic-write";
import type { DrawnBoard, NothingDrawn } from "@archboard/board/render-reply";
import { isRecord, stringAt } from "@archboard/diagnostics/unknown-record";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import { regionWithin } from "#cli/rules/semantic/draw/raster-region.ts";
import { recipeOfPicture, type RenderRecipe } from "#cli/rules/semantic/draw/picture-recipe.ts";
import type { MissingSource } from "#cli/protocol/check/embeds-answer.ts";
import type { CheckoutEmbed } from "#cli/operations/vault/embeds/checkout-embeds.ts";

/** A recipe drawn again, or what of what it names is gone. */
type Redrawn =
	| { readonly ok: true; readonly drawn: DrawnBoard; readonly recipe: RenderRecipe }
	| { readonly ok: false; readonly missing: MissingSource };

/** The server's refusal codes that say what a recipe names is gone. */
const MISSING_BY_CODE: ReadonlyMap<string, Exclude<MissingSource, "picture">> = new Map([
	["BOARD_MISSING", "board"],
	["UNKNOWN_VARIANT", "variant"],
	["UNKNOWN_VIEW", "view"],
]);

/** The browser that draws PNGs again, for one run of the check. */
interface Bitmaps {
	/**
	 * The bitmap of an SVG drawn again.
	 * @param drawn The SVG and its page.
	 * @param raster The scale and region it is drawn at.
	 * @returns The PNG.
	 */
	draw(drawn: DrawnBoard, raster: NonNullable<RenderRecipe["raster"]>): Promise<Uint8Array>;
	/** Stop the browser, if it started, and fail when it did not stop cleanly. */
	stop(): Promise<void>;
}

/**
 * A browser for PNGs, started when the first one is drawn.
 * @param signal Cancels a drawing.
 * @returns The bitmaps.
 */
function bitmapsFor(signal: AbortSignal): Bitmaps {
	let rasterizer: ReturnType<typeof createSemanticRasterizer> | null = null;
	return {
		/**
		 * The bitmap of an SVG drawn again, in the browser that the first one starts.
		 * @param drawn The SVG and its page.
		 * @param raster The scale and region it is drawn at.
		 * @returns The PNG.
		 * @throws {Error} When the region reaches outside the page drawn now.
		 */
		async draw(drawn, raster) {
			// Refused as `semantic rasterize --region` refuses it, before a browser starts.
			const region = regionWithin(raster.region ?? undefined, drawn);
			rasterizer ??= createSemanticRasterizer();
			const page = { svg: drawn.svg, width: drawn.width, height: drawn.height };
			return (await rasterizer.rasterize({ ...page, scale: raster.scale, region }, signal)).png;
		},
		/**
		 * Stop the browser, if it started.
		 * @throws {Error} When it did not stop cleanly.
		 */
		async stop() {
			const cleanup = await rasterizer?.stop();
			if (cleanup?.clean === false) {
				throw new Error(
					`The browser that drew PNGs again did not stop cleanly: ${cleanup.errors.join("; ")}`,
				);
			}
		},
	};
}

/**
 * A server refusal that says what a recipe names is gone, as an answer.
 * @param error What the request threw.
 * @returns What is gone.
 * @throws {unknown} The error itself, for any other refusal.
 */
function refusedAsMissing(error: unknown): { readonly missing: MissingSource } {
	const missing = MISSING_BY_CODE.get((isRecord(error) && stringAt(error, "code")) || "");
	if (missing === undefined) throw error;
	return { missing };
}

/**
 * Draw a recipe again through the server's render route.
 * @param recipe The recipe.
 * @param board The name the recipe's board goes by now.
 * @param vault The vault that holds it.
 * @returns The picture and its new recipe, or what is gone.
 * @throws {Error} When the server refuses for another reason, or draws no recipe.
 */
async function drawAgain(recipe: RenderRecipe, board: string, vault: string): Promise<Redrawn> {
	const reply: DrawnBoard | NothingDrawn | { readonly missing: MissingSource } =
		await renderSemanticBoardOnServer(board, recipeRenderRequest(recipe), vault).catch(
			refusedAsMissing,
		);
	if ("missing" in reply) return { ok: false, missing: reply.missing };
	if ("empty" in reply) return { ok: false, missing: "picture" };
	const read = recipeOfPicture(reply.svg);
	if ("problem" in read) throw new Error(read.problem);
	return { ok: true, drawn: reply, recipe: read.recipe };
}

/**
 * Write a PNG embed drawn again: the bitmap of the new SVG at the kept scale
 * and region, with the new recipe.
 * @param embed The embed.
 * @param redrawn What was drawn again.
 * @param bitmaps The browser that draws it.
 * @returns Nothing when it was written, or why it was not.
 */
async function writePng(
	embed: CheckoutEmbed,
	redrawn: Extract<Redrawn, { ok: true }>,
	bitmaps: Bitmaps,
): Promise<string | undefined> {
	const raster = embed.recipe.ok ? embed.recipe.recipe.raster : undefined;
	if (raster === undefined) return "The PNG's recipe holds no scale or region to draw it at.";
	try {
		const png = await bitmaps.draw(redrawn.drawn, raster);
		writeFileAtomic(embed.path, Buffer.from(embedRecipeInPng(png, { ...redrawn.recipe, raster })));
		return undefined;
	} catch (error) {
		return `The PNG could not be drawn again: ${errorMessage(error)}`;
	}
}

/**
 * Write an embed drawn again, whole: the SVG as the server drew it, or the PNG of it.
 * @param embed The embed.
 * @param redrawn What was drawn again.
 * @param bitmaps The browser that draws a PNG.
 * @returns Nothing when it was written, or why it was not.
 */
async function writeRedrawn(
	embed: CheckoutEmbed,
	redrawn: Extract<Redrawn, { ok: true }>,
	bitmaps: Bitmaps,
): Promise<string | undefined> {
	if (embed.kind === "png") return writePng(embed, redrawn, bitmaps);
	writeFileAtomic(embed.path, redrawn.drawn.svg);
	return undefined;
}

/**
 * Write only the new recipe of an embed whose picture is current, so whatever
 * a post-processor did to the file stays.
 * @param embed The embed.
 * @param kept The recipe it carries.
 * @param fresh The recipe of the same choices drawn now.
 */
function refreshRecipe(embed: CheckoutEmbed, kept: RenderRecipe, fresh: RenderRecipe): void {
	const recipe = kept.raster === undefined ? fresh : { ...fresh, raster: kept.raster };
	writeFileAtomic(embed.path, Buffer.from(replaceRenderRecipe(embed.bytes, recipe)));
}

export { bitmapsFor, drawAgain, refreshRecipe, writeRedrawn, type Bitmaps, type Redrawn };

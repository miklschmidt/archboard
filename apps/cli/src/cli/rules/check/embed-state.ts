// How an embed stands against what its board draws now (ADR 0057), and the
// lines `archboard check` writes about it. Pure: the embeds check reads the
// files and draws them again, and this decides what that means.
//
// The fingerprint is of what the picture is drawn from and the picture digest
// of what the renderer drew. A changed picture with a changed fingerprint is a
// board that says something new: a warning. A changed picture alone is a
// renderer that draws the same board differently, which two machines on two
// commits of the renderer disagree about: information. A changed fingerprint
// alone is an edit the picture does not show, such as one outside the view:
// the embed is current, and `--fix` only writes its new recipe.

import type { RenderRecipe } from "@archboard/renderer/recipe";
import { EVERYTHING_VIEW } from "@archboard/board/views";
import type { EmbedFix, EmbedsPart, EmbedVault } from "#cli/protocol/check/embeds-answer.ts";

/**
 * How a kept embed stands against the same recipe drawn now.
 * - `current`: the picture and the recipe are as drawn now.
 * - `recipe-stale`: the picture is as drawn now and the recipe is not, so
 *   `--fix` writes only the new recipe.
 * - `outdated`: the board changed what the picture shows.
 * - `renderer-changed`: the renderer draws the same board differently.
 */
type EmbedStanding = "current" | "recipe-stale" | "outdated" | "renderer-changed";

/**
 * How a kept embed stands against its recipe drawn again.
 * @param kept The recipe the file carries.
 * @param fresh The recipe of the same choices drawn now; a bitmap's scale and
 * region are the kept one's, because the route draws the SVG they apply to.
 * @returns Its standing.
 */
function embedStanding(kept: RenderRecipe, fresh: RenderRecipe): EmbedStanding {
	if (kept.picture !== fresh.picture) {
		return kept.fingerprint === fresh.fingerprint ? "renderer-changed" : "outdated";
	}
	const redrawn = kept.raster === undefined ? fresh : { ...fresh, raster: kept.raster };
	return Bun.deepEquals(kept, redrawn) ? "current" : "recipe-stale";
}

/**
 * Whether `--fix` may point a recipe at another board that holds its deleted
 * board's name: only a recipe that asks for the current variant and the
 * overview or Everything, read on its own or against nothing, because the ids
 * of an old variant, view or compared variant do not exist on another board.
 * @param recipe The recipe.
 * @returns True when the other board can draw what it asks for.
 */
function isRepointable(recipe: RenderRecipe): boolean {
	return (
		recipe.variant === "current" &&
		(recipe.view === "overview" || recipe.view.id === EVERYTHING_VIEW.id) &&
		typeof recipe.comparison === "string"
	);
}

/**
 * The line of one file `--fix` rewrote.
 * @param fix What it did.
 * @returns The line.
 */
function fixLine(fix: EmbedFix): string {
	const file = located(fix);
	if (fix.action === "re-pointed") {
		return `fixed: re-pointed: ${file}: ${fix.from.name} (${fix.from.id}) -> ${fix.to.name} (${fix.to.id})`;
	}
	const moved =
		fix.movedFrom === undefined ? "" : `: its recipe named ${fix.movedFrom ?? "no repository"}`;
	return `fixed: ${fix.action === "drawn" ? "drawn again" : "recipe written"}: ${file}${moved}`;
}

/**
 * A file as a line names it: its path, and its repository when it is another's.
 * @param at The file, and its repository when it is another's.
 * @param at.file The file.
 * @param at.embedRepo Its repository, for a tracked embed of another repository.
 * @returns The words.
 */
function located(at: { readonly file: string; readonly embedRepo?: string | undefined }): string {
	return at.embedRepo === undefined ? at.file : `${at.embedRepo}:${at.file}`;
}

/**
 * The line of a vault the check fetched or read from the cache. A checkout's
 * vault, read as it is, has none.
 * @param vault Where the check read it.
 * @returns The line, or none.
 */
function vaultLines(vault: EmbedVault): string[] {
	if (vault.source === "checkout") return [];
	if (vault.source === "fetched") {
		return [`vault: fetched: ${vault.repo} at ${vault.commit.slice(0, 9)}`];
	}
	return [`${vault.severity}: ${vault.code}: ${vault.repo}: ${vault.message}`];
}

/**
 * The lines of the embeds check: each vault it fetched or read from the
 * cache, each finding with its code and file, the reason `--fix` left it when
 * it did, then each file `--fix` rewrote.
 * @param part The embeds check's part, when it ran.
 * @returns The lines.
 */
function embedsCheckLines(part: EmbedsPart | undefined): string[] {
	if (part === undefined) return [];
	return [
		...part.vaults.flatMap(vaultLines),
		...part.findings.flatMap((finding) => [
			`${finding.severity}: ${finding.code}: ${located(finding)}: ${finding.message}`,
			...(finding.notFixed === undefined ? [] : [`  not fixed: ${finding.notFixed}`]),
		]),
		...part.fixed.map(fixLine),
	];
}

export { embedsCheckLines, embedStanding, fixLine, isRepointable, type EmbedStanding };

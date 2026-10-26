// The embeds check (ADR 0057): every embed of the checkout that holds the
// vault, drawn again from its own recipe and compared with what it keeps.
//
// A recipe names its vault by repository identity and its board by id, so the
// board is the one that holds the id now, whatever it is called. The picture
// is drawn again by the server's render route with the recipe's choices; a PNG
// compares by its SVG's digest, so only `--fix` needs a browser. `--fix`
// writes only the embeds of this checkout, each whole, and the answer names
// every file it rewrote and every recipe it pointed at another board.

import fs from "node:fs";
import type { RenderRecipe } from "@archboard/renderer/recipe";
import { repoRootOf } from "@archboard/workspace/checkouts";
import { checkoutOfVault } from "@archboard/workspace/vault";
import { checkoutsReadFrom } from "@archboard/code-binding/resolution";
import { isRecord, stringAt } from "@archboard/diagnostics/unknown-record";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import type { EmbedFinding, EmbedFix, EmbedsPart } from "#cli/protocol/check/embeds-answer.ts";
import { embedStanding, fixLine, isRepointable } from "#cli/rules/check/embed-state.ts";
import {
	bitmapsFor,
	drawAgain,
	refreshRecipe,
	writeRedrawn,
	type Bitmaps,
	type Redrawn,
} from "#cli/operations/vault/embeds/embed-drawing.ts";
import {
	changedFinding,
	goneBoardFinding,
	missingFinding,
	unavailableFinding,
	unreadableFinding,
} from "#cli/operations/vault/embeds/embed-findings.ts";
import {
	boardNamed,
	vaultReader,
	type ListedBoard,
	type VaultReading,
} from "#cli/operations/vault/embeds/embed-vaults.ts";
import {
	checkoutEmbeds,
	type CheckoutEmbed,
} from "#cli/operations/vault/embeds/checkout-embeds.ts";
import { removingCommit } from "#cli/operations/vault/embeds/vault-history.ts";

/** What checking one embed found: a finding, a file `--fix` rewrote, or neither. */
interface Checked {
	readonly finding?: EmbedFinding;
	readonly fix?: EmbedFix;
}

/** What one run of the check shares between its embeds. */
interface Run {
	readonly fix: boolean;
	readonly signal: AbortSignal;
	readonly vault: (repo: string | null) => Promise<VaultReading>;
	readonly bitmaps: Bitmaps;
}

/**
 * With `--fix`, point a recipe at the board that holds its deleted board's
 * name now, and draw the embed again from it.
 * @param embed The embed.
 * @param recipe Its recipe.
 * @param holder The board that holds the name.
 * @param vault The vault that holds both boards.
 * @param bitmaps The browser that draws a PNG.
 * @returns Nothing when it was written, or why it was not.
 */
async function repoint(
	embed: CheckoutEmbed,
	recipe: RenderRecipe,
	holder: ListedBoard,
	vault: string,
	bitmaps: Bitmaps,
): Promise<string | undefined> {
	const pointed = { ...recipe, board: { id: holder.id, name: holder.name } };
	const redrawn = await drawAgain(pointed, holder.name, vault);
	return redrawn.ok
		? writeRedrawn(embed, redrawn, bitmaps)
		: `"${holder.name}" draws nothing for this recipe.`;
}

/**
 * Check an embed whose board is gone from its vault: name the commit that
 * removed it and the board that holds its name now, and with `--fix` point a
 * recipe that can follow the name at that board.
 * @param embed The embed.
 * @param recipe Its recipe.
 * @param reading The vault.
 * @param run The run.
 * @returns What was found and done.
 */
async function checkGoneBoard(
	embed: CheckoutEmbed,
	recipe: RenderRecipe,
	reading: Extract<VaultReading, { ok: true }>,
	run: Run,
): Promise<Checked> {
	const holder = boardNamed(reading, recipe.board.name);
	const repointable = holder !== undefined && isRepointable(recipe);
	let notFixed: string | undefined;
	if (run.fix && repointable) {
		notFixed = await repoint(embed, recipe, holder, reading.vault, run.bitmaps);
		if (notFixed === undefined) {
			return { fix: { action: "re-pointed", file: embed.file, from: recipe.board, to: holder } };
		}
	}
	const removedIn = await removingCommit(reading.vault, recipe.board, run.signal);
	return {
		finding: goneBoardFinding(embed, recipe.board, {
			holder,
			removedIn,
			repointable,
			notFixed,
			unreadable: reading.unreadable,
		}),
	};
}

/**
 * With `--fix`, draw again an embed whose picture changed; else report it.
 * @param embed The embed.
 * @param standing Whether the board or the renderer changed it.
 * @param redrawn What was drawn again.
 * @param board The board, with the name it goes by now.
 * @param run The run.
 * @returns What was found and done.
 */
async function redraw(
	embed: CheckoutEmbed,
	standing: "outdated" | "renderer-changed",
	redrawn: Extract<Redrawn, { ok: true }>,
	board: ListedBoard,
	run: Run,
): Promise<Checked> {
	const notFixed = run.fix ? await writeRedrawn(embed, redrawn, run.bitmaps) : undefined;
	if (!run.fix || notFixed !== undefined) {
		return { finding: changedFinding(embed, standing, board, notFixed) };
	}
	const code = standing === "outdated" ? "EMBED_OUTDATED" : "EMBED_RENDERER_CHANGED";
	return { fix: { action: "drawn", file: embed.file, code } };
}

/**
 * Check an embed whose board is in its vault: draw it again and compare.
 * @param embed The embed.
 * @param recipe Its recipe.
 * @param board The board, with the name it goes by now.
 * @param vault The vault.
 * @param run The run.
 * @returns What was found and done.
 */
async function checkDrawn(
	embed: CheckoutEmbed,
	recipe: RenderRecipe,
	board: ListedBoard,
	vault: string,
	run: Run,
): Promise<Checked> {
	const redrawn = await drawAgain(recipe, board.name, vault);
	if (!redrawn.ok) return { finding: missingFinding(embed, redrawn.missing, board) };
	const standing = embedStanding(recipe, redrawn.recipe);
	if (standing === "current" || (standing === "recipe-stale" && !run.fix)) return {};
	if (standing !== "recipe-stale") return redraw(embed, standing, redrawn, board, run);
	refreshRecipe(embed, recipe, redrawn.recipe);
	return { fix: { action: "recipe", file: embed.file } };
}

/**
 * Check one embed.
 * @param embed The embed.
 * @param run The run.
 * @returns What was found and done.
 */
async function checkEmbed(embed: CheckoutEmbed, run: Run): Promise<Checked> {
	if (!embed.recipe.ok) return { finding: unreadableFinding(embed, embed.recipe.problem) };
	const { recipe } = embed.recipe;
	const reading = await run.vault(recipe.vault.repo);
	if (!reading.ok) return { finding: unavailableFinding(embed, recipe.vault.repo, reading.reason) };
	const board = reading.byId.get(recipe.board.id);
	return board === undefined
		? checkGoneBoard(embed, recipe, reading, run)
		: checkDrawn(embed, recipe, board, reading.vault, run);
}

/**
 * What stopped a run of the check, naming each file `--fix` rewrote before it,
 * so no rewrite and no re-pointing goes unsaid (ADR 0057).
 * @param error What stopped it.
 * @param fixed What `--fix` rewrote before it.
 * @returns The error itself when nothing was rewritten, else an error with its
 * message and its code that lists each rewrite.
 */
function stoppedAfter(error: unknown, fixed: readonly EmbedFix[]): unknown {
	if (fixed.length === 0) return error;
	const code = isRecord(error) ? stringAt(error, "code") : undefined;
	const message = [errorMessage(error), "Before it stopped:", ...fixed.map(fixLine)].join("\n");
	return Object.assign(new Error(message, { cause: error }), code === undefined ? {} : { code });
}

/**
 * Check every embed, one render at a time in the order Git lists them.
 * @param embeds The embeds.
 * @param run The run.
 * @returns What each one found and did.
 * @throws {Error} What stopped the run, naming each file `--fix` rewrote before it.
 */
async function checkInOrder(embeds: readonly CheckoutEmbed[], run: Run): Promise<Checked[]> {
	const checked: Checked[] = [];
	try {
		for (const embed of embeds) {
			// oxlint-disable-next-line no-await-in-loop -- one render at a time, in the order Git lists the files
			checked.push(await checkEmbed(embed, run));
		}
	} catch (error) {
		throw stoppedAfter(
			error,
			checked.flatMap((one) => one.fix ?? []),
		);
	}
	return checked;
}

/**
 * The root of the Git checkout that holds a vault as its `.archboard/vault`.
 * @param vault The vault.
 * @param signal Cancels the question.
 * @returns The root, or undefined when the vault is in no checkout.
 */
async function checkoutRoot(vault: string, signal: AbortSignal): Promise<string | undefined> {
	const holder = fs.realpathSync.native(checkoutOfVault(vault));
	const root = await repoRootOf(holder, { signal });
	return root !== undefined && fs.realpathSync.native(root) === holder ? holder : undefined;
}

/**
 * Run the embeds check over the checkout that holds a vault.
 * @param vault The vault the command found.
 * @param options What the run does.
 * @param options.fix Whether to draw outdated embeds again and write their files.
 * @param options.signal Cancels it.
 * @returns The embeds check's part of the answer.
 * @throws {Error} When the browser that drew PNGs again did not stop cleanly,
 * naming each file `--fix` rewrote.
 */
async function checkEmbeds(
	vault: string,
	options: { readonly fix: boolean; readonly signal: AbortSignal },
): Promise<EmbedsPart> {
	const root = await checkoutRoot(vault, options.signal);
	if (root === undefined) return { checkout: null, embeds: [], findings: [], fixed: [] };
	const embeds = await checkoutEmbeds(root, options.signal);
	const run: Run = {
		...options,
		vault: vaultReader(checkoutsReadFrom(vault)),
		bitmaps: bitmapsFor(options.signal),
	};
	const checked = await checkInOrder(embeds, run).catch(async (error: unknown) => {
		await run.bitmaps.stop().catch(() => undefined);
		throw error;
	});
	const fixed = checked.flatMap((one) => one.fix ?? []);
	await run.bitmaps.stop().catch((error: unknown) => {
		throw stoppedAfter(error, fixed);
	});
	return {
		checkout: root,
		embeds: embeds.map((embed) => embed.file),
		findings: checked.flatMap((one) => (one.finding === undefined ? [] : [one.finding])),
		fixed,
	};
}

export { checkEmbeds };

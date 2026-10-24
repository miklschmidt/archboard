// The embeds check (ADR 0057): every embed of the checkout that holds the
// vault, and every tracked embed of the vault's boards, drawn again from its
// own recipe and compared with what it keeps. In a checkout that holds no
// vault, such as a documentation repository that embeds the boards of
// another repository's vault, it reads the embeds of that checkout alone.
//
// A recipe names its vault by repository identity and its board by id, so the
// board is the one that holds the id now, whatever it is called. A tracked
// embed whose board this vault holds is read against this vault, whichever
// repository its recipe names: after a move (ADR 0051) the recipe still names
// the old one, and the check says so. The picture is drawn again by the
// server's render route with the recipe's choices; a PNG compares by its SVG's
// digest, so only `--fix` needs a browser. `--fix` writes the embeds of this
// checkout and the tracked embeds in a registered checkout of another
// repository, each whole, and the answer names every file it rewrote and every
// recipe it pointed at another board.

import fs from "node:fs";
import type { RenderRecipe } from "@archboard/renderer/recipe";
import { repoRootOf } from "@archboard/workspace/checkouts";
import { checkoutOfVault } from "@archboard/workspace/vault";
import { checkoutsReadFrom, vaultIdentity } from "@archboard/code-binding/resolution";
import { isRecord, stringAt } from "@archboard/diagnostics/unknown-record";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import type { EmbedFinding, EmbedFix, EmbedsPart } from "#cli/protocol/check/embeds-answer.ts";
import type { CommandContext } from "#cli/protocol/contract/contract.ts";
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
	cachedFinding,
	changedFinding,
	goneBoardFinding,
	missingFinding,
	movedFinding,
	unavailableFinding,
	unreadableFinding,
	type TrackedEntry,
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
import {
	fileKey,
	foreignEmbeds,
	trackedEmbedsOf,
	trackedFiles,
	trackedFinding,
	trackingBoards,
} from "#cli/operations/vault/embeds/tracked-embeds.ts";
import { removingCommit } from "#cli/operations/vault/embeds/vault-history.ts";

/** What checking one embed found: its findings, a file `--fix` rewrote, or neither. */
interface Checked {
	readonly findings?: readonly EmbedFinding[];
	readonly fix?: EmbedFix;
}

/** What one run of the check shares between its embeds. */
interface Run {
	readonly fix: boolean;
	readonly signal: AbortSignal;
	readonly vault: (repo: string | null) => Promise<VaultReading>;
	readonly bitmaps: Bitmaps;
	/** The repository identity of the checkout that holds the vault. */
	readonly ownRepo: string | undefined;
	/** The ids of the vault's boards that track each file, by `fileKey`. */
	readonly tracking: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Where a file `--fix` rewrote is, as the answer names it.
 * @param embed The embed.
 * @returns Its file, and its repository when it is another's.
 */
function fixedFile(embed: CheckoutEmbed): Pick<EmbedFix, "file" | "embedRepo"> {
	return { file: embed.file, ...(embed.repo === undefined ? {} : { embedRepo: embed.repo }) };
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
			return {
				fix: { action: "re-pointed", ...fixedFile(embed), from: recipe.board, to: holder },
			};
		}
	}
	const removedIn = await removingCommit(reading.vault, recipe.board, run.signal);
	return {
		findings: [
			goneBoardFinding(embed, recipe.board, {
				holder,
				removedIn,
				repointable,
				notFixed,
				unreadable: reading.unreadable,
			}),
		],
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
		return { findings: [changedFinding(embed, standing, board, notFixed)] };
	}
	const code = standing === "outdated" ? "EMBED_OUTDATED" : "EMBED_RENDERER_CHANGED";
	return { fix: { action: "drawn", ...fixedFile(embed), code } };
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
	if (!redrawn.ok) return { findings: [missingFinding(embed, redrawn.missing, board)] };
	const standing = embedStanding(recipe, redrawn.recipe);
	if (standing === "current" || (standing === "recipe-stale" && !run.fix)) return {};
	if (standing !== "recipe-stale") return redraw(embed, standing, redrawn, board, run);
	refreshRecipe(embed, recipe, redrawn.recipe);
	return { fix: { action: "recipe", ...fixedFile(embed) } };
}

/**
 * The repository of this vault, when a board of this vault tracks an embed and
 * holds the board its recipe names: then the vault is this one, whichever
 * repository the recipe names.
 * @param embed The embed.
 * @param recipe Its recipe.
 * @param run The run.
 * @returns The repository identity of this vault's checkout, or undefined.
 */
function heldIn(embed: CheckoutEmbed, recipe: RenderRecipe, run: Run): string | undefined {
	const repo = embed.repo ?? run.ownRepo;
	const boards = repo === undefined ? undefined : run.tracking.get(fileKey(repo, embed.file));
	return boards?.has(recipe.board.id) === true ? run.ownRepo : undefined;
}

/**
 * What checking an embed whose recipe names the vault its board moved from
 * found: the finding that says so, or the rewrite that `--fix` made, which
 * writes the recipe of this vault whether it drew the picture again or not.
 * @param embed The embed.
 * @param from The repository the recipe names.
 * @param checked What checking it against this vault found.
 * @returns The same, with the move said.
 */
function moved(embed: CheckoutEmbed, from: string | null, checked: Checked): Checked {
	const { fix } = checked;
	if (fix !== undefined && fix.action !== "re-pointed") {
		return { ...checked, fix: { ...fix, movedFrom: from } };
	}
	return { ...checked, findings: [...(checked.findings ?? []), movedFinding(embed, from)] };
}

/**
 * Check an embed against the vault that holds its board, or held it.
 * @param embed The embed.
 * @param recipe Its recipe.
 * @param reading The vault.
 * @param run The run.
 * @returns What was found and done.
 */
function checkAgainst(
	embed: CheckoutEmbed,
	recipe: RenderRecipe,
	reading: Extract<VaultReading, { ok: true }>,
	run: Run,
): Promise<Checked> {
	const board = reading.byId.get(recipe.board.id);
	return board === undefined
		? checkGoneBoard(embed, recipe, reading, run)
		: checkDrawn(embed, recipe, board, reading.vault, run);
}

/**
 * Check an embed against its vault. A vault read from the cache can be behind
 * its default branch, so what it finds is information and `--fix` writes
 * nothing from it: an embed drawn from a newer commit is never drawn back to
 * an older picture (ADR 0057).
 * @param embed The embed.
 * @param recipe Its recipe.
 * @param reading The vault.
 * @param run The run.
 * @returns What was found and done.
 */
async function checkInVault(
	embed: CheckoutEmbed,
	recipe: RenderRecipe,
	reading: Extract<VaultReading, { ok: true }>,
	run: Run,
): Promise<Checked> {
	if (reading.read.source !== "cache") return checkAgainst(embed, recipe, reading, run);
	const { findings = [] } = await checkAgainst(embed, recipe, reading, { ...run, fix: false });
	return { findings: findings.map((finding) => cachedFinding(finding, run.fix)) };
}

/**
 * Check one embed.
 * @param embed The embed.
 * @param run The run.
 * @returns What was found and done.
 */
async function checkEmbed(embed: CheckoutEmbed, run: Run): Promise<Checked> {
	if (!embed.recipe.ok) return { findings: [unreadableFinding(embed, embed.recipe.problem)] };
	const { recipe } = embed.recipe;
	const here = heldIn(embed, recipe, run);
	const reading = await run.vault(here ?? recipe.vault.repo);
	if (!reading.ok) {
		return {
			findings: [unavailableFinding(embed, recipe.vault.repo, reading.reason, reading.code)],
		};
	}
	const checked = await checkInVault(embed, recipe, reading, run);
	return here !== undefined && recipe.vault.repo !== here
		? moved(embed, recipe.vault.repo, checked)
		: checked;
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
 * Check every embed of the checkout, in the order Git lists them, then every
 * tracked embed of another repository, in the order the boards list them, one
 * render at a time.
 * @param embeds The embeds, in that order.
 * @param run The run.
 * @returns What each one found and did.
 * @throws {Error} What stopped the run, naming each file `--fix` rewrote before it.
 */
async function checkInOrder(embeds: readonly CheckoutEmbed[], run: Run): Promise<Checked[]> {
	const checked: Checked[] = [];
	try {
		for (const embed of embeds) {
			// oxlint-disable-next-line no-await-in-loop -- one render at a time, in the order of the embeds
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

/** Where the check runs: the vault a command found, or a Git checkout that holds no vault. */
type EmbedsAt = { readonly vault: string } | { readonly checkout: string };

/** The embeds part of a vault in no Git checkout: no file of it can be an embed. */
const NO_CHECKOUT: EmbedsPart = {
	checkout: null,
	embeds: [],
	tracked: [],
	vaults: [],
	findings: [],
	fixed: [],
};

/**
 * The tracked embeds of the vault's boards, and the files of each repository
 * they name.
 * @param vault The vault, or null in a checkout without one, whose boards track nothing.
 * @param own The checkout the check runs in.
 * @param checkouts The checkouts identities resolve in.
 * @param signal Cancels the listings.
 * @returns The tracked embeds and their files.
 */
async function trackedOf(
	vault: string | null,
	own: Parameters<typeof trackedFiles>[1],
	checkouts: ReturnType<typeof checkoutsReadFrom>,
	signal: AbortSignal,
): Promise<{ tracked: TrackedEntry[]; files: Awaited<ReturnType<typeof trackedFiles>> }> {
	const tracked = vault === null ? [] : await trackedEmbedsOf(vault);
	return { tracked, files: await trackedFiles(tracked, own, checkouts, signal) };
}

/**
 * Run the embeds check over the checkout that holds a vault and the tracked
 * embeds of its boards, or over a checkout that holds no vault.
 * @param at The vault the command found, or the checkout without one.
 * @param options What the run does.
 * @param options.fix Whether to draw outdated embeds again and write their files.
 * @param options.signal Cancels it.
 * @returns The embeds check's part of the answer.
 * @throws {Error} When the browser that drew PNGs again did not stop cleanly,
 * naming each file `--fix` rewrote.
 */
async function checkEmbedsAt(
	at: EmbedsAt,
	options: { readonly fix: boolean; readonly signal: AbortSignal },
): Promise<EmbedsPart> {
	const vault = "vault" in at ? at.vault : null;
	const root = "checkout" in at ? at.checkout : await checkoutRoot(at.vault, options.signal);
	if (root === undefined) return NO_CHECKOUT;
	const embeds = await checkoutEmbeds(root, options.signal);
	const checkouts = checkoutsReadFrom(vault);
	const vaults = vaultReader(checkouts, options.signal);
	const ownRepo = vault === null ? undefined : vaultIdentity(vault);
	const { tracked, files } = await trackedOf(
		vault,
		{ repo: ownRepo, root, embeds },
		checkouts,
		options.signal,
	);
	const run: Run = {
		...options,
		vault: vaults.read,
		bitmaps: bitmapsFor(options.signal),
		ownRepo,
		tracking: trackingBoards(tracked),
	};
	const trackedFindings = tracked.flatMap(
		(entry) => trackedFinding(entry, files.get(entry.repo), entry.repo === run.ownRepo) ?? [],
	);
	const foreign = foreignEmbeds(tracked, files, run.ownRepo, run.tracking);
	const checked = await checkInOrder([...embeds, ...foreign], run).catch(async (error: unknown) => {
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
		tracked: tracked.map(({ board, repo, path }) => ({ board, repo, path })),
		vaults: await vaults.vaults(),
		findings: [...checked.flatMap((one) => one.findings ?? []), ...trackedFindings],
		fixed,
	};
}

/**
 * The embeds check of what a command addressed: the vault it found, or the
 * Git checkout without a vault that it runs in.
 * @param context What the command addressed, and its signal.
 * @param fix Whether to draw the outdated embeds again.
 * @returns The embeds part.
 * @throws {Error} When the command addressed neither, which a check command never does.
 */
function checkEmbeds(
	context: Pick<CommandContext, "vault" | "checkout" | "signal">,
	fix: boolean,
): Promise<EmbedsPart> {
	const options = { fix, signal: context.signal };
	if (context.vault !== null) return checkEmbedsAt({ vault: context.vault.path }, options);
	if (context.checkout !== null) return checkEmbedsAt({ checkout: context.checkout }, options);
	throw new Error("The embeds check reads the vault or the checkout a command finds.");
}

export { checkEmbeds, checkEmbedsAt };

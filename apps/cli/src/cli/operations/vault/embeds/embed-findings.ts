// What the embeds check says about one embed (ADR 0057): each finding with
// its code, its severity, the board as the recipe names it, and what a person
// or an agent does next.

import type { EmbedFinding, MissingSource } from "#cli/protocol/check/embeds-answer.ts";
import type { ListedBoard } from "#cli/operations/vault/embeds/embed-vaults.ts";
import type { RemovingCommit } from "#cli/operations/vault/embeds/vault-history.ts";
import type { TrackedEmbed } from "#cli/operations/vault/embeds/tracked-embeds.ts";

/**
 * A finding about one embed, with the board its recipe names when it can be read.
 * @param embed The embed.
 * @param finding What it says.
 * @returns The finding.
 */
function findingOn(
	embed: TrackedEmbed,
	finding: Omit<EmbedFinding, "file" | "board">,
): EmbedFinding {
	return {
		file: embed.file,
		...(embed.recipe.ok ? { board: embed.recipe.recipe.board } : {}),
		...finding,
	};
}

/**
 * An embed whose recipe cannot be read.
 * @param embed The embed.
 * @param problem What is wrong with the recipe.
 * @returns The warning.
 */
function unreadableFinding(embed: TrackedEmbed, problem: string): EmbedFinding {
	return findingOn(embed, {
		severity: "warning",
		code: "EMBED_RECIPE_UNREADABLE",
		message: `Its render recipe cannot be read (${problem}), so nothing can draw it again. Draw it again with \`archboard semantic render --out\`.`,
	});
}

/**
 * An embed whose vault no checkout on this machine holds.
 * @param embed The embed.
 * @param repo The repository identity its recipe names.
 * @param reason Why the vault cannot be read.
 * @returns The information.
 */
function unavailableFinding(
	embed: TrackedEmbed,
	repo: string | null,
	reason: string,
): EmbedFinding {
	return findingOn(embed, {
		severity: "information",
		code: "EMBED_VAULT_UNAVAILABLE",
		repo,
		message: reason,
	});
}

/**
 * An embed whose board is in its vault and whose variant or view is gone, or
 * which draws nothing now.
 * @param embed The embed.
 * @param missing What is gone.
 * @param board The board, with the name it goes by now.
 * @returns The warning.
 */
function missingFinding(
	embed: TrackedEmbed,
	missing: MissingSource,
	board: ListedBoard,
): EmbedFinding {
	const what = {
		board: `The board "${board.name}" is gone from its vault.`,
		variant: `The variant that the recipe names is gone from "${board.name}".`,
		view: `The view that the recipe names is gone from "${board.name}".`,
		picture: `What the recipe names on "${board.name}" draws nothing now.`,
	}[missing];
	return findingOn(embed, {
		severity: "warning",
		code: "EMBED_SOURCE_MISSING",
		missing,
		message: `${what} Draw the embed again with \`archboard semantic render\`, or remove it.`,
	});
}

/** What the check learned about a board that is gone from its vault. */
interface GoneBoard {
	/** The board that goes by its name now. */
	readonly holder: ListedBoard | undefined;
	/** The commit of the vault's history that removed it. */
	readonly removedIn: RemovingCommit | undefined;
	/** Whether `--fix` can point the recipe at the holder. */
	readonly repointable: boolean;
	/** Why `--fix` did not, when it tried. */
	readonly notFixed: string | undefined;
}

/**
 * The words about the board that holds a gone board's name now.
 * @param gone What the check learned.
 * @returns The sentence, or nothing when no board holds the name.
 */
function holderSentence(gone: GoneBoard): string {
	if (gone.holder === undefined) return "";
	const next = gone.repointable
		? ", and `--fix` points the embed at it"
		: ", but the recipe names a variant, a view or a comparison of the old board, so draw the embed again from the new one with `archboard semantic render`";
	return ` "${gone.holder.name}" (${gone.holder.id}) holds its name now${next}.`;
}

/**
 * An embed whose board is gone from its vault.
 * @param embed The embed.
 * @param board The board as the recipe names it.
 * @param gone What the check learned about it.
 * @returns The warning.
 */
function goneBoardFinding(embed: TrackedEmbed, board: ListedBoard, gone: GoneBoard): EmbedFinding {
	const { holder, removedIn, notFixed } = gone;
	const removed =
		removedIn === undefined
			? ""
			: ` Commit ${removedIn.commit.slice(0, 9)} ("${removedIn.subject}") removed it.`;
	return findingOn(embed, {
		severity: "warning",
		code: "EMBED_SOURCE_MISSING",
		missing: "board",
		message: `The board "${board.name}" (${board.id}) is gone from its vault.${removed}${holderSentence(gone)}`,
		...(removedIn === undefined ? {} : { removedIn }),
		...(holder === undefined ? {} : { nameHeldBy: holder }),
		...(notFixed === undefined ? {} : { notFixed }),
	});
}

/**
 * An embed whose picture the board or the renderer changed.
 * @param embed The embed.
 * @param standing Which of the two changed it.
 * @param board The board, with the name it goes by now.
 * @param notFixed Why `--fix` did not draw it again, when it tried.
 * @returns A warning for a board that says something new, information for a renderer.
 */
function changedFinding(
	embed: TrackedEmbed,
	standing: "outdated" | "renderer-changed",
	board: ListedBoard,
	notFixed: string | undefined,
): EmbedFinding {
	const outdated = standing === "outdated";
	return findingOn(embed, {
		severity: outdated ? "warning" : "information",
		code: outdated ? "EMBED_OUTDATED" : "EMBED_RENDERER_CHANGED",
		message: `${
			outdated
				? `"${board.name}" changed what this picture shows.`
				: `The renderer draws "${board.name}" differently now.`
		} \`archboard check embeds --fix\` draws it again.`,
		...(notFixed === undefined ? {} : { notFixed }),
	});
}

export { changedFinding, goneBoardFinding, missingFinding, unavailableFinding, unreadableFinding };

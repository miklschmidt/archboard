// The tracked embeds of a vault's boards (ADR 0057): each file a board lists
// as `{ repo, path }`. The check reads a file of this vault's own repository
// among the embeds of its checkout, and a file of another repository in the
// chosen registered checkout of that repository, from its working tree, with
// the same rules: an SVG document or a PNG that carries a recipe, reached
// through no symbolic link, so `--fix` writes only inside that checkout.

import fs from "node:fs";
import { BoardListingSchema } from "@archboard/board/board-listing";
import { requestJson } from "@archboard/server-lifecycle/server-client";
import type { checkoutsReadFrom } from "@archboard/code-binding/resolution";
import { embedAt, type CheckoutEmbed } from "#cli/operations/vault/embeds/checkout-embeds.ts";
import type { TrackedEntry } from "#cli/operations/vault/embeds/embed-findings.ts";

/** A tracked embed of another repository, as the check finds it on this machine. */
type ForeignEmbed =
	| { readonly kind: "embed"; readonly entry: TrackedEntry; readonly embed: CheckoutEmbed }
	| { readonly kind: "unreachable"; readonly entry: TrackedEntry }
	| { readonly kind: "missing"; readonly entry: TrackedEntry; readonly root: string };

/**
 * Every tracked embed of a vault's boards, as the server lists them.
 * @param vault The vault.
 * @returns Each one with its board, in the order the boards list them.
 */
async function trackedEmbedsOf(vault: string): Promise<TrackedEntry[]> {
	const listing = BoardListingSchema.parse(
		await requestJson<unknown>(`/api/semantic-boards?${new URLSearchParams({ vault })}`),
	);
	return listing.boards.flatMap(({ id, name, trackedEmbeds }) =>
		id === undefined
			? []
			: (trackedEmbeds ?? []).map((embed) => ({ board: { id, name }, ...embed })),
	);
}

/**
 * The key of one file of one repository.
 * @param repo The repository identity.
 * @param file The file in it.
 * @returns The key.
 */
function fileKey(repo: string, file: string): string {
	return `${repo}\0${file}`;
}

/**
 * Which boards of the vault track each file, by `fileKey`.
 * @param tracked The vault's tracked embeds.
 * @returns The ids of the boards that list each file.
 */
function trackingBoards(
	tracked: readonly TrackedEntry[],
): ReadonlyMap<string, ReadonlySet<string>> {
	const boards = new Map<string, Set<string>>();
	for (const entry of tracked) {
		const key = fileKey(entry.repo, entry.path);
		boards.set(key, (boards.get(key) ?? new Set()).add(entry.board.id));
	}
	return boards;
}

/**
 * A tracked embed of another repository, read from the chosen checkout of that repository.
 * @param entry The tracked embed.
 * @param boards The ids of the vault's boards that track the file.
 * @param checkouts The checkouts identities resolve in.
 * @returns The embed, or why it was not read.
 */
function foreignEmbed(
	entry: TrackedEntry,
	boards: ReadonlySet<string>,
	checkouts: ReturnType<typeof checkoutsReadFrom>,
): ForeignEmbed {
	const checkout = checkouts.find((each) => each.repo === entry.repo && each.exists);
	if (checkout === undefined) return { kind: "unreachable", entry };
	const root = fs.realpathSync.native(checkout.root);
	const found = embedAt(root, entry.path);
	// A recipe that cannot be read is the file's own finding; one of a board that tracks no such file makes it none of these.
	return found === undefined || (found.recipe.ok && !boards.has(found.recipe.recipe.board.id))
		? { kind: "missing", entry, root }
		: { kind: "embed", entry, embed: { ...found, repo: entry.repo } };
}

export { fileKey, foreignEmbed, trackedEmbedsOf, trackingBoards, type ForeignEmbed };

// The tracked embeds of a vault's boards (ADR 0057): each file a board lists
// as `{ repo, path }`. A tracked embed is an embed, so the check reads a file
// of this vault's own repository among the embeds of its checkout, and a file
// of another repository among the embeds of the chosen registered checkout of
// that repository, from its working tree: a file Git tracks there, an SVG
// document or a PNG that carries a recipe, reached through no symbolic link,
// so `--fix` writes only inside that checkout.

import { BoardListingSchema } from "@archboard/board/board-listing";
import { requestJson } from "@archboard/server-lifecycle/server-client";
import type { checkoutsReadFrom } from "@archboard/code-binding/resolution";
import type { EmbedFinding } from "#cli/protocol/check/embeds-answer.ts";
import {
	checkoutEmbeds,
	type CheckoutEmbed,
} from "#cli/operations/vault/embeds/checkout-embeds.ts";
import {
	trackedMissingFinding,
	unreachableFinding,
	type TrackedEntry,
} from "#cli/operations/vault/embeds/embed-findings.ts";

/** The files of one repository's tracked embeds, as this machine finds them. */
interface TrackedFiles {
	/** The checkout the files were read in, or undefined when no checkout of the repository is on this machine. */
	readonly root: string | undefined;
	/** Each tracked file that is an embed there, by the path Git names it by. */
	readonly embeds: ReadonlyMap<string, CheckoutEmbed>;
}

/** The checkout that holds the vault: its repository, its root and its embeds. */
interface OwnCheckout {
	readonly repo: string | undefined;
	readonly root: string;
	readonly embeds: readonly CheckoutEmbed[];
}

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
 * The tracked files of another repository, read in its chosen registered checkout.
 * @param repo The repository identity.
 * @param files The files its tracked embeds name.
 * @param checkouts The checkouts identities resolve in.
 * @param signal Cancels the listing.
 * @returns Each file that is an embed there.
 * @throws {Error} When Git cannot list what that checkout tracks.
 */
async function foreignFiles(
	repo: string,
	files: ReadonlySet<string>,
	checkouts: ReturnType<typeof checkoutsReadFrom>,
	signal: AbortSignal,
): Promise<TrackedFiles> {
	const checkout = checkouts.find((each) => each.repo === repo && each.exists);
	if (checkout === undefined) return { root: undefined, embeds: new Map() };
	const embeds = await checkoutEmbeds(checkout.root, signal, files);
	return {
		root: checkout.root,
		embeds: new Map(embeds.map((embed) => [embed.file, { ...embed, repo }])),
	};
}

/**
 * The files of the tracked embeds of every repository, by repository: this
 * vault's own among the embeds of its checkout, and each other one's read in
 * its chosen registered checkout.
 * @param tracked The vault's tracked embeds.
 * @param own The checkout that holds the vault.
 * @param checkouts The checkouts identities resolve in.
 * @param signal Cancels the listings.
 * @returns The files of each repository that a board tracks.
 */
async function trackedFiles(
	tracked: readonly TrackedEntry[],
	own: OwnCheckout,
	checkouts: ReturnType<typeof checkoutsReadFrom>,
	signal: AbortSignal,
): Promise<ReadonlyMap<string, TrackedFiles>> {
	const named = new Map<string, Set<string>>();
	for (const { repo, path } of tracked) named.set(repo, (named.get(repo) ?? new Set()).add(path));
	const read = await Promise.all(
		[...named].map(async ([repo, files]): Promise<[string, TrackedFiles]> => [
			repo,
			repo === own.repo
				? { root: own.root, embeds: new Map(own.embeds.map((embed) => [embed.file, embed])) }
				: await foreignFiles(repo, files, checkouts, signal),
		]),
	);
	return new Map(read);
}

/**
 * What a tracked embed is, when it is no embed of its board that the check reads.
 * @param entry The tracked embed.
 * @param files The files of its repository.
 * @param own Whether its repository is the one of the checkout that holds the vault.
 * @returns The finding, or undefined when the check reads the file as an embed.
 */
function trackedFinding(
	entry: TrackedEntry,
	files: TrackedFiles | undefined,
	own: boolean,
): EmbedFinding | undefined {
	if (files?.root === undefined) return unreachableFinding(entry);
	const embed = files.embeds.get(entry.path);
	// A recipe that cannot be read is the file's own finding.
	if (
		embed !== undefined &&
		(!embed.recipe.ok || embed.recipe.recipe.board.id === entry.board.id)
	) {
		return undefined;
	}
	return trackedMissingFinding(entry, own, files.root);
}

/**
 * The tracked embeds of other repositories that the check reads, each file
 * once: an embed whose recipe names a board that tracks it, or one whose
 * recipe cannot be read.
 * @param tracked The vault's tracked embeds.
 * @param files The files of each repository.
 * @param ownRepo The repository of the checkout that holds the vault.
 * @param tracking The ids of the boards that track each file.
 * @returns Each such embed, in the order the boards list them.
 */
function foreignEmbeds(
	tracked: readonly TrackedEntry[],
	files: ReadonlyMap<string, TrackedFiles>,
	ownRepo: string | undefined,
	tracking: ReadonlyMap<string, ReadonlySet<string>>,
): CheckoutEmbed[] {
	const seen = new Set<string>();
	return tracked.flatMap(({ repo, path }) => {
		const key = fileKey(repo, path);
		const embed = files.get(repo)?.embeds.get(path);
		if (repo === ownRepo || embed === undefined || seen.has(key)) return [];
		seen.add(key);
		const read = !embed.recipe.ok || tracking.get(key)?.has(embed.recipe.recipe.board.id) === true;
		return read ? [embed] : [];
	});
}

export {
	fileKey,
	foreignEmbeds,
	trackedEmbedsOf,
	trackedFiles,
	trackedFinding,
	trackingBoards,
	type TrackedFiles,
};

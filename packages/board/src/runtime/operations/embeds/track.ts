// Tracking an embed (ADR 0057): the board lists a render that a repository
// keeps, so that the board's side knows where its picture is shown.
//
// The list belongs to the board, so the transition changes no variant, and the
// last change that behind reads (ADR 0045) stays where it was. An addition to
// the list cannot undo what another writer did, so the write states no version
// it read: the write boundary applies it to the board as it stands under the
// lease. An embed the board lists already is refused as such, and the route
// answers that refusal as the board unchanged, so tracking twice is tracking once.

import type { SemanticBoard, TrackedEmbed } from "#shared/schemas/board-document.ts";
import { refuse } from "#runtime/operations/write/outcome.ts";
import type { SemanticTransition } from "#runtime/operations/write/transitions.ts";

/**
 * Whether a board lists an embed already.
 * @param board The board.
 * @param embed The embed.
 * @returns True when the board lists the same repository and file.
 */
function tracksEmbed(board: SemanticBoard, embed: TrackedEmbed): boolean {
	return (board.trackedEmbeds ?? []).some(
		(listed) => listed.repo === embed.repo && listed.path === embed.path,
	);
}

/**
 * List one embed on a board.
 * @param embed The repository and the file in it.
 * @returns The transition.
 */
function trackEmbedTransition(embed: TrackedEmbed): SemanticTransition {
	return {
		summary: `track the embed ${embed.path} of ${embed.repo}`,
		changesExistingBoard: false,
		/**
		 * Build the board with the embed listed.
		 * @param before The board as it stands.
		 * @param at The timestamp the write is being made at.
		 * @returns The board, or why it cannot list the embed.
		 */
		apply: (before, at) => {
			if (before === null) {
				return refuse("BOARD_MISSING", "there is no such board in the vault");
			}
			if (tracksEmbed(before, embed)) {
				return refuse(
					"EMBED_ALREADY_TRACKED",
					`The board tracks ${embed.path} of ${embed.repo} already. Nothing was written.`,
				);
			}
			return {
				ok: true,
				board: {
					...before,
					updatedAt: at,
					trackedEmbeds: [...(before.trackedEmbeds ?? []), { repo: embed.repo, path: embed.path }],
				},
			};
		},
	};
}

export { trackEmbedTransition };

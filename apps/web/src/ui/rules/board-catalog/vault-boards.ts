// One vault's boards as the shell and its panes read them, made once for each
// answer of the server. Every pane reads them, and a new copy of the same
// boards would draw every pane again for news that changed nothing. Pure.

import { buildOutline, type OutlineNode } from "#ui/rules/board-catalog/outline.ts";
import { vaultHalf, type VaultHalf } from "#ui/rules/board-catalog/listing.ts";
import type { SemanticBoardListing } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { CatalogBoard } from "#ui/rules/pane-session/session-types.ts";

const halves = new WeakMap<SemanticBoardListing, VaultHalf>();
const outlines = new WeakMap<readonly CatalogBoard[], readonly OutlineNode<CatalogBoard>[]>();

/**
 * A vault's half of the listing, the same one for the same answer.
 * @param answer The vault's listing as the server sent it.
 * @returns Its half.
 */
function halfOf(answer: SemanticBoardListing): VaultHalf {
	const kept = halves.get(answer);
	if (kept !== undefined) return kept;
	const made = vaultHalf(answer);
	halves.set(answer, made);
	return made;
}

/**
 * A vault's outline, the same one for the same boards.
 * @param half The vault's boards and levels.
 * @returns The outline the navigator and a pane's breadcrumb place boards by.
 */
function outlineOf(half: VaultHalf): readonly OutlineNode<CatalogBoard>[] {
	const kept = outlines.get(half.boards);
	if (kept !== undefined) return kept;
	const made = buildOutline(half.boards, half.levels);
	outlines.set(half.boards, made);
	return made;
}

export { halfOf, outlineOf };

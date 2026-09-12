// Which boards exist, as a byte-bounded inventory the voice coordinator opens
// with.
//
// Addresses only. Board content stays behind the ordinary read commands, and
// the budget is what keeps it that way: a catalogue that grew with the vault
// would eventually be the vault, and the coordinator's context is shared with
// the semantic brief that says what the person is actually looking at.

import fs from "node:fs";
import { requireVaultRoot } from "@/runtime/engine/board";
import { listSemanticBoards } from "@/runtime/semantic-board-store/index";

// Leaves room for the separate semantic brief within Codex's realtime context budget.
const CATALOGUE_MAX_BYTES = 8192;

/**
 * Compact address catalogue; board contents stay behind the normal read commands.
 * @param root The vault to list.
 * @returns The byte-bounded JSON inventory, including its omitted count.
 */
function readBoardCatalogue(root = requireVaultRoot()): string {
	const entries = listSemanticBoards(root)
		.map(({ key, name }) => ({ key, board: name }))
		.toSorted((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
	const boards: typeof entries = [];
	let omitted = entries.length;
	/**
	 * Encode the retained entries and the number that did not fit.
	 * @returns The current catalogue JSON.
	 */
	const encode = (): string =>
		JSON.stringify({ type: "archboard_board_catalogue", boards, omitted });
	for (const entry of entries) {
		boards.push(entry);
		omitted -= 1;
		if (Buffer.byteLength(encode()) > CATALOGUE_MAX_BYTES) {
			boards.pop();
			omitted += 1;
			break;
		}
	}
	return encode();
}

/**
 * Watch the vault for boards appearing and disappearing, whoever wrote them.
 * @param onChange Receives catalogue invalidations.
 * @param onError Receives filesystem watch failures.
 * @param root The vault to watch.
 * @returns Stops the watcher.
 */
function watchBoardCatalogue(
	onChange: () => void,
	onError: (error: Error) => void,
	root = requireVaultRoot(),
): () => void {
	const watcher = fs.watch(root, { recursive: true, persistent: false }, (event, filename) => {
		if (event === "rename" && !filename?.split(/[\\/]/).some((part) => part.startsWith("."))) {
			onChange();
		}
	});
	watcher.on("error", onError);
	return () => watcher.close();
}

export { readBoardCatalogue, watchBoardCatalogue };

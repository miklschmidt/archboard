import fs from "node:fs";
import { listBoards, requireVaultRoot } from "./board.js";

// Leaves room for the separate semantic brief within Codex's realtime context budget.
const CATALOGUE_MAX_BYTES = 8192;

/** Compact address catalogue; board contents stay behind the normal read commands. */
export function readBoardCatalogue(root = requireVaultRoot()): string {
	const entries = listBoards(root)
		.map(({ key, identity }) => ({
			key,
			board: identity.board,
			variant: identity.variant,
		}))
		.toSorted((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
	const boards: typeof entries = [];
	let omitted = entries.length;
	const encode = () => JSON.stringify({ type: "archboard_board_catalogue", boards, omitted });
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

/** Watch unopened boards and external vault edits as well as Archboard's own writes. */
export function watchBoardCatalogue(
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

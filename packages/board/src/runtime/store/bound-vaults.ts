// Which known vaults hold boards of one repository's code (TASK-480).
//
// A repository can keep its architecture in another repository's vault, whose
// boards bind its code. A command run in a checkout of that repository finds no
// vault of its own, and its refusal names these vaults as the `-C` to give.
//
// The known vaults are the ones the navigator lists: the vault of each chosen
// checkout and each untracked vault on this machine. Each board is decoded in
// memory, as the history lens reads one: a refusal takes no lease and writes no
// migration into another repository's vault.

import fs from "node:fs";
import path from "node:path";
import { chosenCheckouts, listRegistry } from "@archboard/workspace/repo-registry";
import { VAULT_DIRECTORY, isVaultLayout, type BoundVault } from "@archboard/workspace/vault-finder";
import { decodeSemanticBoardDocument } from "#runtime/store/format/decode.ts";
import { listSemanticBoards } from "#runtime/operations/read/listing.ts";

/**
 * The vault a known directory holds, as its real path, when the server would serve it.
 * @param holder A chosen checkout or the directory of an untracked vault.
 * @returns The vault, or undefined when it holds none.
 */
function servedVaultOf(holder: string): string | undefined {
	try {
		const vault = fs.realpathSync.native(path.join(holder, VAULT_DIRECTORY));
		return isVaultLayout(vault) && fs.statSync(vault).isDirectory() ? vault : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The name of a board in one file, when a node of any of its variants binds the repository.
 * @param file The board's file.
 * @param repo The repository identity.
 * @returns The board's name, or undefined when it binds none of the repository's code or does not read.
 */
function boardBinding(file: string, repo: string): string | undefined {
	let text: string;
	try {
		text = fs.readFileSync(file, "utf8");
	} catch {
		return undefined;
	}
	const decoded = decodeSemanticBoardDocument(text);
	if (!decoded.ok) return undefined;
	const { board } = decoded;
	const binds = board.variants.some((variant) =>
		variant.content.nodes.some((node) => node.binding?.repo === repo),
	);
	return binds ? board.name : undefined;
}

/**
 * The known vaults whose boards bind a repository's code, and those boards.
 * @param repo The repository identity, as a binding names it.
 * @returns Each vault that holds such a board, by the directory that holds it, in path order.
 */
function vaultsBoundTo(repo: string): BoundVault[] {
	const holders = [
		...chosenCheckouts().filter((each) => each.exists),
		...listRegistry().vaults.filter((each) => each.exists),
	].map((each) => each.root);
	return [...new Set(holders)].toSorted().flatMap((holder) => {
		const vault = servedVaultOf(holder);
		if (vault === undefined) return [];
		const boards = listSemanticBoards(vault).flatMap((location) => {
			const name = boardBinding(location.file, repo);
			return name === undefined ? [] : [name];
		});
		return boards.length === 0 ? [] : [{ holder, boards }];
	});
}

export { vaultsBoundTo };

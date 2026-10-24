// The vault a recipe names (ADR 0057, ADR 0049). A recipe names its vault by
// the repository identity of the vault's checkout. A reader of this
// checkout's vault resolves an identity as every binding is resolved: to this
// checkout for its own identity, and to the chosen registered checkout for any
// other. A vault that no checkout on this machine holds is not read here; the
// answer says why, and fetching one is a later step (TASK-526.05).

import fs from "node:fs";
import path from "node:path";
import { listSemanticBoardsOnServer } from "@archboard/server-lifecycle/semantic-board-client";
import { VAULT_DIRECTORY } from "@archboard/workspace/vault";
import { normalizeBoardKey } from "@archboard/board/address";
import type { checkoutsReadFrom } from "@archboard/code-binding/resolution";

/** A board as its vault lists it. */
interface ListedBoard {
	readonly id: string;
	readonly name: string;
}

/** A vault a recipe names, read once for every embed that names it. */
type VaultReading =
	| {
			readonly ok: true;
			readonly vault: string;
			readonly byId: ReadonlyMap<string, ListedBoard>;
			readonly boards: readonly ListedBoard[];
			/**
			 * The names of the boards the vault lists and could not read. The
			 * listing names no id for them, so any of them can be the board an
			 * embed names.
			 */
			readonly unreadable: readonly string[];
	  }
	| { readonly ok: false; readonly reason: string };

/** The checkouts a reader of one vault resolves identities in. */
type ReadCheckouts = ReturnType<typeof checkoutsReadFrom>;

/**
 * The board of a vault that goes by a name now.
 * @param reading The vault.
 * @param name The name.
 * @returns The board, or undefined when none goes by it.
 */
function boardNamed(
	reading: Extract<VaultReading, { ok: true }>,
	name: string,
): ListedBoard | undefined {
	const key = normalizeBoardKey(name);
	return reading.boards.find((board) => normalizeBoardKey(board.name) === key);
}

/**
 * The vault a repository identity names, as a reader of this checkout's vault resolves it.
 * @param repo The identity the recipe names, or null for a vault in no repository.
 * @param checkouts The checkouts that reader resolves identities in.
 * @returns The vault directory, or why no checkout on this machine holds it.
 */
function vaultOf(
	repo: string | null,
	checkouts: ReadCheckouts,
): { readonly vault: string } | { readonly reason: string } {
	if (repo === null) {
		return {
			reason:
				"The recipe names a vault in no Git repository, which no checkout can find. Draw it again from a vault in a repository.",
		};
	}
	const checkout = checkouts.find((each) => each.repo === repo);
	if (checkout === undefined) {
		return {
			reason: `No checkout of ${repo} is registered on this machine, so the embed was not checked. Register one with \`archboard repo add <directory>\`, or choose one with \`archboard repo use <directory>\`.`,
		};
	}
	const vault = path.join(checkout.root, VAULT_DIRECTORY);
	if (!fs.existsSync(vault)) {
		return {
			reason: `The chosen checkout of ${repo}, ${checkout.root}, holds no vault, so the embed was not checked.`,
		};
	}
	return { vault: fs.realpathSync.native(vault) };
}

/**
 * Read the vault an identity names: where it is and which boards it holds by id.
 * @param repo The identity.
 * @param checkouts The checkouts identities resolve in.
 * @returns The reading.
 */
async function readVault(repo: string | null, checkouts: ReadCheckouts): Promise<VaultReading> {
	const found = vaultOf(repo, checkouts);
	if ("reason" in found) return { ok: false, reason: found.reason };
	const listing = await listSemanticBoardsOnServer(found.vault);
	const boards = listing.boards.flatMap((board) =>
		board.id === undefined ? [] : [{ id: board.id, name: board.name }],
	);
	return {
		ok: true,
		vault: found.vault,
		byId: new Map(boards.map((board) => [board.id, board])),
		boards,
		unreadable: listing.boards.flatMap((board) => (board.id === undefined ? [board.name] : [])),
	};
}

/**
 * A reader that reads each vault once, however many embeds name it.
 * @param checkouts The checkouts identities resolve in.
 * @returns The vault an identity names.
 */
function vaultReader(checkouts: ReadCheckouts): (repo: string | null) => Promise<VaultReading> {
	const read = new Map<string | null, Promise<VaultReading>>();
	return (repo) => {
		let reading = read.get(repo);
		if (reading === undefined) {
			reading = readVault(repo, checkouts);
			read.set(repo, reading);
		}
		return reading;
	};
}

export { boardNamed, vaultReader, type ListedBoard, type VaultReading };

// The vault a recipe names (ADR 0057, ADR 0049). A recipe names its vault by
// the repository identity of the vault's checkout. A reader of this
// checkout's vault resolves an identity as every binding is resolved: to this
// checkout for its own identity, and to the chosen registered checkout for any
// other, read as that checkout holds it and never fetched. A vault that no
// checkout on this machine holds is fetched from the default branch of its
// repository, or read from the cache when the fetch fails (`fetched-vaults.ts`).
// A vault that cannot be read, the server's refusal included, is a finding
// about each embed that names it, never the end of the check.

import fs from "node:fs";
import path from "node:path";
import { listSemanticBoardsOnServer } from "@archboard/server-lifecycle/semantic-board-client";
import { VAULT_DIRECTORY } from "@archboard/workspace/vault";
import { normalizeBoardKey } from "@archboard/board/address";
import type { checkoutsReadFrom } from "@archboard/code-binding/resolution";
import { isRecord, stringAt } from "@archboard/diagnostics/unknown-record";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import type { EmbedVault } from "#cli/protocol/check/embeds-answer.ts";
import { fetchedVault } from "#cli/operations/vault/embeds/fetched-vaults.ts";

/** A board as its vault lists it. */
interface ListedBoard {
	readonly id: string;
	readonly name: string;
}

/** Why the vault a recipe names cannot be read: a warning when a fetch failed with nothing cached. */
interface VaultFailure {
	readonly ok: false;
	readonly code: "EMBED_VAULT_UNAVAILABLE" | "EMBED_VAULT_FETCH_FAILED";
	readonly reason: string;
}

/** A vault a recipe names, read once for every embed that names it. */
type VaultReading =
	| {
			readonly ok: true;
			readonly vault: string;
			/** Where the check read it, for the answer's list of vaults. */
			readonly read: EmbedVault;
			readonly byId: ReadonlyMap<string, ListedBoard>;
			readonly boards: readonly ListedBoard[];
			/**
			 * The names of the boards the vault lists and could not read. The
			 * listing names no id for them, so any of them can be the board an
			 * embed names.
			 */
			readonly unreadable: readonly string[];
	  }
	| VaultFailure;

/** The checkouts a reader of one vault resolves identities in. */
type ReadCheckouts = ReturnType<typeof checkoutsReadFrom>;

/** The vault directory an identity names, and where it was read. */
type FoundVault =
	| { readonly ok: true; readonly vault: string; readonly read: EmbedVault }
	| VaultFailure;

/**
 * A vault that cannot be read, which is information.
 * @param reason Why.
 * @returns The failure.
 */
function unavailable(reason: string): VaultFailure {
	return { ok: false, code: "EMBED_VAULT_UNAVAILABLE", reason };
}

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
 * The vault of the default branch of a repository that no checkout on this
 * machine holds: fetched, or the newest cached copy when the fetch fails.
 * @param repo The identity.
 * @param signal Cancels the fetch.
 * @returns The vault, or why there is none.
 */
async function remoteVault(repo: string, signal: AbortSignal): Promise<FoundVault> {
	const fetched = await fetchedVault(repo, signal);
	if (!fetched.ok) {
		return fetched.failure === "unfetchable"
			? unavailable(
					`No checkout of ${repo} is registered on this machine, and ${fetched.reason}, so the embed was not checked. Register one with \`archboard repo add <directory>\`.`,
				)
			: {
					ok: false,
					code: "EMBED_VAULT_FETCH_FAILED",
					reason: `No checkout of ${repo} is registered on this machine, fetching its vault failed (${fetched.reason}), and no copy is cached, so the embed was not checked. Check the network and your Git credentials for ${repo}, or register a checkout with \`archboard repo add <directory>\`.`,
				};
	}
	const { commit, fetchFailed } = fetched;
	if (fetched.vault === undefined) {
		const read =
			fetchFailed === undefined
				? `The default branch of ${repo}, at ${commit.slice(0, 9)},`
				: `Fetching the vault of ${repo} failed (${fetchFailed}), and the newest cached commit, ${commit.slice(0, 9)},`;
		return unavailable(`${read} holds no ${VAULT_DIRECTORY}, so the embed was not checked.`);
	}
	const read: EmbedVault =
		fetchFailed === undefined
			? { source: "fetched", repo, commit }
			: {
					source: "cache",
					repo,
					commit,
					severity: "information",
					code: "EMBED_VAULT_CACHED",
					message: `Fetching the vault of ${repo} failed (${fetchFailed}), so the check read the newest cached commit, ${commit.slice(0, 9)}, which can be behind the default branch.`,
				};
	return { ok: true, vault: fetched.vault, read };
}

/**
 * The vault a repository identity names, as a reader of this checkout's vault resolves it.
 * @param repo The identity the recipe names, or null for a vault in no repository.
 * @param checkouts The checkouts that reader resolves identities in.
 * @param signal Cancels a fetch.
 * @returns The vault directory and where it was read, or why it cannot be read.
 */
async function vaultOf(
	repo: string | null,
	checkouts: ReadCheckouts,
	signal: AbortSignal,
): Promise<FoundVault> {
	if (repo === null) {
		return unavailable(
			"The recipe names a vault in no Git repository, which no checkout can find. Draw it again from a vault in a repository.",
		);
	}
	const checkout = checkouts.find((each) => each.repo === repo);
	if (checkout === undefined) return remoteVault(repo, signal);
	const vault = path.join(checkout.root, VAULT_DIRECTORY);
	if (!fs.existsSync(vault)) {
		return unavailable(
			`The chosen checkout of ${repo}, ${checkout.root}, holds no vault, so the embed was not checked.`,
		);
	}
	return { ok: true, vault: fs.realpathSync.native(vault), read: { source: "checkout", repo } };
}

/**
 * Whether the server refused to read a vault, rather than failing to answer.
 * @param error What listing the vault threw.
 * @returns True for the server's refusal of the vault.
 */
function isVaultRefusal(error: unknown): boolean {
	return isRecord(error) && stringAt(error, "code") === "VAULT_UNREADABLE";
}

/**
 * Read the vault an identity names: where it is and which boards it holds by id.
 * @param repo The identity.
 * @param checkouts The checkouts identities resolve in.
 * @param signal Cancels a fetch.
 * @returns The reading.
 */
async function readVault(
	repo: string | null,
	checkouts: ReadCheckouts,
	signal: AbortSignal,
): Promise<VaultReading> {
	const found = await vaultOf(repo, checkouts, signal);
	if (!found.ok) return found;
	const listing = await listSemanticBoardsOnServer(found.vault).catch((error: unknown) => {
		if (isVaultRefusal(error)) return errorMessage(error);
		throw error;
	});
	if (typeof listing === "string") {
		return unavailable(
			`The server cannot read the vault of ${repo} at ${found.vault}, so the embed was not checked: ${listing}`,
		);
	}
	const boards = listing.boards.flatMap((board) =>
		board.id === undefined ? [] : [{ id: board.id, name: board.name }],
	);
	return {
		ok: true,
		vault: found.vault,
		read: found.read,
		byId: new Map(boards.map((board) => [board.id, board])),
		boards,
		unreadable: listing.boards.flatMap((board) => (board.id === undefined ? [board.name] : [])),
	};
}

/** Each vault the embeds name, read once however many embeds name it. */
interface VaultReader {
	/** The vault an identity names. */
	readonly read: (repo: string | null) => Promise<VaultReading>;
	/** Every vault read so far, in the order the embeds named them. */
	readonly vaults: () => Promise<EmbedVault[]>;
}

/**
 * A reader that reads each vault once, however many embeds name it.
 * @param checkouts The checkouts identities resolve in.
 * @param signal Cancels a fetch.
 * @returns The reader.
 */
function vaultReader(checkouts: ReadCheckouts, signal: AbortSignal): VaultReader {
	const readings = new Map<string | null, Promise<VaultReading>>();
	/**
	 * The vault an identity names, read on first use.
	 * @param repo The identity.
	 * @returns The reading.
	 */
	function read(repo: string | null): Promise<VaultReading> {
		let reading = readings.get(repo);
		if (reading === undefined) {
			reading = readVault(repo, checkouts, signal);
			readings.set(repo, reading);
		}
		return reading;
	}
	/**
	 * Where each vault that could be read was read.
	 * @returns The vaults.
	 */
	async function vaults(): Promise<EmbedVault[]> {
		const all = await Promise.all(readings.values());
		return all.flatMap((reading) => (reading.ok ? [reading.read] : []));
	}
	return { read, vaults };
}

export { boardNamed, vaultReader, type ListedBoard, type VaultReading };

// The repositories this machine knows, as the navigator lists them (ADR 0050):
// every repository identity with a known checkout that has a vault, and every
// untracked vault, each read from its chosen checkout. A vault is a directory
// to the server and a repository's name to the page, and this is where one is
// turned into the other.

import fs from "fs";
import path from "path";

import { listRegistry, type RegisteredRepoStatus } from "@/runtime/engine/repo-registry";
import { serverVault } from "@/server/archboard/lib/server-vault";

/** Where a checkout keeps its vault (ADR 0049). */
const VAULT_DIRECTORY = path.join(".archboard", "vault");

/** One known checkout of a repository, as its menu lists it. */
interface CheckoutEntry {
	root: string;
	chosen: boolean;
	exists: boolean;
	hasVault: boolean;
}

/**
 * Why a repository shows no boards, when it shows none: its chosen checkout is
 * gone, or has no vault, or the repository has no chosen checkout at all.
 */
type RepositoryState = "ready" | "gone" | "no-vault" | "unchosen";

/** One repository as the navigator lists it. */
interface RepositoryEntry {
	/** The repository identity, or the registry name of an untracked vault. */
	name: string;
	untracked: boolean;
	/** The canonical vault of the chosen checkout, or null when it has none to read. */
	vault: string | null;
	state: RepositoryState;
	/** The known checkouts, for the menu that chooses one. An untracked vault has none. */
	checkouts: CheckoutEntry[];
}

/**
 * The canonical vault of a directory, when it holds one.
 * @param root The checkout or the directory that holds an untracked vault.
 * @returns The vault's real path, or null when there is none.
 */
function vaultIn(root: string): string | null {
	try {
		const real = fs.realpathSync(path.join(root, VAULT_DIRECTORY));
		return fs.statSync(real).isDirectory() ? real : null;
	} catch {
		return null;
	}
}

/**
 * One identity's entry, built from its known checkouts.
 * @param name The identity.
 * @param checkouts Its known checkouts.
 * @returns The entry, or null when none of its checkouts has a vault.
 */
function identityEntry(name: string, checkouts: RegisteredRepoStatus[]): RepositoryEntry | null {
	const listed = checkouts.map((each) => ({
		root: each.root,
		chosen: each.chosen,
		exists: each.exists,
		hasVault: each.exists && vaultIn(each.root) !== null,
	}));
	if (!listed.some((each) => each.hasVault)) {
		return null;
	}
	const chosen = checkouts.find((each) => each.chosen);
	const vault = chosen?.exists === true ? vaultIn(chosen.root) : null;
	return { name, untracked: false, vault, state: stateOf(chosen, vault), checkouts: listed };
}

/**
 * Why an identity's chosen checkout shows boards or does not.
 * @param chosen The chosen checkout, if the identity has one.
 * @param vault Its vault, when it has one.
 * @returns The state.
 */
function stateOf(chosen: RegisteredRepoStatus | undefined, vault: string | null): RepositoryState {
	if (chosen === undefined) {
		return "unchosen";
	}
	if (!chosen.exists) {
		return "gone";
	}
	return vault === null ? "no-vault" : "ready";
}

/**
 * Every repository the navigator lists, by name.
 *
 * Until the first command registers its checkout (TASK-472.06), the vault this
 * server was started with may be in no registered checkout, so it is listed by
 * its directory's name rather than left out of the page that serves it.
 * @returns The repositories.
 */
function listRepositories(): RepositoryEntry[] {
	const registry = listRegistry();
	const identities = [...new Set(registry.checkouts.map((each) => each.repo))].flatMap((name) => {
		const entry = identityEntry(
			name,
			registry.checkouts.filter((each) => each.repo === name),
		);
		return entry === null ? [] : [entry];
	});
	const untracked = registry.vaults.flatMap((each) => {
		const vault = each.exists ? vaultIn(each.root) : null;
		return vault === null
			? []
			: [{ name: each.name, untracked: true, vault, state: "ready" as const, checkouts: [] }];
	});
	const listed = [...identities, ...untracked];
	const served = serverVault();
	if (!listed.some((each) => each.vault === served) && fs.existsSync(served)) {
		listed.push({
			name: path.basename(path.dirname(path.dirname(served))),
			untracked: true,
			vault: served,
			state: "ready",
			checkouts: [],
		});
	}
	return listed.toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * The name the navigator lists a vault under.
 * @param vault A canonical vault.
 * @returns The repository's name, or null when no listed repository reads that vault.
 */
function repositoryOfVault(vault: string): string | null {
	return listRepositories().find((each) => each.vault === vault)?.name ?? null;
}

export { listRepositories, repositoryOfVault, vaultIn, VAULT_DIRECTORY, type RepositoryEntry };

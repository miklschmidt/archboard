// The repositories this machine knows, as the navigator lists them (ADR 0050):
// every repository identity with a known checkout that has a vault, and every
// untracked vault, each read from its chosen checkout. A vault is a directory
// to the server and a repository's name to the page, and this is where one is
// turned into the other.

import fs from "fs";
import path from "path";

import {
	chosenCheckouts,
	listRegistry,
	repositoryOfVault as registeredRepositoryOf,
	type RegisteredRepoStatus,
} from "@/runtime/engine/repo-registry";
import { checkoutOfVault } from "@/runtime/engine/vault-finder";
import { isVaultLayout } from "@/runtime/engine/vault-finder";
import type { RepositoryEntry, RepositoryState } from "@/shared/repositories/index";

/** Where a checkout keeps its vault (ADR 0049). */
const VAULT_DIRECTORY = path.join(".archboard", "vault");

/**
 * The canonical vault of a directory, when it holds one the server serves: a `.archboard/vault`
 * that a link leads elsewhere is refused by every call (`namedVault`), so no page opens in it.
 * @param root The checkout or the directory that holds an untracked vault.
 * @returns The vault's real path, or null when there is none.
 */
function vaultIn(root: string): string | null {
	try {
		const real = fs.realpathSync(path.join(root, VAULT_DIRECTORY));
		return isVaultLayout(real) && fs.statSync(real).isDirectory() ? real : null;
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
	return [...identities, ...untracked].toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Where a vault is, as a pane in it reports it, and where such a pane belongs now. */
interface VaultPlace {
	/**
	 * The vault a pane in this one belongs in: the vault of the chosen checkout
	 * when this is the vault of another checkout of its repository, else this vault.
	 */
	readonly home: string;
	/**
	 * The repository's name: the identity of the checkout that holds the vault,
	 * chosen or not, or the registry name of an untracked vault. Null for a vault
	 * that no registered directory holds and the navigator does not list.
	 */
	readonly repository: string | null;
	/** The checkout, or the directory that holds an untracked vault. */
	readonly checkout: string;
}

/**
 * Where a vault is, read from the registry as it is now. Every pane reports its
 * repository from here, so the name is the same in a pane, its address and
 * `browser panes`, and it changes when the registry does.
 * @param vault A canonical vault in the `<dir>/.archboard/vault` layout, as the server serves one.
 * @returns Its place.
 */
function placeOfVault(vault: string): VaultPlace {
	const registered = registeredRepositoryOf(vault);
	if (registered === undefined) {
		// A vault no registry entry holds is listed nowhere, so it has no repository's name.
		return { home: vault, repository: null, checkout: checkoutOfVault(vault) };
	}
	const { name, root, chosen } = registered;
	return {
		home: chosen ? vault : (chosenVaultOf(name) ?? vault),
		repository: name,
		checkout: root,
	};
}

/**
 * The vault of an identity's chosen checkout.
 * @param identity The repository identity.
 * @returns The vault, or null when no chosen checkout of it is here with a vault.
 */
function chosenVaultOf(identity: string): string | null {
	const chosen = chosenCheckouts().find((each) => each.repo === identity && each.exists);
	return chosen === undefined ? null : vaultIn(chosen.root);
}

/**
 * The name a pane in a vault reports its repository by.
 * @param vault A canonical vault.
 * @returns The repository's name, or null when no registered directory holds the vault and the
 * navigator does not list it.
 */
function repositoryOfVault(vault: string): string | null {
	return placeOfVault(vault).repository;
}

/**
 * The vault a page opens in when its address names no repository: that of the first ready
 * repository the navigator lists, by name.
 * @returns The vault, or null when no repository with a vault is known.
 */
function openingVault(): string | null {
	return listRepositories().find((each) => each.state === "ready")?.vault ?? null;
}

export {
	listRepositories,
	openingVault,
	placeOfVault,
	repositoryOfVault,
	vaultIn,
	VAULT_DIRECTORY,
	type RepositoryEntry,
	type VaultPlace,
};

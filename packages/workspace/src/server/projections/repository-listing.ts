// The repositories this machine knows, as the navigator lists them (ADR 0050):
// every repository identity with a known checkout that has a vault, and every
// untracked vault, each read from its chosen checkout. A vault is a directory
// to the server and a repository's name to the page, and this is where one is
// turned into the other.

import { listRegistry, repositoryOfVault } from "#runtime/store/repo-registry.ts";
import type { RegisteredRepoStatus } from "#runtime/store/registry-file.ts";
import { checkoutOf } from "#runtime/services/checkout-questions.ts";
import { checkoutOfVault, vaultIn } from "#runtime/services/vault-finder.ts";
import type { RepositoryEntry, RepositoryState } from "#shared/schemas/repositories.ts";

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
 * Why an identity's chosen checkout shows models or does not.
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
	/**
	 * Whether the browser reads this checkout for its repository; an untracked vault always is,
	 * and a vault no registered directory holds is not.
	 */
	readonly chosen: boolean;
}

/**
 * Where a vault is, read from the registry as it is now. Every pane reports its
 * repository from here, so the name is the same in a pane, its address and
 * `browser panes`, and it changes when the registry does.
 * @param vault A canonical vault in the `<dir>/.archboard/vault` layout, as the server serves one.
 * @returns Its place.
 */
function placeOfVault(vault: string): VaultPlace {
	const registered = repositoryOfVault(vault);
	if (registered === undefined) {
		// A vault no registry entry holds is listed nowhere, so it has no repository's name.
		return { home: vault, repository: null, checkout: checkoutOfVault(vault), chosen: false };
	}
	const { name, root, chosen } = registered;
	return {
		home: chosen ? vault : (chosenVaultOf(name) ?? vault),
		repository: name,
		checkout: root,
		chosen,
	};
}

/**
 * The vault of an identity's chosen checkout.
 * @param identity The repository identity.
 * @returns The vault, or null when no chosen checkout of it is here with a vault.
 */
function chosenVaultOf(identity: string): string | null {
	const chosen = checkoutOf(identity);
	return chosen.kind === "chosen" ? vaultIn(chosen.root) : null;
}

export { listRepositories, placeOfVault };

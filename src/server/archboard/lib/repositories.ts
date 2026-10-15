// The repositories this machine knows, as the navigator lists them (ADR 0050):
// every repository identity with a known checkout that has a vault, and every
// untracked vault, each read from its chosen checkout. A vault is a directory
// to the server and a repository's name to the page, and this is where one is
// turned into the other.

import fs from "fs";
import path from "path";

import { ARCHBOARD_VAULT } from "@/runtime/engine/config";
import { listRegistry, type RegisteredRepoStatus } from "@/runtime/engine/repo-registry";
import { canonicalConfiguredVault } from "@/server/archboard/lib/request-vault";
import type { RepositoryEntry, RepositoryState } from "@/shared/repositories/index";

/** Where a checkout keeps its vault (ADR 0049). */
const VAULT_DIRECTORY = path.join(".archboard", "vault");

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
 * The vault a set `ARCHBOARD_VAULT` names, canonical. The server needs no vault (ADR 0049), and
 * the variable still decides where a page opens until the test migration retires it
 * (TASK-472.07, TASK-472.09).
 * @returns The vault, or null when the variable is not set or names no directory.
 */
function environmentVault(): string | null {
	if (!ARCHBOARD_VAULT) return null;
	const vault = canonicalConfiguredVault(ARCHBOARD_VAULT);
	// A variable that names no directory opens no page: every call there would be refused.
	return fs.statSync(vault, { throwIfNoEntry: false })?.isDirectory() === true ? vault : null;
}

/**
 * The name of the environment's vault when no listed repository reads it: the
 * directory that holds its `.archboard/vault`, or the vault's own directory when
 * it is not in that layout, made unique the way a registry name is. A page
 * resolves an address's repository by this name, so two listed repositories
 * never share one.
 * @param served The environment's vault.
 * @param listed The repositories listed already.
 * @returns The name.
 */
function servedName(served: string, listed: readonly RepositoryEntry[]): string {
	const inLayout = served.endsWith(`${path.sep}${VAULT_DIRECTORY}`);
	const base = path.basename(inLayout ? path.dirname(path.dirname(served)) : served);
	const taken = new Set(listed.map((each) => each.name));
	let name = base;
	for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
	return name;
}

/**
 * Every repository the navigator lists, by name.
 *
 * A vault a set `ARCHBOARD_VAULT` names may be in no registered checkout, because a vault from
 * the environment never registers, so it is listed by its directory's name rather than left out
 * of the page that opens in it.
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
	const served = environmentVault();
	if (served !== null && !listed.some((each) => each.vault === served) && fs.existsSync(served)) {
		listed.push({
			name: servedName(served, listed),
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

/**
 * The vault a page opens in when its address names no repository: the one a set
 * `ARCHBOARD_VAULT` names, else that of the first ready repository the navigator lists, by name.
 * @returns The vault, or null when no repository with a vault is known.
 */
function openingVault(): string | null {
	return (
		environmentVault() ?? listRepositories().find((each) => each.state === "ready")?.vault ?? null
	);
}

export {
	listRepositories,
	openingVault,
	repositoryOfVault,
	vaultIn,
	VAULT_DIRECTORY,
	type RepositoryEntry,
};

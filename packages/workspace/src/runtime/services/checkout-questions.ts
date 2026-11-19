// What callers ask of the checkout registry (ADR 0049, ADR 0050): which checkout of a repository
// is chosen, choosing a known checkout, and which checkouts a vault reads.
//
// A binding or anchor names a repository identity. Every reader that turns one into a directory
// (the code opener, the code check, behind, footprint, locality and the vault's binding check)
// asks `checkoutsReadFrom` which checkout holds each identity for the vault it reads. The answer
// is the chosen checkout of every identity, except that the checkout holding the vault takes the
// place of its own identity, whether it is registered or chosen or not. So a proposal in a
// worktree is read against the worktree's code, and a vault in no checkout (an untracked vault)
// reads only chosen checkouts.
//
// The vault's checkout is found by asking Git (`gitCheckoutOfVault`), which is also how `behind`
// finds the commit a vault last changed in. The question is synchronous because the vault check,
// which every open canvas polls, is. A Git that does not answer leaves the vault in no checkout
// rather than naming it by a directory.

import fs from "node:fs";
import { GitCommandError } from "@archboard/process/git";
import { gitCheckoutOfVault } from "#runtime/clients/git-sync.ts";
import {
	changeRegistry,
	isDirectory,
	readRegistry,
	type RegisteredRepoStatus,
} from "#runtime/store/registry-file.ts";
import { listRegistry } from "#runtime/store/repo-registry.ts";
import { vaultIn } from "#runtime/services/vault-finder.ts";

/** Which checkout of a repository this machine reads, or why it reads none. */
type RepositoryCheckout =
	| { readonly kind: "chosen"; readonly root: string }
	/** Its checkouts are known and none is chosen, until `repo use`. */
	| { readonly kind: "unchosen"; readonly roots: readonly string[] }
	/** No checkout of it is known: the repositories that have a chosen one. */
	| { readonly kind: "unknown"; readonly chosenRepositories: readonly string[] };

/**
 * The checkout this machine reads for a repository: its chosen checkout, whether or not its
 * directory is still there.
 * @param repository The repository identity.
 * @returns The chosen checkout, the known roots when none is chosen, or the repositories that
 * have a chosen checkout when it has none known.
 */
function checkoutOf(repository: string): RepositoryCheckout {
	const { checkouts } = readRegistry();
	const chosen = checkouts.find((each) => each.repo === repository && each.chosen);
	if (chosen !== undefined) return { kind: "chosen", root: chosen.root };
	const roots = checkouts.filter((each) => each.repo === repository).map((each) => each.root);
	return roots.length > 0
		? { kind: "unchosen", roots }
		: {
				kind: "unknown",
				chosenRepositories: checkouts.filter((each) => each.chosen).map((each) => each.repo),
			};
}

/** What choosing a checkout did, or why it chose none. */
type CheckoutChoice =
	| {
			readonly kind: "chosen";
			/** Whether it was not the chosen one before. */
			readonly changed: boolean;
			/** The root of the checkout it replaced, or null when its identity had none chosen or nothing changed. */
			readonly replaced: string | null;
	  }
	/** The root is not a known checkout of the repository. */
	| { readonly kind: "unknown" }
	/** The checkout's directory is gone from this machine. */
	| { readonly kind: "gone" }
	/** The checkout holds no vault the server serves, so it has no models to read. */
	| { readonly kind: "no-vault" };

/**
 * Make a known checkout the chosen one of its repository, as `repo use` does, in the registry
 * alone: the checkout is known, so Git has nothing to add. The navigator's menu and
 * `browser show` choose through here (ADR 0050). A checkout whose directory is gone or that
 * holds no vault is refused, because a pane moved there could read nothing.
 * @param repository The repository identity.
 * @param root The checkout's root, as the registry holds it.
 * @returns What the choice did, or why it chose nothing.
 * @throws {RegistryWriteError} When the registry cannot be written.
 */
function chooseCheckout(repository: string, root: string): CheckoutChoice {
	return changeRegistry((registry): CheckoutChoice => {
		const checkout = registry.checkouts.find(
			(each) => each.repo === repository && each.root === root,
		);
		if (checkout === undefined) return { kind: "unknown" };
		const unusable = unusableAt(root);
		if (unusable !== undefined) return unusable;
		if (checkout.chosen) return { kind: "chosen", changed: false, replaced: null };
		const before = registry.checkouts.find((each) => each.repo === repository && each.chosen);
		registry.checkouts = registry.checkouts.map((each) =>
			each.repo === repository ? { ...each, chosen: each === checkout } : each,
		);
		return { kind: "chosen", changed: true, replaced: before?.root ?? null };
	});
}

/**
 * Why a known checkout cannot be read, if it cannot.
 * @param root Its root.
 * @returns The refusal, or undefined when it holds a vault the server serves.
 */
function unusableAt(
	root: string,
): Extract<CheckoutChoice, { kind: "gone" | "no-vault" }> | undefined {
	if (!isDirectory(root)) return { kind: "gone" };
	return vaultIn(root) === null ? { kind: "no-vault" } : undefined;
}

/** The checkout that holds a vault: its canonical root, and what it calls itself. */
interface OwnCheckout {
	readonly identity: string;
	readonly root: string;
}

/** The checkouts a reader of one vault resolves identities in. */
interface CheckoutsRead {
	/** One checkout for each identity: the vault's own for its own identity, the chosen one for every other. */
	readonly checkouts: RegisteredRepoStatus[];
	/** The checkout that holds the vault, when it is in one and Git answered. */
	readonly own?: OwnCheckout;
}

/**
 * The checkout that holds a vault.
 * @param vault The vault directory.
 * @returns Its checkout, or undefined when the vault is in none or Git did not answer.
 */
function ownCheckoutOf(vault: string): OwnCheckout | undefined {
	try {
		return gitCheckoutOfVault(vault);
	} catch (error) {
		if (error instanceof GitCommandError) return undefined;
		throw error;
	}
}

/**
 * Whether a registered directory is the one at a canonical root.
 * @param registered The directory as registered.
 * @param root The canonical root.
 * @returns True when they are the same directory.
 */
function isRoot(registered: string, root: string): boolean {
	try {
		return fs.realpathSync.native(registered) === root;
	} catch {
		return false;
	}
}

/**
 * The checkouts a reader of one vault resolves identities in (ADR 0049).
 * @param vault The vault directory, or null for a reading that belongs to no vault (the
 * machine's settings), which sees the chosen checkouts alone.
 * @returns The chosen checkouts, with the vault's own checkout in place of its identity, and the
 * vault's own checkout.
 */
function checkoutsReadFrom(vault: string | null): CheckoutsRead {
	const { checkouts } = listRegistry();
	const chosen = checkouts.filter((entry) => entry.chosen);
	const own = vault === null ? undefined : ownCheckoutOf(vault);
	if (own === undefined) return { checkouts: chosen };
	// A registered entry for this directory keeps its language servers; one that nobody
	// registered has none.
	const registered = checkouts.find((entry) => isRoot(entry.root, own.root));
	const read: RegisteredRepoStatus = {
		source: "declared",
		addedAt: "",
		...registered,
		repo: own.identity,
		root: own.root,
		chosen: true,
		exists: true,
	};
	return {
		checkouts: [...chosen.filter((entry) => entry.repo !== own.identity), read],
		own: { identity: own.identity, root: own.root },
	};
}

export { checkoutOf, checkoutsReadFrom, chooseCheckout };

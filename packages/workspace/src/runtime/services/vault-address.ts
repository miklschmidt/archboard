// The vault one command addresses, found and registered as one act (ADR 0049).
//
// A command finds its vault the way git finds its repository (`findVault`). The
// first command in a checkout or an untracked vault that the registry does not
// know registers it, so the browser lists it. This module joins the two: the
// finder cannot import the registry, because the registry imports the finder.

import { declareIfUnknown, type Declared } from "#runtime/store/repo-registry.ts";
import {
	findVault,
	type FoundVault,
	type VaultNotFound,
	type VaultSearch,
} from "#runtime/services/vault-finder.ts";

/** What a command registered when it found a checkout or an untracked vault the registry did not know. */
type VaultRegistration =
	| {
			readonly kind: "checkout";
			/** The repository identity. */
			readonly repository: string;
			readonly root: string;
			/** Whether it became the chosen checkout of its identity. */
			readonly chosen: boolean;
			/** The worktrees that the checkout lists and that were registered with it. */
			readonly worktrees: string[];
			/** The untracked vault that took a new registry name, because the identity is its old one. */
			readonly renamed?: { readonly root: string; readonly from: string; readonly to: string };
	  }
	| {
			readonly kind: "untracked";
			/** The registry name the browser shows. */
			readonly name: string;
			readonly root: string;
	  };

/** A vault that a command found, and what its registration did. */
interface AddressedVault extends FoundVault {
	readonly ok: true;
	/** Present only when this search registered what holds the vault. */
	readonly registered?: VaultRegistration;
	/**
	 * Why the registry could not be written, when it could not. The command still
	 * has its vault, and the browser does not list it yet.
	 */
	readonly unregistered?: string;
}

/**
 * What a declaration registered, as a command names it.
 * @param declared What the registry recorded.
 * @returns The registration.
 */
function registrationOf(declared: Declared): VaultRegistration {
	return declared.kind === "checkout"
		? {
				kind: "checkout",
				repository: declared.checkout.repo,
				root: declared.checkout.root,
				chosen: declared.checkout.chosen,
				worktrees: declared.worktrees.map((each) => each.root),
				...(declared.renamed === undefined ? {} : { renamed: declared.renamed }),
			}
		: { kind: "untracked", name: declared.vault.name, root: declared.vault.root };
}

/**
 * Find the vault a command addresses (see `findVault`), and register the checkout
 * or untracked vault that holds it unless the registry knows it already. A
 * registry that cannot be written does not refuse: the answer says why.
 * @param search What the command was given, and where it runs.
 * @returns The vault and its registration, or why there is no vault.
 */
async function findAndRegisterVault(
	search: VaultSearch,
): Promise<AddressedVault | ({ readonly ok: false } & VaultNotFound)> {
	const finding = await findVault(search);
	if (!finding.ok) return finding;
	const { found } = finding;
	try {
		const declared = await declareIfUnknown(found.holder);
		return declared === undefined || !declared.added
			? { ok: true, ...found }
			: { ok: true, ...found, registered: registrationOf(declared) };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { ok: true, ...found, unregistered: reason };
	}
}

export { findAndRegisterVault, type AddressedVault, type VaultRegistration };

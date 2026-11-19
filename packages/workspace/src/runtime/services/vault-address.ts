// The vault one command addresses, found and registered as one act (ADR 0049).
//
// A command finds its vault the way git finds its repository (`locateVault`).
// The first command in a checkout or an untracked vault that the registry does
// not know registers it, so the browser lists it. This module joins the two: the
// finder cannot import the registry, because the registry imports the finder.

import { declareIfUnknown, type Declaration } from "#runtime/store/repo-registry.ts";
import {
	locateVault,
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
interface AddressedVault {
	readonly ok: true;
	readonly found: FoundVault;
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
function registrationOf(declared: Exclude<Declaration, { kind: "refused" }>): VaultRegistration {
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
 * Find the vault a command addresses (see `locateVault`), and register the checkout
 * or untracked vault that holds it unless the registry knows it already. A
 * registry that cannot be written, or a holder it refuses, does not refuse the
 * command: the answer says why.
 * @param search What the command was given, and where it runs.
 * @returns The vault and its registration, or why there is no vault.
 */
async function findAndRegisterVault(search: VaultSearch): Promise<VaultAddress> {
	const finding = await locateVault(search);
	if (!finding.ok) return finding;
	const { found } = finding;
	try {
		return { ok: true, found, ...registeredHolder(await declareIfUnknown(found.holder)) };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { ok: true, found, unregistered: reason };
	}
}

/**
 * What registering a vault's holder did, as the answer says it.
 * @param declared What the registry recorded, or why it refused, or undefined when it knew the holder.
 * @returns The registration, the refusal's reason, or nothing when nothing was added.
 */
function registeredHolder(
	declared: Declaration | undefined,
): Pick<AddressedVault, "registered" | "unregistered"> {
	if (declared === undefined) return {};
	if (declared.kind === "refused") return { unregistered: declared.message };
	return declared.added ? { registered: registrationOf(declared) } : {};
}

/** The vault a command addresses and what its registration did, or why there is no vault. */
type VaultAddress = AddressedVault | ({ readonly ok: false } & VaultNotFound);

/**
 * Find the vault a command addresses: from `-C` when it is given, else from the
 * working directory, the way git finds its repository (ADR 0049).
 * @param search What the command was given, and where it runs.
 * @param options Whether to register the checkout or untracked vault that holds
 * it, when the registry does not know it, as every command that addresses a vault does.
 * @param options.register Register what holds the vault.
 * @returns The vault and, when asked to register, what the registration did; or why there is no vault.
 */
async function findVault(
	search: VaultSearch,
	options: { readonly register?: boolean } = {},
): Promise<VaultAddress> {
	return options.register === true ? findAndRegisterVault(search) : locateVault(search);
}

export { findVault };

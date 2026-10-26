// The vault one invocation addresses (ADR 0049): found before anything starts
// or reaches a server, named on every server call after that, and named back in
// the answer. The first command in a checkout or an untracked vault that the
// registry does not know registers it, and that answer says so. In a checkout
// with no vault, the refusal names the known vaults whose boards bind its code
// (TASK-480).

import type { AnsweredVault, RegisteredVault } from "#cli/protocol/contract/schemas.ts";
import { stateInvocation } from "@archboard/server-lifecycle/server-client";
import { vaultsBoundTo } from "@archboard/board/store-read";
import { findAndRegisterVault } from "@archboard/workspace/vault";

/** Why a search found no vault, as the finder answers it. */
type VaultNotFound = Extract<Awaited<ReturnType<typeof findAndRegisterVault>>, { readonly ok: false }>;

/** A command found no vault; nothing was started and nothing was written. */
class VaultNotFoundError extends Error {
	readonly code: VaultNotFound["code"] = "VAULT_NOT_FOUND";
	/** The root of the Git checkout that holds no vault, when the search was in one. */
	readonly checkoutWithoutVault: string | undefined;

	/**
	 * A search that found no vault.
	 * @param finding - What the search found instead.
	 */
	constructor(finding: VaultNotFound) {
		super(finding.message);
		this.checkoutWithoutVault =
			finding.reason === "checkout-without-vault" ? finding.checkoutRoot : undefined;
	}
}

/**
 * The line that says a command registered what it found.
 * @param registration - The registration.
 * @returns The line.
 */
function registrationLine(registration: RegisteredVault): string {
	if (registration.kind === "untracked") {
		return `Registered the untracked vault in ${registration.root} as ${registration.name}.`;
	}
	const chosen = registration.chosen
		? `the chosen checkout of ${registration.repository}`
		: `a checkout of ${registration.repository}; another checkout stays chosen until \`archboard repo use ${registration.root}\``;
	const worktrees =
		registration.worktrees.length === 0
			? ""
			: `, with ${String(registration.worktrees.length)} of its worktrees`;
	const { renamed } = registration;
	const rename =
		renamed === undefined
			? ""
			: ` The untracked vault at ${renamed.root} is called "${renamed.to}" now, because "${renamed.from}" is the name of this repository.`;
	return `Registered ${registration.root} as ${chosen}${worktrees}.${rename}`;
}

/**
 * Find the vault this invocation addresses, register what holds it when the
 * registry does not know it, and make it the vault every later server call names.
 * @param directory - What `-C` named, or null when it was not given.
 * @returns The vault and how it was found, as the answer names it.
 * @throws {VaultNotFoundError} When there is no vault to address.
 */
async function addressVault(directory: string | null): Promise<AnsweredVault> {
	const vault = await foundAndRegistered({ directory, vaultsBoundTo });
	stateInvocation({ vault: vault.path });
	return vault;
}

/**
 * Find the vault of another directory than the one this invocation addresses,
 * as `-C` finds one, and register what holds it when the registry does not
 * know it: the vault a board moves to, for instance. Every server call still
 * names the vault this invocation addresses. Its refusal names no vault that
 * binds the directory's code, because a board moves into the directory's own vault.
 * @param directory - The directory, relative to the working directory or absolute.
 * @param option - The option that named it, which a refusal names back, such as `--to`.
 * @returns The vault, as an answer names it.
 * @throws {VaultNotFoundError} When the directory has no vault.
 */
async function findVaultOf(directory: string, option: string): Promise<AnsweredVault> {
	return foundAndRegistered({ directory, option });
}

/**
 * Find a vault, and register what holds it when the registry does not know it.
 * A registry that cannot be written is a warning: the command still has its vault.
 * @param search - What named the directory, or null when nothing did.
 * @returns The vault and how it was found, as the answer names it.
 * @throws {VaultNotFoundError} When there is no vault to address.
 */
async function foundAndRegistered(
	search: Omit<Parameters<typeof findAndRegisterVault>[0], "cwd">,
): Promise<AnsweredVault> {
	const vault = await findAndRegisterVault({ ...search, cwd: process.cwd() });
	if (!vault.ok) {
		throw new VaultNotFoundError(vault);
	}
	const { registered, unregistered } = vault;
	if (registered !== undefined) {
		process.stderr.write(`${registrationLine(registered)}\n`);
	}
	if (unregistered !== undefined) {
		process.stderr.write(
			`Warning: ${vault.holder} could not be registered, so the browser does not list it yet. ${unregistered}\n`,
		);
	}
	return {
		path: vault.path,
		origin: vault.origin,
		...(registered === undefined ? {} : { registered }),
	};
}

export { VaultNotFoundError, addressVault, findVaultOf };

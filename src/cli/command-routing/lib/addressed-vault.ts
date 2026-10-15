// The vault one invocation addresses (ADR 0049): found before anything starts
// or reaches a server, named on every server call after that, and named back in
// the answer. The first command in a checkout or an untracked vault that the
// registry does not know registers it, and that answer says so.

import type { AnsweredVault, RegisteredVault } from "@/cli/command-contract/schemas";
import { ARCHBOARD_VAULT } from "@/runtime/engine/config";
import { declareIfUnknown, type Declared } from "@/runtime/engine/repo-registry";
import { announceRegistryChange, setRequestedVault } from "@/runtime/engine/server-client";
import { findVault, type FoundVault, type VaultNotFound } from "@/runtime/engine/vault-finder";

/** A command found no vault; nothing was started and nothing was written. */
class VaultNotFoundError extends Error {
	readonly code: VaultNotFound["code"] = "VAULT_NOT_FOUND";
}

/**
 * What a declaration registered, as the answer names it.
 * @param declared - What the registry recorded.
 * @returns The registration.
 */
function registrationOf(declared: Declared): RegisteredVault {
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
 * Say that a command registered what it found, and tell a running server, so
 * that every tab lists the new entry at once.
 * @param registration - The registration.
 */
async function announceRegistration(registration: RegisteredVault): Promise<void> {
	process.stderr.write(`${registrationLine(registration)}\n`);
	const warning = await announceRegistryChange();
	if (warning !== undefined) process.stderr.write(`${warning}\n`);
}

/**
 * Register the checkout or untracked vault a command found, unless the
 * registry knows it already. A vault the environment names is used as it is
 * and never registers. A registry that cannot be written is a warning: the
 * command still has its vault.
 * @param found - The vault the command found.
 * @returns What was registered, or undefined when nothing was.
 */
async function register(found: FoundVault): Promise<RegisteredVault | undefined> {
	if (found.holder === null) return undefined;
	try {
		const declared = await declareIfUnknown(found.holder);
		if (declared === undefined || !declared.added) return undefined;
		const answer = registrationOf(declared);
		await announceRegistration(answer);
		return answer;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`Warning: ${found.holder} could not be registered, so the browser does not list it yet. ${reason}\n`,
		);
		return undefined;
	}
}

/**
 * Find the vault this invocation addresses, register what holds it when the
 * registry does not know it, and make it the vault every later server call names.
 * @param directory - What `-C` named, or null when it was not given.
 * @returns The vault and how it was found, as the answer names it.
 * @throws {VaultNotFoundError} When there is no vault to address.
 */
async function addressVault(directory: string | null): Promise<AnsweredVault> {
	const finding = await findVault({ directory, environment: ARCHBOARD_VAULT, cwd: process.cwd() });
	if (!finding.ok) {
		throw new VaultNotFoundError(finding.message);
	}
	const { found } = finding;
	setRequestedVault(found.path);
	const answer = await register(found);
	return {
		path: found.path,
		origin: found.origin,
		...(answer === undefined ? {} : { registered: answer }),
	};
}

export { VaultNotFoundError, addressVault };

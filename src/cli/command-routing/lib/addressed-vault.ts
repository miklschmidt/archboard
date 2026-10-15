// The vault one invocation addresses (ADR 0049): found before anything starts
// or reaches a server, named on every server call after that, and named back in
// the answer.

import type { AnsweredVault } from "@/cli/command-contract/schemas";
import { ARCHBOARD_VAULT } from "@/runtime/engine/config";
import { setRequestedVault } from "@/runtime/engine/server-client";
import { findVault, type VaultNotFound } from "@/runtime/engine/vault-finder";

/** A command found no vault; nothing was started and nothing was written. */
class VaultNotFoundError extends Error {
	readonly code: VaultNotFound["code"] = "VAULT_NOT_FOUND";
}

/**
 * Find the vault this invocation addresses and make it the one every later
 * server call names.
 * @param directory - What `-C` named, or null when it was not given.
 * @returns The vault and how it was found, as the answer names it.
 * @throws {VaultNotFoundError} When there is no vault to address.
 */
async function addressVault(directory: string | null): Promise<AnsweredVault> {
	const finding = await findVault({ directory, environment: ARCHBOARD_VAULT, cwd: process.cwd() });
	if (!finding.ok) {
		throw new VaultNotFoundError(finding.message);
	}
	setRequestedVault(finding.found.path);
	return { path: finding.found.path, origin: finding.found.origin };
}

export { VaultNotFoundError, addressVault };

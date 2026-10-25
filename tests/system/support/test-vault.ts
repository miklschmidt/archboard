// Where a system test keeps its vault: `<holder>/.archboard/vault`, the layout
// a command finds its vault in (ADR 0049). A test addresses its vault by
// running the CLI in the holder, and a server lists it through a registry of
// the test's own, never through the environment.

import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";

import { VAULT_DIRECTORY } from "@archboard/workspace/vault";

/**
 * Make the vault of a directory.
 * @param holder The directory that holds the vault.
 * @returns The vault, `<holder>/.archboard/vault`.
 */
function vaultIn(holder: string): string {
	const vault = join(holder, VAULT_DIRECTORY);
	mkdirSync(vault, { recursive: true });
	return vault;
}

/**
 * The directory whose vault this is.
 * @param vault A vault in the `<holder>/.archboard/vault` layout.
 * @returns The holder.
 * @throws {Error} When the vault is not in that layout, so no command could find it.
 */
function holderOf(vault: string): string {
	if (!vault.endsWith(`${sep}${VAULT_DIRECTORY}`)) {
		throw new Error(
			`${vault} is not in the <dir>/${VAULT_DIRECTORY} layout, so no command finds it. Make it with vaultIn(<dir>).`,
		);
	}
	return dirname(dirname(vault));
}

/**
 * Write a registry that lists one vault, as the untracked vault of its holder,
 * so a server that reads the registry opens its page in that vault.
 * @param registry The registry file.
 * @param vault The vault, which must exist.
 * @returns The registry file.
 */
function listOnlyVault(registry: string, vault: string): string {
	const root = realpathSync.native(holderOf(vault));
	const entries = [
		{ name: basename(root), root, addedAt: new Date().toISOString() },
	];
	mkdirSync(dirname(registry), { recursive: true });
	writeFileSync(registry, `${JSON.stringify(entries, null, 2)}\n`);
	return registry;
}

export { holderOf, listOnlyVault, vaultIn };

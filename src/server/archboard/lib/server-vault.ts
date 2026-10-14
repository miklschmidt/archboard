// The one place the Archboard server learns which vault it was started with.
//
// A call to the server names its own vault (ADR 0049, `request-vault.ts`), and
// every board route reads the vault from the call. What is left here is the
// vault the server starts with, `ARCHBOARD_VAULT`, which three things still
// need until the server starts without one: the refusal to start with none, the
// vault the browser is told to name until it has a navigator of its own, and
// the vault the Codex workbench works in.

import { ARCHBOARD_VAULT, noVaultMessage } from "@/runtime/engine/config";
import { canonicalConfiguredVault } from "@/server/archboard/lib/request-vault";

/**
 * The vault this server was started with.
 * @returns The absolute, canonical vault path.
 * @throws {Error} When the server has no vault. A server refuses to start
 *   without one, so this is the backstop for anything that gets past that.
 */
function serverVault(): string {
	if (!ARCHBOARD_VAULT) {
		throw new Error(noVaultMessage());
	}
	return canonicalConfiguredVault(ARCHBOARD_VAULT);
}

export { serverVault };

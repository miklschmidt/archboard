// The one place the Archboard server learns which vault it serves.
//
// The server serves one vault, the one `ARCHBOARD_VAULT` names when it starts
// (ADR 0015). Everything below a route takes its vault as an argument, so this
// is the only reader of that default, and a call that names its own vault
// replaces it here without touching the store, the lock or the code check
// (ADR 0049).

import path from "node:path";
import { ARCHBOARD_VAULT, noVaultMessage } from "@/runtime/engine/config";

/**
 * The vault this server serves.
 * @returns The absolute vault path.
 * @throws {Error} When the server has no vault. A server refuses to start
 *   without one, so this is the backstop for anything that gets past that.
 */
function serverVault(): string {
	if (!ARCHBOARD_VAULT) {
		throw new Error(noVaultMessage());
	}
	return path.resolve(ARCHBOARD_VAULT);
}

export { serverVault };

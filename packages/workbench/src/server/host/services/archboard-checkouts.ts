import fs from "node:fs";
import path from "node:path";
import { checkoutOfVault, isVaultLayout, VAULT_DIRECTORY } from "@archboard/workspace/vault";

/**
 * Whether a path is a directory now.
 * @param candidate The path.
 * @returns True when it is one.
 */
function isDirectory(candidate: string): boolean {
	try {
		return fs.statSync(candidate).isDirectory();
	} catch {
		return false;
	}
}

/**
 * The checkout a path names: the real path of a directory that holds a vault, or of the
 * directory that holds the vault the path is.
 * @param named The path, as a caller spells it.
 * @returns The checkout, or null when the path names none.
 */
function checkoutNamedBy(named: string): string | null {
	if (!path.isAbsolute(named)) {
		return null;
	}
	let real: string;
	try {
		real = fs.realpathSync.native(named);
	} catch {
		return null;
	}
	// A directory names the checkout of the vault it holds, as the server serves that vault: through
	// a link, the vault's own real path decides, so a pane in it and a call naming it agree.
	const held = path.join(real, VAULT_DIRECTORY);
	const vault = isDirectory(held) ? fs.realpathSync.native(held) : real;
	return isVaultLayout(vault) && isDirectory(vault) ? checkoutOfVault(vault) : null;
}

export { checkoutNamedBy };

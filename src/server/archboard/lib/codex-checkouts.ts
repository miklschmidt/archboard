// Which checkout a workhorse works in (ADR 0050).
//
// A workhorse works in the directory that holds its vault: a checkout root, or the holder of an
// untracked vault. A pane names its checkout through the vault it is in. The coordinator names one
// in each workhorse tool call, as a path, and the path means the checkout only when it is a
// directory that holds a vault, or a vault itself. Both are spelled as real paths, so a checkout
// reached through a link is the same checkout.

import fs from "node:fs";
import path from "node:path";
import type { DynamicServerRequest } from "@archboard/codex-app-server/transport";
import { checkoutOfVault, isVaultLayout, VAULT_DIRECTORY } from "@archboard/workspace/vault-finder";
import type { CodexWorkbenchWorkhorseActions } from "@/server/archboard/lib/codex-workbench-session-workhorses";

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

/**
 * The workhorse of the checkout a coordinator call names, among a tab session's workhorses.
 * @param workhorses The tab session's workhorses.
 * @param named The checkout as the call names it.
 * @returns The workhorse, or null when the tab has none in that checkout.
 */
function workhorseOfCheckout<Workhorse extends { readonly checkout: string }>(
	workhorses: readonly Workhorse[],
	named: string,
): Workhorse | null {
	const checkout = checkoutNamedBy(named) ?? named;
	return workhorses.find((workhorse) => workhorse.checkout === checkout) ?? null;
}

/**
 * The checkout a coordinator call gives work to, when it is a delegation naming one: the
 * delegation starts that checkout's workhorse when there is none (ADR 0050).
 * @param request The coordinator tool call.
 * @returns The checkout, or null when the call delegates nothing to a checkout.
 */
function delegatedCheckout(request: Pick<DynamicServerRequest, "params">): string | null {
	const { namespace, tool } = request.params;
	if (namespace !== "archboard_workhorse" || tool !== "delegate_to_workhorse") {
		return null;
	}
	return checkoutArgument(request.params.arguments);
}

/**
 * The checkout a tool call's arguments name.
 * @param args The arguments.
 * @returns The canonical checkout, or null when they name none that holds a vault.
 */
function checkoutArgument(args: unknown): string | null {
	if (typeof args !== "object" || args === null || !("checkout" in args)) {
		return null;
	}
	return typeof args.checkout === "string" ? checkoutNamedBy(args.checkout) : null;
}

/**
 * Give a delegation somewhere to go: start the workhorse of the checkout it names when that
 * workhorse has no thread that can run turns. A start that fails, or a workhorse that cannot be
 * built because the tab has gone, leaves the delegation to say the checkout has no workhorse, so
 * the coordinator's turn is always answered.
 * @param request The coordinator tool call.
 * @param workhorseOf The tab's workhorse of a checkout, built on first use.
 * @returns Resolves once the workhorse can run turns, or its start failed, or the call is no
 * delegation to a checkout.
 */
async function readyDelegatedWorkhorse(
	request: Pick<DynamicServerRequest, "params">,
	workhorseOf: (checkout: string) => {
		readonly actions: Pick<CodexWorkbenchWorkhorseActions, "ensureStarted">;
	},
): Promise<void> {
	const checkout = delegatedCheckout(request);
	if (checkout === null) {
		return;
	}
	try {
		await workhorseOf(checkout).actions.ensureStarted();
	} catch {
		// The delegation itself refuses a checkout with no workhorse that can run turns.
	}
}

export { checkoutNamedBy, readyDelegatedWorkhorse, workhorseOfCheckout };

// Which checkout a workhorse works in (ADR 0050).
//
// A workhorse works in the directory that holds its vault: a checkout root, or the holder of an
// untracked vault. A pane names its checkout through the vault it is in. The coordinator names one
// in each workhorse tool call, as a path, and the path means the checkout only when it is a
// directory that holds a vault, or a vault itself. Both are spelled as real paths, so a checkout
// reached through a link is the same checkout.

import fs from "node:fs";
import path from "node:path";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import { checkoutOfVault, VAULT_DIRECTORY } from "@/runtime/engine/vault-finder";

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
	if (isDirectory(path.join(real, VAULT_DIRECTORY))) {
		return real;
	}
	const holder = checkoutOfVault(real);
	return holder !== real && isDirectory(real) ? holder : null;
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

export { checkoutNamedBy, delegatedCheckout, workhorseOfCheckout };

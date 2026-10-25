// Which checkout a workhorse works in (ADR 0050).
//
// A workhorse works in the directory that holds its vault: a checkout root, or the holder of an
// untracked vault. A pane names its checkout through the vault it is in. The coordinator names one
// in each workhorse tool call, as a path, and the path means the checkout only when it is a
// directory that holds a vault, or a vault itself. Both are spelled as real paths, so a checkout
// reached through a link is the same checkout.

import type { DynamicServerRequest } from "@archboard/codex-app-server/transport";
import type { CodexWorkbenchWorkhorseActions } from "#server/services/sessions/workhorses.ts";

/**
 * The workhorse of the checkout a coordinator call names, among a tab session's workhorses.
 * @param workhorses The tab session's workhorses.
 * @param named The checkout as the call names it.
 * @returns The workhorse, or null when the tab has none in that checkout.
 * @param resolveCheckout The host policy for this operation.
 */
function workhorseOfCheckout<Workhorse extends { readonly checkout: string }>(
	workhorses: readonly Workhorse[],
	named: string,
	resolveCheckout: (named: string) => string | null,
): Workhorse | null {
	const checkout = resolveCheckout(named);
	if (checkout === null) return null;
	return workhorses.find((workhorse) => workhorse.checkout === checkout) ?? null;
}

/**
 * The checkout a coordinator call gives work to, when it is a delegation naming one: the
 * delegation starts that checkout's workhorse when there is none (ADR 0050).
 * @param request The coordinator tool call.
 * @param resolveCheckout The host checkout admission policy.
 * @returns The checkout, or null when the call delegates nothing to a checkout.
 */
function delegatedCheckout(
	request: Pick<DynamicServerRequest, "params">,
	resolveCheckout: (named: string) => string | null,
): string | null {
	const { namespace, tool } = request.params;
	if (namespace !== "archboard_workhorse" || tool !== "delegate_to_workhorse") {
		return null;
	}
	return checkoutArgument(request.params.arguments, resolveCheckout);
}

/**
 * The checkout a tool call's arguments name.
 * @param args The arguments.
 * @returns The canonical checkout, or null when they name none that holds a vault.
 * @param resolveCheckout The host policy for this operation.
 */
function checkoutArgument(
	args: unknown,
	resolveCheckout: (named: string) => string | null,
): string | null {
	if (typeof args !== "object" || args === null || !("checkout" in args)) {
		return null;
	}
	return typeof args.checkout === "string" ? resolveCheckout(args.checkout) : null;
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
 * @param resolveCheckout The host policy for this operation.
 */
async function readyDelegatedWorkhorse(
	request: Pick<DynamicServerRequest, "params">,
	workhorseOf: (checkout: string) => {
		readonly actions: Pick<CodexWorkbenchWorkhorseActions, "ensureStarted">;
	},
	resolveCheckout: (named: string) => string | null,
): Promise<void> {
	const checkout = delegatedCheckout(request, resolveCheckout);
	if (checkout === null) {
		return;
	}
	try {
		await workhorseOf(checkout).actions.ensureStarted();
	} catch {
		// The delegation itself refuses a checkout with no workhorse that can run turns.
	}
}

export { readyDelegatedWorkhorse, workhorseOfCheckout };

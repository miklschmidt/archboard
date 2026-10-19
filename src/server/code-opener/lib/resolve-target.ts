import type { CodeBinding } from "@archboard/code-binding/bindings";
import {
	resolveLocalCodeTarget,
	snapshotCheckoutAccess,
	type LocalCodeTargetResult,
} from "@archboard/code-binding/resolution";

/**
 * Resolves a binding against a fresh checkout snapshot limited to that binding.
 * The checkout that holds the vault stands for its own repository, and the
 * chosen checkout for any other (ADR 0049).
 * @param vault The vault the binding was read from.
 * @param binding The code binding to resolve.
 * @param signal Cancels the snapshot when the request is abandoned.
 * @returns The local code target, or why it could not be resolved.
 */
async function resolveInVault(
	vault: string,
	binding: CodeBinding,
	signal?: AbortSignal,
): Promise<LocalCodeTargetResult> {
	return resolveLocalCodeTarget(
		binding,
		await snapshotCheckoutAccess({ vault, ...(signal ? { signal } : {}), bindings: [binding] }),
	);
}

export { resolveInVault };

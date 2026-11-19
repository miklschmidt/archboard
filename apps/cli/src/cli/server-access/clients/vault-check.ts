import { readModelReply } from "@archboard/model-contract";
import { requestJson } from "@archboard/server-lifecycle/server-client";
/**
 * Read canonical coherence and vocabulary diagnostics.
 * @param signal The invocation cancellation signal.
 * @param state The draft to check instead of the current architecture.
 * @returns The canonical vault diagnostics.
 * @throws {Error} When the server's answer is not a vault check.
 */
async function checkSemanticVaultOnServer(signal?: AbortSignal, state?: string) {
	const query = state === undefined ? "" : `?${new URLSearchParams({ state })}`;
	const check = readModelReply(
		"checkVault",
		await requestJson<unknown>(
			`/api/vault/check${query}`,
			signal === undefined ? undefined : { signal },
		),
	);
	if (!check.success) throw check.error;
	return check.data;
}
export { checkSemanticVaultOnServer };

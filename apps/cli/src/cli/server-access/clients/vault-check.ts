import { VaultCheckSchema } from "@archboard/model/policy";
import { requestJson } from "@archboard/server-lifecycle/server-client";
/**
 * Read canonical coherence and vocabulary diagnostics.
 * @param signal The invocation cancellation signal.
 * @param state The draft to check instead of the current architecture.
 * @returns The canonical vault diagnostics.
 */
async function checkSemanticVaultOnServer(signal?: AbortSignal, state?: string) {
	const query = state === undefined ? "" : `?${new URLSearchParams({ state })}`;
	return VaultCheckSchema.parse(
		await requestJson<unknown>(
			`/api/vault/check${query}`,
			signal === undefined ? undefined : { signal },
		),
	);
}
export { checkSemanticVaultOnServer };

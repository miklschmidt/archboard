import {VaultCheckSchema} from "@archboard/board/policy";
import {requestJson} from "@archboard/server-lifecycle/server-client";
/**
 * Read canonical coherence and vocabulary diagnostics.
 * @param signal The invocation cancellation signal.
 * @returns The canonical vault diagnostics.
 */
async function checkSemanticVaultOnServer(signal?:AbortSignal){return VaultCheckSchema.parse(await requestJson<unknown>("/api/vault/check",signal===undefined?undefined:{signal}));}
export {checkSemanticVaultOnServer};

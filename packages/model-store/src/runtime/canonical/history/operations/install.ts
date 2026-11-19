import type { ModelRequestInput } from "@archboard/model-contract";
import { requireRequest } from "#runtime/store/documents.ts";
import { initializeModel } from "#runtime/canonical/history/operations/initialize-model.ts";
import { installPortable } from "#runtime/canonical/history/operations/portable.ts";

/**
 * Install a model into a vault through the signed installer: initialize an empty canonical
 * planning model, or import a portable one with its history. A request that carries a bundle is
 * an import.
 * @param vault The destination vault.
 * @param request The stable initialization intent, or the portable request.
 * @returns The durable installation receipt or explicit refusal.
 */
async function installArchitectureModel(
	vault: string,
	request: ModelRequestInput<"initialize"> | ModelRequestInput<"import">,
) {
	return "bundle" in request
		? installPortable(vault, request)
		: initializeModel(vault, requireRequest("initialize", request));
}

export { installArchitectureModel };

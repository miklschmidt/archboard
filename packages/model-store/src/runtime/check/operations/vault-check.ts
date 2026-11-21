import { readArchitectureModel } from "#runtime/canonical/read/operations/model-read.ts";
import { structureDiagnostics } from "#runtime/check/operations/structure.ts";
import { readVaultConfiguration } from "#runtime/store/configuration.ts";

/**
 * Check a vault: whether its configuration is valid and which policy applies, and what the
 * canonical model says about itself. A model that cannot be read answers its refusal as errors.
 * @param vault The explicitly addressed vault.
 * @param state The draft state to check instead of the current architecture.
 * @returns The configuration, its fingerprint and the diagnostics.
 */
async function checkArchitectureVault(vault: string, state?: string) {
	const model =
		state === undefined || state === ""
			? readArchitectureModel(vault)
			: await readArchitectureModel(vault, undefined, undefined, { state });
	const policy = readVaultConfiguration(vault);
	const diagnostics = model.success
		? structureDiagnostics(model)
		: model.diagnostics.map((item) => ({ ...item, severity: "error" as const }));
	return {
		success: true as const,
		configurationFile: policy.file,
		configurationValid: policy.ok,
		policy: policy.configuration,
		fingerprint: policy.fingerprint,
		diagnostics,
	};
}

export { checkArchitectureVault };

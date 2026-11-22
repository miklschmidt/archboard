import type { Express } from "express";
import { readArchitectureModel } from "@archboard/model/store-read";
import { queryString, requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { readVaultConfiguration, structureDiagnostics } from "@archboard/model/vault-policy";
/**
 * Read canonical diagnostics, structure warnings and vocabulary without interpreting legacy boards
 * as live content. A `state` names the draft to check instead of the current architecture. A vault
 * in the old format warns once that it is read-only until it is upgraded.
 * @param app The server application.
 */
function mountArchitectureConfigurationRoutes(app: Express) {
	app.get("/api/vault/check", requireVault, async (req, res) => {
		const vault = vaultOfRequest(req);
		const state = queryString(req, "state")?.trim();
		const model =
			state === undefined || state === ""
				? readArchitectureModel(vault)
				: await readArchitectureModel(vault, undefined, undefined, { state });
		const policy = readVaultConfiguration(vault);
		// A vault in the old format reads, so its one diagnostic warns: the upgrade clears it.
		const upgrade =
			model.success && model.readOnly !== undefined
				? [
						{
							severity: "warning" as const,
							code: model.readOnly.code,
							file: model.readOnly.file,
							message: `${model.readOnly.message} ${model.readOnly.recovery}`,
						},
					]
				: [];
		const diagnostics = model.success
			? [...upgrade, ...structureDiagnostics(model)]
			: model.diagnostics.map((item) => ({ ...item, severity: "error" as const }));
		res.json({
			success: true,
			configurationFile: policy.file,
			configurationValid: policy.ok,
			policy: policy.configuration,
			fingerprint: policy.fingerprint,
			diagnostics,
		});
	});
}
export { mountArchitectureConfigurationRoutes };

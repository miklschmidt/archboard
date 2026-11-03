import type { Express } from "express";
import { readArchitectureModel } from "@archboard/model/store-read";
import { queryString, requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { readVaultConfiguration, structureDiagnostics } from "@archboard/model/vault-policy";
/**
 * Read canonical diagnostics, structure warnings and vocabulary without interpreting legacy boards
 * as live content. A `state` names the draft to check instead of the current architecture.
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
		const diagnostics = model.success
			? structureDiagnostics(model)
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

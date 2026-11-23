import type { Express } from "express";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import { readArchitectureModel } from "@archboard/model/store-read";
import { queryString, requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { readVaultConfiguration, structureDiagnostics } from "@archboard/model/vault-policy";

/** Why a vault opens read-only, as a successful reading says. */
type ReadOnly = Extract<ArchitectureModelRead, { success: true }>["readOnly"];
/**
 * The one warning of a vault in the old format. It reads, so the diagnostic warns: the upgrade
 * clears it.
 * @param readOnly Why the vault is read-only, if it is.
 * @returns The warning, or none.
 */
function upgradeWarning(readOnly: ReadOnly) {
	if (readOnly === undefined) return [];
	const { code, file, message, recovery } = readOnly;
	return [{ severity: "warning" as const, code, file, message: `${message} ${recovery}` }];
}
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
		const diagnostics = model.success
			? [...upgradeWarning(model.readOnly), ...structureDiagnostics(model)]
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

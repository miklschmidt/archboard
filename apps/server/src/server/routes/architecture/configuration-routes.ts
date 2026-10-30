import type { Express } from "express";
import { readArchitectureModel } from "@archboard/board/store-read";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import {
	readSemanticBoardConfiguration,
	structureDiagnostics,
} from "@archboard/board/vault-policy";
/**
 * Read canonical diagnostics, structure warnings and vocabulary without interpreting legacy boards
 * as live content.
 * @param app The server application.
 */
function mountArchitectureConfigurationRoutes(app: Express) {
	app.get("/api/vault/check", requireVault, (req, res) => {
		const vault = vaultOfRequest(req);
		const model = readArchitectureModel(vault);
		const policy = readSemanticBoardConfiguration(vault);
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

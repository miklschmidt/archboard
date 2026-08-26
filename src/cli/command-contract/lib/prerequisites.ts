import { getHealth } from "../../../runtime/engine/canvas-client.js";
import { EXPRESS_SERVER_URL } from "../../../runtime/engine/config.js";
import { ensureCanvasRunning } from "../../../runtime/engine/spawn.js";
import type { Prerequisite } from "../contract.js";

export interface PrerequisiteResolver {
	require(prerequisite: Prerequisite, description: string): Promise<void>;
}

export const productionPrerequisites: PrerequisiteResolver = {
	async require(prerequisite, description) {
		if (prerequisite === "server") {
			await ensureCanvasRunning();
			return;
		}
		const health = await getHealth();
		if (health.websocket_clients === 0) {
			const error = new Error(
				`${description} requires the canvas to be open in a browser. Open ${EXPRESS_SERVER_URL} and retry.`,
			);
			(error as Error & { code?: string }).code = "BROWSER_REQUIRED";
			throw error;
		}
	},
};

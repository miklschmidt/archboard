import { getHealth } from "@/runtime/engine/canvas-client";
import { EXPRESS_SERVER_URL } from "@/runtime/engine/config";
import { ensureCanvasRunning } from "@/runtime/engine/spawn";
import type { RuntimePrerequisite } from "@/cli/command-contract/contract";

/**
 * Makes sure what a command needs is actually there: the canvas server, which
 * is started when it is not running, and an open browser pane, which only a
 * person can provide and is therefore refused rather than arranged.
 * @param prerequisite - What the command needs.
 * @param description - What the command is doing, for the refusal message.
 * @throws {Error} With code BROWSER_REQUIRED when no pane is rendering the canvas.
 */
export async function requirePrerequisite(
	prerequisite: RuntimePrerequisite,
	description: string,
): Promise<void> {
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
}

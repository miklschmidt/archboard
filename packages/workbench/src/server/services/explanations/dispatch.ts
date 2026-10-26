import type { z } from "zod";
import {
	ExplanationActionRequestSchema,
	ExplanationActionResultSchema,
} from "#shared/schemas/architecture-explanation.ts";
import { errorMessage } from "@archboard/diagnostics/errno";

type Dispatch = (
	vault: string,
	input: z.infer<typeof ExplanationActionRequestSchema>,
) => Promise<z.infer<typeof ExplanationActionResultSchema>>;
let installed: Dispatch | null = null;
let onNotification: NonNullable<
	import("#runtime/protocol/voice/extension.ts").CodexWorkbenchDomain["onNotification"]
> | null = null;

/**
 * Install the action on the existing local agent generation.
 * @param actions The generation's actions and notification receiver.
 * @returns Its cleanup.
 */
function installExplanationActions(
	actions: ReturnType<
		typeof import("#server/services/explanations/actions.ts").createExplanationActions
	>,
) {
	const dispatch = actions.dispatch;
	installed = dispatch;
	onNotification = actions.onNotification;
	return () => {
		if (installed === dispatch) {
			installed = null;
			onNotification = null;
		}
	};
}
/**
 * Send all explanation entry points through one local action.
 * @param vault The explicitly addressed actual vault.
 * @param input The invocation, read, retry, or cancellation.
 * @returns The shared result.
 */
async function explainArchitecture(
	vault: string,
	input: z.input<typeof ExplanationActionRequestSchema>,
): Promise<z.infer<typeof ExplanationActionResultSchema>> {
	const parsed = ExplanationActionRequestSchema.safeParse(input);
	if (!parsed.success)
		return {
			success: false,
			code: "INVALID_REQUEST",
			error: "Use a complete explanation request and its tab session.",
		};
	if (installed === null)
		return {
			success: false,
			code: "AGENT_UNAVAILABLE",
			error: "The local agent is unavailable. Connect it and retry.",
		};
	try {
		return await installed(vault, parsed.data);
	} catch (error) {
		return { success: false, code: "AGENT_UNAVAILABLE", error: errorMessage(error) };
	}
}
/**
 * Forward an admitted provider event to the installed explanation owner.
 * @param event The existing domain notification.
 * @returns Nothing after the installed owner receives it.
 */
const notifyExplanation: NonNullable<
	import("#runtime/protocol/voice/extension.ts").CodexWorkbenchDomain["onNotification"]
> = (event) => onNotification?.(event);
export { installExplanationActions, explainArchitecture, notifyExplanation };

import type {
	SemanticAgentSwitch,
	SemanticUserChange,
} from "#runtime/schemas/semantic-context-types.ts";
import type { BrowserConnectionInstance } from "@archboard/agent-workbench/server";
import type { TabSessionId } from "@archboard/agent-workbench/server";

/** The browser-facing hooks the installed Codex workbench gateway provides, null while none is installed. */
interface CodexWiring {
	codex: {
		publishPaneContext:
			| ((
					clientId: string,
					kind: "focus" | "selection",
					userChanged: readonly SemanticUserChange[],
					agentSwitch?: SemanticAgentSwitch,
			  ) => void)
			| null;
		acceptBrowser: ((instance: BrowserConnectionInstance, browserId: string) => void) | null;
		closeBrowser:
			| ((instance: BrowserConnectionInstance, browserId: string) => Promise<void>)
			| null;
		drainBrowsers: (() => Promise<void>) | null;
		handleBrowserMessage:
			| ((
					instance: BrowserConnectionInstance,
					browserId: string,
					input: unknown,
					send: (message: unknown) => Promise<void>,
			  ) => Promise<void>)
			| null;
		/** The checkouts of a tab session's live workhorses, which the dock lists. */
		liveWorkhorseCheckouts: ((tabSessionId: TabSessionId) => readonly string[]) | null;
	};
}

const codexWiring: CodexWiring = {
	codex: {
		publishPaneContext: null,
		acceptBrowser: null,
		closeBrowser: null,
		drainBrowsers: null,
		handleBrowserMessage: null,
		liveWorkhorseCheckouts: null,
	},
};

/** Forget every browser callback the workbench installed. */
function resetCodexWorkbenchWiring(): void {
	codexWiring.codex.publishPaneContext = null;
	codexWiring.codex.acceptBrowser = null;
	codexWiring.codex.closeBrowser = null;
	codexWiring.codex.drainBrowsers = null;
	codexWiring.codex.handleBrowserMessage = null;
	codexWiring.codex.liveWorkhorseCheckouts = null;
}

/**
 * Publish pane context through the currently installed workbench, when present.
 * @param clientId The pane that changed.
 * @param kind Whether focus or selection changed.
 * @param userChanged What of it the user changed by hand (ADR 0034). Nothing unless the caller
 * knows otherwise, and what nobody marked is told to nobody.
 * @param agentSwitch What an agent's `browser show` moved, which is news of its own (TASK-293.06).
 */
function publishPaneContext(
	clientId: string,
	kind: "focus" | "selection",
	userChanged: readonly SemanticUserChange[] = [],
	agentSwitch?: SemanticAgentSwitch,
): void {
	codexWiring.codex.publishPaneContext?.(clientId, kind, userChanged, agentSwitch);
}

export { codexWiring, publishPaneContext, resetCodexWorkbenchWiring };

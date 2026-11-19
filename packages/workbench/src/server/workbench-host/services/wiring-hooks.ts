import type { BrowserConnectionInstance } from "#runtime/voice/protocol/extension.ts";
import type {
	SemanticAgentSwitch,
	SemanticUserChange,
} from "#runtime/schemas/semantic-context-types.ts";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";

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

/**
 * Hand a freshly admitted browser connection to the installed workbench, when one is installed.
 * @param instance The browser connection's instance.
 * @param browserId The pane's client id.
 */
function acceptCodexBrowser(instance: BrowserConnectionInstance, browserId: string): void {
	codexWiring.codex.acceptBrowser?.(instance, browserId);
}

/**
 * Tell the installed workbench that a browser connection has gone.
 * @param instance The browser connection's instance.
 * @param browserId The pane's client id.
 * @returns Resolves once the workbench has cleaned up after it; at once when none is installed.
 */
function closeCodexBrowser(instance: BrowserConnectionInstance, browserId: string): Promise<void> {
	return codexWiring.codex.closeBrowser?.(instance, browserId) ?? Promise.resolve();
}

/**
 * Wait for the installed workbench to finish with every browser connection it holds.
 * @returns Resolves once it has; at once when none is installed.
 */
function drainCodexBrowsers(): Promise<void> {
	return codexWiring.codex.drainBrowsers?.() ?? Promise.resolve();
}

/**
 * Give one browser message to the installed workbench.
 * @param instance The browser connection's instance.
 * @param browserId The pane's client id.
 * @param input The message as it arrived.
 * @param send Sends the answer back over that connection.
 * @returns The handling, or null while no workbench is installed.
 */
function handleCodexBrowserMessage(
	instance: BrowserConnectionInstance,
	browserId: string,
	input: unknown,
	send: (message: unknown) => Promise<void>,
): Promise<void> | null {
	return codexWiring.codex.handleBrowserMessage?.(instance, browserId, input, send) ?? null;
}

/**
 * The checkouts of a tab session's live workhorses, which the dock lists.
 * @param tabSessionId The tab session.
 * @returns The checkouts; none while no workbench is installed.
 */
function liveWorkhorseCheckouts(tabSessionId: TabSessionId): readonly string[] {
	return codexWiring.codex.liveWorkhorseCheckouts?.(tabSessionId) ?? [];
}

export {
	acceptCodexBrowser,
	closeCodexBrowser,
	codexWiring,
	drainCodexBrowsers,
	handleCodexBrowserMessage,
	liveWorkhorseCheckouts,
	publishPaneContext,
	resetCodexWorkbenchWiring,
};

// The conversation's runtime placed in the tree: the assistant-ui provider
// around whatever renders the conversation.

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import type { JSX, ReactNode } from "react";

import { useAgentRuntime } from "#ui/hooks/runtime/use-agent-runtime.ts";
import type { BrowserWorkbenchTransport } from "@archboard/codex-realtime-voice/controllers";

/** Inputs for the provider. */
interface AgentRuntimeProviderProps {
	readonly transport: BrowserWorkbenchTransport;
	readonly children: ReactNode;
}

/**
 * The conversation's runtime around its renderer.
 * @param props The transport and the renderer.
 * @returns The provider.
 */
function AgentRuntimeProvider(props: AgentRuntimeProviderProps): JSX.Element {
	const { runtime } = useAgentRuntime(props.transport);
	return <AssistantRuntimeProvider runtime={runtime}>{props.children}</AssistantRuntimeProvider>;
}

export { AgentRuntimeProvider, type AgentRuntimeProviderProps };

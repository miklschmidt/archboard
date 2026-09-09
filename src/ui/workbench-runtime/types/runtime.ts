// What the workbench runtime hook takes, what it returns, and what the
// provider hands its renderer.

import type { AssistantRuntime } from "@assistant-ui/react";
import type { ComponentType } from "react";

import type { WorkbenchActions, WorkbenchView, WorkbenchVoiceView } from "@/ui/workbench/contracts";
import type { WorkbenchRuntimeHost } from "@/ui/workbench-runtime/lib/actions";
import type { WorkbenchRuntimeView, WorkbenchVisibleStatus } from "@/ui/workbench-runtime/lib/view";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** What the renderer receives. */
interface WorkbenchRuntimeRenderContext {
	readonly view: WorkbenchView;
	readonly actions: WorkbenchActions;
	readonly runtimeView: WorkbenchRuntimeView;
	readonly status: WorkbenchVisibleStatus;
	readonly assistantRuntime: AssistantRuntime;
}

type WorkbenchRuntimeRenderer = ComponentType<WorkbenchRuntimeRenderContext>;

/** What the hook needs beyond the transport. */
interface WorkbenchRuntimeOptions {
	readonly host: WorkbenchRuntimeHost;
	/** The live voice view; unavailable when the host has no voice. */
	readonly voice?: WorkbenchVoiceView;
	readonly reducedMotion?: boolean;
	readonly now?: () => number;
}

/** The provider's inputs: the transport, the options, and the renderer. */
interface WorkbenchRuntimeProviderProps extends WorkbenchRuntimeOptions {
	readonly transport: BrowserWorkbenchTransport;
	readonly render: WorkbenchRuntimeRenderer;
}

/** What the hook returns. */
interface WorkbenchRuntimeHandle {
	readonly runtime: AssistantRuntime;
	readonly view: WorkbenchView;
	readonly actions: WorkbenchActions;
	readonly runtimeView: WorkbenchRuntimeView;
	readonly status: WorkbenchVisibleStatus;
}

export type {
	WorkbenchRuntimeHandle,
	WorkbenchRuntimeOptions,
	WorkbenchRuntimeProviderProps,
	WorkbenchRuntimeRenderContext,
	WorkbenchRuntimeRenderer,
};

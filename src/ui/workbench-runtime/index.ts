// The workbench runtime: the one authoritative Codex runtime over the
// transport, its view and actions for the presentation, the read-only
// provider for foreign histories, and the pure projections behind them.

export {
	WorkbenchRuntimeProvider,
	useWorkbenchRuntime,
	type WorkbenchRuntimeHandle,
	type WorkbenchRuntimeOptions,
	type WorkbenchRuntimeProviderProps,
	type WorkbenchRuntimeRenderContext,
	type WorkbenchRuntimeRenderer,
} from "@/ui/workbench-runtime/runtime";
export {
	ReadonlyWorkbenchThreadProvider,
	type ReadonlyWorkbenchThreadProviderProps,
} from "@/ui/workbench-runtime/readonly-provider";
export type { WorkbenchRuntimeHost } from "@/ui/workbench-runtime/lib/actions";
export { approvalResponse } from "@/ui/workbench-runtime/lib/approval-responses";
export { sessionView } from "@/ui/workbench-runtime/lib/session-view";
export {
	createReadonlyWorkbenchView,
	projectWorkbenchRuntime,
	readonlyRecovery,
	type ReadonlyWorkbenchSource,
	type ReadonlyWorkbenchState,
	type WorkbenchRuntimeView,
	type WorkbenchVisibleStatus,
} from "@/ui/workbench-runtime/lib/view";
export { workbenchRuntimeMessageId } from "@/ui/workbench-timeline";

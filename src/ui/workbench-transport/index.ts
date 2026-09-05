// One socket reducer for the Codex workbench: the transport that rides a
// pane's canvas socket, its published state, capabilities, lease identity,
// command targeting and preparation, and the refusal it throws.

export { createBrowserWorkbenchTransport } from "@/ui/workbench-transport/lib/transport";
export { BrowserWorkbenchTransportError } from "@/ui/workbench-transport/contract";
export type {
	BrowserApprovalResponse,
	BrowserCommandAuthority,
	BrowserCommandDraft,
	BrowserCommandName,
	BrowserGatewayAction,
	BrowserGatewayErrorCode,
	BrowserWorkbenchAccountReadResult,
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchCommandIntent,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchDeltaMessage,
	BrowserWorkbenchGatewayMessage,
	BrowserWorkbenchSnapshotDelta,
	BrowserWorkbenchSnapshotMessage,
	BrowserWorkbenchSocket,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
	BrowserWorkbenchTransportErrorCode,
	BrowserWorkbenchTransportOptions,
} from "@/ui/workbench-transport/contract";

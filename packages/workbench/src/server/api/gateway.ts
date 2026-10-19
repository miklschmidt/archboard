// The workbench gateway: it serves the browser's workbench connections, routes their commands to the owners that carry them out and publishes what changed. The types name the owners that the server wires into it. Bun only.
export { CodexWorkbenchGatewayError } from "#server/protocol/gateway/contract.ts";
export type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserApprovalCommand,
	BrowserConnectionInstance,
	BrowserDynamicApprovalActions,
	BrowserOrdinaryApprovalActions,
	BrowserProjectionContext,
	BrowserProjectionPort,
	BrowserRealtimeActions,
	BrowserTextActions,
	BrowserThreadLinkActions,
	BrowserWorkbenchActions,
	BrowserWorkbenchConnection,
	CodexWorkbenchGateway,
	CodexWorkbenchGatewayOptions,
} from "#server/protocol/gateway/contract.ts";
export { createCodexWorkbenchGateway } from "#server/services/gateway/gateway.ts";

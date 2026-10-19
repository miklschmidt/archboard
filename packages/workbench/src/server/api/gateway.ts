// The workbench gateway: it serves the browser's workbench connections, routes their commands to the owners that carry them out and publishes what changed. Bun only.
export type {
	BrowserConnectionInstance,
	BrowserWorkbenchActions,
} from "#server/protocol/gateway/contract.ts";
export { createCodexWorkbenchGateway } from "#server/services/gateway/gateway.ts";

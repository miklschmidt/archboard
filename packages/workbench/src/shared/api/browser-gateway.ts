// The wire envelope that the workbench gateway speaks to the browser: the actions it accepts, its messages and its error codes. Safe for the browser.
export {
	BROWSER_GATEWAY_ERROR_CODES,
	BROWSER_SNAPSHOT_DELTA_KEYS,
} from "#shared/protocol/gateway-envelope.ts";
export type {
	BrowserGatewayAccountReadResult,
	BrowserGatewayAction,
	BrowserGatewayCommandResult,
	BrowserGatewayDeltaMessage,
	BrowserGatewayErrorCode,
	BrowserGatewayMessage,
	BrowserGatewaySnapshotMessage,
	BrowserSnapshotDelta,
} from "#shared/protocol/gateway-envelope.ts";

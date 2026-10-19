// The typed requests the CLI makes of a running server: JSON requests, claims, panes, and how a refused board request is shown.
export {
	ARCHBOARD_SERVICE_NAME,
	requestJson,
	responseError,
} from "#runtime/clients/server-client-transport.ts";
export {
	claimBoard,
	closePane,
	formatBoardRefusal,
	getPanes,
	openPane,
	releaseBoardClaim,
	showBoardInPane,
} from "#runtime/clients/server-client.ts";
export type { ShowBoardResponse } from "#runtime/clients/server-client.ts";
export { BOARD_REFUSAL_CODES } from "#runtime/protocol/server-client-refusal.ts";

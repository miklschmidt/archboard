import type { CodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import type { CoordinatorToolDispatcher } from "../../../runtime/codex-coordinator-tools/index.js";
import type { CodexDynamicTools } from "../../../runtime/codex-dynamic-tools/index.js";
import type {
	CodexSession,
	SessionAttestationRequest,
	SessionCurrentTimeRequest,
	SessionTokenRefreshRequest,
} from "../../../runtime/codex-session/index.js";
import type {
	DynamicServerRequest,
	TransportServerRequest,
} from "../../../runtime/codex-transport/server-requests.js";

export interface CodexWorkbenchRequestOwners {
	readonly approvals: Pick<CodexApprovalBroker, "receive">;
	readonly dynamicTools: Pick<CodexDynamicTools, "dispatch">;
	readonly coordinatorTools: Pick<CoordinatorToolDispatcher, "onServerRequest">;
	readonly session: Pick<
		CodexSession,
		"respondCurrentTime" | "respondUnsupportedTokenRefresh" | "respondUnsupportedAttestation"
	>;
}

export interface CodexWorkbenchRequestRouter {
	readonly route: (request: TransportServerRequest) => void;
}

function assertUnreachable(value: never): never {
	throw new TypeError(`Unreachable Codex server request: ${String(value)}`);
}

function routeDynamicRequest(
	request: DynamicServerRequest,
	owners: CodexWorkbenchRequestOwners,
): void {
	switch (request.owner) {
		case "codex-dynamic-tools":
			void owners.dynamicTools.dispatch(request);
			return;
		case "codex-coordinator-tools":
			owners.coordinatorTools.onServerRequest(request);
			return;
		default:
			return assertUnreachable(request.owner);
	}
}

/** Route every generated app-server request to its sole response owner. */
export function createCodexWorkbenchRequestRouter(
	owners: CodexWorkbenchRequestOwners,
): CodexWorkbenchRequestRouter {
	return Object.freeze({
		route: (request: TransportServerRequest): void => {
			switch (request.method) {
				case "item/commandExecution/requestApproval":
				case "item/fileChange/requestApproval":
				case "item/tool/requestUserInput":
				case "mcpServer/elicitation/request":
				case "item/permissions/requestApproval":
				case "applyPatchApproval":
				case "execCommandApproval":
					owners.approvals.receive(request);
					return;
				case "item/tool/call":
					routeDynamicRequest(request, owners);
					return;
				case "currentTime/read":
					void owners.session.respondCurrentTime(request as SessionCurrentTimeRequest);
					return;
				case "account/chatgptAuthTokens/refresh":
					void owners.session.respondUnsupportedTokenRefresh(request as SessionTokenRefreshRequest);
					return;
				case "attestation/generate":
					void owners.session.respondUnsupportedAttestation(request as SessionAttestationRequest);
					return;
				default:
					return assertUnreachable(request);
			}
		},
	});
}

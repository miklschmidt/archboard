import type { CodexApprovalBroker } from "@/runtime/codex-approvals";
import type { CoordinatorToolDispatcher } from "@/runtime/codex-coordinator-tools";
import type { CodexDynamicTools } from "@/runtime/codex-dynamic-tools";
import type {
	CodexSession,
} from "@/runtime/codex-session";
import type {
	DynamicServerRequest,
	TransportServerRequest,
} from "@/runtime/codex-transport/server-requests";

interface CodexWorkbenchRequestOwners {
	readonly approvals: Pick<CodexApprovalBroker, "receive">;
	readonly dynamicTools: Pick<CodexDynamicTools, "dispatch">;
	readonly coordinatorTools: Pick<CoordinatorToolDispatcher, "onServerRequest">;
	readonly session: Pick<
		CodexSession,
		"respondCurrentTime" | "respondUnsupportedTokenRefresh" | "respondUnsupportedAttestation"
	>;
}

interface CodexWorkbenchRequestRouter {
	readonly route: (request: TransportServerRequest) => void;
}

/**
 *
 */
function assertUnreachable(value: never): never {
	throw new TypeError(`Unreachable Codex server request: ${String(value)}`);
}

/**
 *
 */
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
function createCodexWorkbenchRequestRouter(
	owners: CodexWorkbenchRequestOwners,
): CodexWorkbenchRequestRouter {
	return Object.freeze({
		/**
		 *
		 */
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
					void owners.session.respondCurrentTime(request);
					return;
				case "account/chatgptAuthTokens/refresh":
					void owners.session.respondUnsupportedTokenRefresh(request);
					return;
				case "attestation/generate":
					void owners.session.respondUnsupportedAttestation(request);
					return;
				default:
					return assertUnreachable(request);
			}
		},
	});
}

export {
	type CodexWorkbenchRequestOwners,
	type CodexWorkbenchRequestRouter,
	createCodexWorkbenchRequestRouter,
};

import type { CodexApprovalBroker } from "@/runtime/codex-approvals";
import type { CoordinatorToolDispatcher } from "@/runtime/codex-coordinator-tools";
import type { CodexDynamicTools } from "@/runtime/codex-dynamic-tools";
import type { CodexSession } from "@/runtime/codex-session";
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

/** One method's route, taking the whole union and narrowing itself. */
type RequestRoute = (request: TransportServerRequest, owners: CodexWorkbenchRequestOwners) => void;

/**
 * One route per generated method. The table's key type is the contract's own
 * method union, so a method the transport learns about does not compile until
 * it is routed here — which is the exhaustiveness a switch used to give, at a
 * complexity the reader can hold.
 */
type RequestRouteTable = Readonly<Record<TransportServerRequest["method"], RequestRoute>>;

/**
 * Refuse a request the generated contract says cannot exist.
 * @param request The request no route claimed.
 */
function unroutedRequest(request: TransportServerRequest): never {
	throw new TypeError(`Unreachable Codex server request: ${request.method}`);
}

/**
 * Refuse a dynamic tool call whose owner the contract says cannot exist.
 * @param owner The owner no branch claimed.
 */
function unroutedOwner(owner: never): never {
	throw new TypeError(`Unreachable Codex server request: ${String(owner)}`);
}

/**
 * Route one dynamic tool call to the owner that answers it.
 * @param request The call.
 * @param owners The response owners.
 * @returns Nothing; the owner it hands the call to answers it.
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
			return unroutedOwner(request.owner);
	}
}

/**
 * The route for one approval method, which hands the request to the approval
 * broker. Each route re-reads the method it is keyed by: that check is what
 * narrows the request to the shape its owner accepts, without an assertion.
 * @param method The method this route answers.
 * @returns The route.
 */
function approvalRoute(
	method: Parameters<CodexApprovalBroker["receive"]>[0]["method"],
): RequestRoute {
	return (request, owners) => {
		if (request.method === method) {
			owners.approvals.receive(request);
		}
	};
}

const ROUTES: RequestRouteTable = {
	"item/commandExecution/requestApproval": approvalRoute("item/commandExecution/requestApproval"),
	"item/fileChange/requestApproval": approvalRoute("item/fileChange/requestApproval"),
	"item/tool/requestUserInput": approvalRoute("item/tool/requestUserInput"),
	"mcpServer/elicitation/request": approvalRoute("mcpServer/elicitation/request"),
	"item/permissions/requestApproval": approvalRoute("item/permissions/requestApproval"),
	applyPatchApproval: approvalRoute("applyPatchApproval"),
	execCommandApproval: approvalRoute("execCommandApproval"),
	/**
	 * A tool call belongs to whichever dynamic owner registered it.
	 * @param request The call.
	 * @param owners The response owners.
	 */
	"item/tool/call": (request, owners) => {
		if (request.method === "item/tool/call") {
			routeDynamicRequest(request, owners);
		}
	},
	/**
	 * The session answers the clock.
	 * @param request The request.
	 * @param owners The response owners.
	 */
	"currentTime/read": (request, owners) => {
		if (request.method === "currentTime/read") {
			void owners.session.respondCurrentTime(request);
		}
	},
	/**
	 * This workbench refreshes no tokens, and the session says so.
	 * @param request The request.
	 * @param owners The response owners.
	 */
	"account/chatgptAuthTokens/refresh": (request, owners) => {
		if (request.method === "account/chatgptAuthTokens/refresh") {
			void owners.session.respondUnsupportedTokenRefresh(request);
		}
	},
	/**
	 * This workbench attests nothing, and the session says so.
	 * @param request The request.
	 * @param owners The response owners.
	 */
	"attestation/generate": (request, owners) => {
		if (request.method === "attestation/generate") {
			void owners.session.respondUnsupportedAttestation(request);
		}
	},
};

/**
 * Route every generated app-server request to its sole response owner.
 * @param owners The response owners.
 * @returns The router.
 */
function createCodexWorkbenchRequestRouter(
	owners: CodexWorkbenchRequestOwners,
): CodexWorkbenchRequestRouter {
	return Object.freeze({
		/**
		 * Hand one server request to whichever owner answers it.
		 * @param request The request.
		 */
		route: (request: TransportServerRequest): void => {
			const route = ROUTES[request.method];
			// oxlint-disable-next-line typescript/no-unnecessary-condition -- the table is total over the method union, but the child is not the type system: an unlisted method must be refused, not dispatched
			if (route === undefined) {
				unroutedRequest(request);
			}
			route(request, owners);
		},
	});
}

export {
	type CodexWorkbenchRequestOwners,
	type CodexWorkbenchRequestRouter,
	createCodexWorkbenchRequestRouter,
};

import type { CoordinatorSnapshot } from "../../codex-coordinator/index.js";
import type {
	CodexSpokenApprovalGate,
	SpokenApprovalToolResult,
} from "../../codex-spoken-approval/index.js";
import type {
	CodexWorkhorseOperations,
	WorkhorseCoordinatorCall,
	WorkhorseOperationBinding,
} from "../../codex-workhorse-operations/index.js";
import type {
	DynamicServerRequest,
	ReverseResponse,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import type {
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	IdentityAuthority,
	JsonRpcRequestId,
	LogicalToolCallCorrelation,
	OperationAuthority,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	CoordinatorToolName,
	DynamicToolRefusalReason,
	InspectWorkhorseResult,
	ManageWorkhorseQueueInput,
	ManageWorkhorseQueueResult,
	DelegateToWorkhorseInput,
	DelegateToWorkhorseResult,
	ResolveSpokenApprovalResult,
	SteerWorkhorseInput,
	SteerWorkhorseResult,
} from "../../codex-coordinator-tool-contract/index.js";
import {
	ARCHBOARD_VOICE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
} from "../../codex-coordinator-tool-contract/index.js";
import type {
	UnknownDynamicToolResponseSchema,
	ValidDynamicToolResponseSchema,
} from "../../codex-coordinator-tool-contract/index.js";
import type { z } from "zod";

export const COORDINATOR_TOOLS_OWNER = "codex-coordinator-tools" as const;

/** The two registrations that may be installed on the owned app-server link. */
export const COORDINATOR_DYNAMIC_DISPATCHERS = Object.freeze([
	Object.freeze({
		owner: COORDINATOR_TOOLS_OWNER,
		namespace: "archboard_workhorse",
		manifestHash: ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	}),
	Object.freeze({
		owner: COORDINATOR_TOOLS_OWNER,
		namespace: "archboard_voice",
		manifestHash: ARCHBOARD_VOICE_MANIFEST_SHA256,
	}),
] as const);

export type CoordinatorDynamicDispatcher = (typeof COORDINATOR_DYNAMIC_DISPATCHERS)[number];

export type CoordinatorToolCoordinatorAuthority = Pick<
	CoordinatorSnapshot,
	"state" | "childId" | "epoch" | "threadId"
>;

/**
 * Host facts for the executing coordinator call and its bound workhorse.
 * None of these values are accepted from dynamic-tool arguments.
 */
export interface CoordinatorToolAuthorityPort {
	readonly currentCoordinator: () => CoordinatorToolCoordinatorAuthority | null;
	readonly currentWorkhorseBinding: () => WorkhorseOperationBinding | null;
	readonly currentCall: () => LogicalToolCallCorrelation | null;
	/** Supplies expectedTurnId; the coordinator never receives it from tool arguments. */
	readonly expectedTurnId: () => TurnId | null;
}

/** The only transport capability this module needs. */
export interface CoordinatorToolResponsePort {
	readonly respond: (
		request: DynamicServerRequest,
		owner: typeof COORDINATOR_TOOLS_OWNER,
		response: ReverseResponse,
	) => Promise<void>;
}

export interface CodexCoordinatorToolsOptions {
	readonly identity: IdentityAuthority;
	readonly operation: Pick<OperationAuthority, "issuer" | "validator" | "decoder">;
	readonly authority: CoordinatorToolAuthorityPort;
	readonly operations: Pick<
		CodexWorkhorseOperations,
		"inspect" | "delegate" | "manageQueue" | "steer"
	>;
	readonly spokenApproval: Pick<CodexSpokenApprovalGate, "snapshot" | "resolve">;
	readonly transport: CoordinatorToolResponsePort;
}

export type CoordinatorToolsServerRequest = DynamicServerRequest & {
	readonly owner: typeof COORDINATOR_TOOLS_OWNER;
};

export type DynamicToolResponse =
	| z.infer<typeof ValidDynamicToolResponseSchema>
	| z.infer<typeof UnknownDynamicToolResponseSchema>;

export type CoordinatorToolValue =
	| InspectWorkhorseResult
	| DelegateToWorkhorseResult
	| ManageWorkhorseQueueResult
	| SteerWorkhorseResult
	| ResolveSpokenApprovalResult;

export type CoordinatorToolValueFor<Name extends CoordinatorToolName> =
	Name extends "inspect_workhorse"
		? InspectWorkhorseResult
		: Name extends "delegate_to_workhorse"
			? DelegateToWorkhorseResult
			: Name extends "manage_workhorse_queue"
				? ManageWorkhorseQueueResult
				: Name extends "steer_workhorse"
					? SteerWorkhorseResult
					: ResolveSpokenApprovalResult;

export interface CoordinatorToolDispatchResult {
	readonly response: DynamicToolResponse;
	readonly attempted: boolean;
}

export const COORDINATOR_REPLAY_LIMITS = Object.freeze({
	aliasesPerLiveLogicalCall: 8,
	retainedWireCalls: 128,
	retainedLogicalCalls: 32,
});

export interface CoordinatorReplayStateSnapshot {
	readonly liveWireCount: number;
	readonly retainedWireCount: number;
	readonly liveLogicalCount: number;
	readonly retainedLogicalCount: number;
	readonly retainedFingerprintBytes: number;
}

export type CoordinatorToolLifecycleCause =
	| "call_cancelled"
	| "caller_turn_interrupted"
	| "host_shutdown"
	| "browser_disconnect"
	| "child_disconnect";

export interface CoordinatorToolCancellation {
	readonly requestId: JsonRpcRequestId;
	readonly cause: CoordinatorToolLifecycleCause;
}

export type CoordinatorToolNameValue = CoordinatorToolName;
export type CoordinatorToolRefusal = DynamicToolRefusalReason;
export type CoordinatorToolCall = WorkhorseCoordinatorCall;
export type CoordinatorToolCallId = DynamicToolCallId;
export type CoordinatorToolChild = ChildId;
export type CoordinatorToolEpoch = ChildEpoch;
export type CoordinatorToolThread = ThreadId;
export type CoordinatorToolSpokenResult = SpokenApprovalToolResult;

export type CoordinatorToolInput =
	| DelegateToWorkhorseInput
	| ManageWorkhorseQueueInput
	| SteerWorkhorseInput
	| { readonly verdict: "accept" | "decline" }
	| Record<string, never>;

export interface CoordinatorToolDispatcher {
	readonly dispatch: (
		request: CoordinatorToolsServerRequest,
	) => Promise<CoordinatorToolDispatchResult>;
	/** Listener-compatible entry point for the transport's exhaustive request stream. */
	readonly onServerRequest: (request: TransportServerRequest) => void;
	/** Stop a not-yet-attempted call without starting a replacement operation. */
	readonly cancel: (requestId: JsonRpcRequestId, cause: CoordinatorToolLifecycleCause) => void;
	/** Child disconnect prevents any later wire response and any retry. */
	readonly onChildExit: (exit: { readonly child: ChildId; readonly epoch: ChildEpoch }) => void;
	/** Count-only replay ownership inspection. It never exposes calls, inputs, or responses. */
	readonly replayState: () => CoordinatorReplayStateSnapshot;
	readonly dispose: () => void;
}

export class CodexCoordinatorToolsError extends Error {
	override readonly name = "CodexCoordinatorToolsError";
	readonly code: "disposed" | "duplicate";

	constructor(code: "disposed" | "duplicate", message: string) {
		super(message);
		this.code = code;
	}
}

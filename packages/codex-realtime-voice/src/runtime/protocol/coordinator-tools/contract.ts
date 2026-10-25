import type { CoordinatorSnapshot } from "#runtime/protocol/coordinator/contract.ts";
import type {
	CodexSpokenApprovalGate,
	SpokenApprovalToolResult,
} from "#runtime/protocol/spoken-approval/contract.ts";
import type {
	CodexWorkhorseOperations,
	WorkhorseCoordinatorCall,
	WorkhorseOperationBinding,
} from "#runtime/protocol/workhorse-operations/contract.ts";
import type {
	DynamicServerRequest,
	ReverseResponse,
	TransportServerRequest,
} from "@archboard/codex-app-server/transport";
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
} from "@archboard/codex-app-server/identity";
import type { CoordinatorToolName } from "#runtime/protocol/coordinator-tool-contract/manifest.ts";
import type {
	ManageWorkhorseQueueInput,
	DelegateToWorkhorseInput,
	SteerWorkhorseInput,
} from "#runtime/protocol/coordinator-tool-contract/tool-inputs.ts";
import type { DynamicToolRefusalReason } from "#runtime/protocol/coordinator-tool-contract/dynamic-tool-envelopes.ts";
import type {
	InspectWorkhorseResult,
	ManageWorkhorseQueueResult,
	DelegateToWorkhorseResult,
	ResolveSpokenApprovalResult,
	SteerWorkhorseResult,
	StopWorkhorsesResult,
} from "#runtime/protocol/coordinator-tool-contract/tool-results.ts";
import {
	VOICE_TOOLS_MANIFEST_SHA256,
	WORKHORSE_TOOLS_MANIFEST_SHA256,
} from "#runtime/protocol/coordinator-tool-contract/manifest.ts";
import type {
	UnknownDynamicToolResponseSchema,
	ValidDynamicToolResponseSchema,
} from "#runtime/protocol/coordinator-tool-contract/dynamic-tool-envelopes.ts";
import type { z } from "zod";

const COORDINATOR_TOOLS_OWNER = "codex-coordinator-tools" as const;

/** The two registrations that may be installed on the owned app-server link. */
const COORDINATOR_DYNAMIC_DISPATCHERS = Object.freeze([
	Object.freeze({
		owner: COORDINATOR_TOOLS_OWNER,
		namespace: "archboard_workhorse",
		manifestHash: WORKHORSE_TOOLS_MANIFEST_SHA256,
	}),
	Object.freeze({
		owner: COORDINATOR_TOOLS_OWNER,
		namespace: "archboard_voice",
		manifestHash: VOICE_TOOLS_MANIFEST_SHA256,
	}),
] as const);

type CoordinatorDynamicDispatcher = (typeof COORDINATOR_DYNAMIC_DISPATCHERS)[number];

type CoordinatorToolCoordinatorAuthority = Pick<
	CoordinatorSnapshot,
	"state" | "childId" | "epoch" | "threadId"
>;

/**
 * Server facts for the executing coordinator call. None of these values are accepted from
 * dynamic-tool arguments.
 */
interface CoordinatorToolAuthorityPort {
	readonly currentCoordinator: () => CoordinatorToolCoordinatorAuthority | null;
	readonly currentCall: () => LogicalToolCallCorrelation | null;
	/** Supplies expectedTurnId; the coordinator never receives it from tool arguments. */
	readonly expectedTurnId: () => TurnId | null;
}

/** The only transport capability this module needs. */
interface CoordinatorToolResponsePort {
	readonly respond: (
		request: DynamicServerRequest,
		owner: typeof COORDINATOR_TOOLS_OWNER,
		response: ReverseResponse,
	) => Promise<void>;
}

/** The workhorse of one checkout, as the coordinator tools reach it. */
interface CoordinatorToolWorkhorse {
	/** The operation binding of this workhorse and the coordinator, or null while they share none. */
	readonly binding: () => WorkhorseOperationBinding | null;
	readonly operations: Pick<
		CodexWorkhorseOperations,
		"inspect" | "delegate" | "manageQueue" | "steer"
	>;
}

/** What stopping one workhorse did: it had a running turn interrupted, or it had none. */
interface CoordinatorToolStop {
	readonly checkout: string;
	readonly outcome: "interrupted" | "idle";
}

interface CodexCoordinatorToolsOptions {
	readonly identity: IdentityAuthority;
	readonly operation: Pick<OperationAuthority, "issuer" | "validator" | "decoder">;
	readonly authority: CoordinatorToolAuthorityPort;
	/**
	 * The workhorse of the checkout a workhorse tool names (ADR 0050), or null when the tab session
	 * has none there. The checkout is the one argument that chooses; the binding is the server's.
	 */
	readonly workhorseFor: (checkout: string) => CoordinatorToolWorkhorse | null;
	/**
	 * Stop every running workhorse of the calling tab session (ADR 0048, ADR 0050), whichever
	 * checkout it works in, and say what each one did, in the order the tab session keeps them. It
	 * names no checkout and no turn. A rejection with no refusal code leaves the outcome unknown.
	 */
	readonly stopWork: () => Promise<readonly CoordinatorToolStop[]>;
	readonly spokenApproval: Pick<CodexSpokenApprovalGate, "snapshot" | "resolve">;
	readonly transport: CoordinatorToolResponsePort;
}

type CoordinatorToolsServerRequest = DynamicServerRequest & {
	readonly owner: typeof COORDINATOR_TOOLS_OWNER;
};

type DynamicToolResponse =
	| z.infer<typeof ValidDynamicToolResponseSchema>
	| z.infer<typeof UnknownDynamicToolResponseSchema>;

type CoordinatorToolValue =
	| InspectWorkhorseResult
	| DelegateToWorkhorseResult
	| ManageWorkhorseQueueResult
	| SteerWorkhorseResult
	| StopWorkhorsesResult
	| ResolveSpokenApprovalResult;

type CoordinatorToolValueFor<Name extends CoordinatorToolName> = Name extends "inspect_workhorse"
	? InspectWorkhorseResult
	: Name extends "delegate_to_workhorse"
		? DelegateToWorkhorseResult
		: Name extends "manage_workhorse_queue"
			? ManageWorkhorseQueueResult
			: Name extends "steer_workhorse"
				? SteerWorkhorseResult
				: Name extends "stop_workhorses"
					? StopWorkhorsesResult
					: ResolveSpokenApprovalResult;

interface CoordinatorToolDispatchResult {
	readonly response: DynamicToolResponse;
	readonly attempted: boolean;
}

const COORDINATOR_REPLAY_LIMITS = Object.freeze({
	aliasesPerLiveLogicalCall: 8,
	retainedWireCalls: 128,
	retainedLogicalCalls: 32,
});

interface CoordinatorReplayStateSnapshot {
	readonly liveWireCount: number;
	readonly retainedWireCount: number;
	readonly liveLogicalCount: number;
	readonly retainedLogicalCount: number;
	readonly retainedFingerprintBytes: number;
}

type CoordinatorToolLifecycleCause =
	| "call_cancelled"
	| "caller_turn_interrupted"
	| "server_shutdown"
	| "browser_disconnect"
	| "child_disconnect";

interface CoordinatorToolCancellation {
	readonly requestId: JsonRpcRequestId;
	readonly cause: CoordinatorToolLifecycleCause;
}

type CoordinatorToolNameValue = CoordinatorToolName;
type CoordinatorToolRefusal = DynamicToolRefusalReason;
type CoordinatorToolCall = WorkhorseCoordinatorCall;
type CoordinatorToolCallId = DynamicToolCallId;
type CoordinatorToolChild = ChildId;
type CoordinatorToolEpoch = ChildEpoch;
type CoordinatorToolThread = ThreadId;
type CoordinatorToolSpokenResult = SpokenApprovalToolResult;

type CoordinatorToolInput =
	| DelegateToWorkhorseInput
	| ManageWorkhorseQueueInput
	| SteerWorkhorseInput
	| { readonly verdict: "accept" | "decline" }
	| Record<string, never>;

interface CoordinatorToolDispatcher {
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

class CodexCoordinatorToolsError extends Error {
	override readonly name = "CodexCoordinatorToolsError";
	readonly code: "disposed" | "duplicate";

	/**
	 * Build a dispatcher failure the composition root can tell apart by code.
	 * @param code - Whether the dispatcher is gone or the request identity was already used.
	 * @param message - The diagnostic for the caller.
	 */
	constructor(code: "disposed" | "duplicate", message: string) {
		super(message);
		this.code = code;
	}
}

export {
	COORDINATOR_TOOLS_OWNER,
	COORDINATOR_DYNAMIC_DISPATCHERS,
	type CoordinatorDynamicDispatcher,
	type CoordinatorToolCoordinatorAuthority,
	type CoordinatorToolAuthorityPort,
	type CoordinatorToolResponsePort,
	type CoordinatorToolWorkhorse,
	type CoordinatorToolStop,
	type CodexCoordinatorToolsOptions,
	type CoordinatorToolsServerRequest,
	type DynamicToolResponse,
	type CoordinatorToolValue,
	type CoordinatorToolValueFor,
	type CoordinatorToolDispatchResult,
	COORDINATOR_REPLAY_LIMITS,
	type CoordinatorReplayStateSnapshot,
	type CoordinatorToolLifecycleCause,
	type CoordinatorToolCancellation,
	type CoordinatorToolNameValue,
	type CoordinatorToolRefusal,
	type CoordinatorToolCall,
	type CoordinatorToolCallId,
	type CoordinatorToolChild,
	type CoordinatorToolEpoch,
	type CoordinatorToolThread,
	type CoordinatorToolSpokenResult,
	type CoordinatorToolInput,
	type CoordinatorToolDispatcher,
	CodexCoordinatorToolsError,
};

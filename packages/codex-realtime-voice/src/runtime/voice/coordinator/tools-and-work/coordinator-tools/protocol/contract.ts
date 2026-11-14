import type { CoordinatorSnapshot } from "#runtime/voice/coordinator/protocol/contract.ts";
import type { CodexSpokenApprovalGate } from "#runtime/voice/coordinator/tools-and-work/spoken-approval/protocol/contract.ts";
import type {
	CodexWorkhorseOperations,
	WorkhorseOperationBinding,
} from "#runtime/workhorses/workhorse-operations/protocol/contract.ts";
import type {
	DynamicServerRequest,
	ReverseResponse,
	TransportServerRequest,
} from "@archboard/codex-app-server/transport";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	JsonRpcRequestId,
	LogicalToolCallCorrelation,
	OperationAuthority,
	TurnId,
} from "@archboard/codex-app-server/identity";
import type { CoordinatorToolName } from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/manifest.ts";
import type {
	InspectWorkhorseResult,
	ManageWorkhorseQueueResult,
	DelegateToWorkhorseResult,
	ResolveSpokenApprovalResult,
	SteerWorkhorseResult,
	StopWorkhorsesResult,
} from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/tool-results.ts";
import type { VoiceToolset } from "#runtime/host/toolset/rules/toolset.ts";
import type {
	UnknownDynamicToolResponseSchema,
	ValidDynamicToolResponseSchema,
} from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/dynamic-tool-envelopes.ts";
import type { z } from "zod";

const COORDINATOR_TOOLS_OWNER = "codex-coordinator-tools" as const;

/** One registration the coordinator tools are installed under on the owned app-server link. */
interface CoordinatorDynamicDispatcher {
	readonly owner: typeof COORDINATOR_TOOLS_OWNER;
	readonly namespace: string;
	readonly manifestHash: string;
}

/**
 * The two registrations that may be installed on the owned app-server link, as the host names them.
 * @param tools - The host's built-in namespaces.
 * @returns The workhorse and voice registrations.
 */
function coordinatorDynamicDispatchers(
	tools: VoiceToolset,
): readonly CoordinatorDynamicDispatcher[] {
	return [tools.workhorse, tools.voice].map((reviewed) =>
		Object.freeze({
			owner: COORDINATOR_TOOLS_OWNER,
			namespace: reviewed.namespace.name,
			manifestHash: reviewed.sha256,
		}),
	);
}

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
}

/** The only transport capability this module needs. */
interface CoordinatorToolResponsePort {
	readonly respond: (
		request: DynamicServerRequest,
		owner: typeof COORDINATOR_TOOLS_OWNER,
		response: ReverseResponse,
	) => Promise<void>;
}

type StopEntry = StopWorkhorsesResult["stopped"][number];

/** What one stop observed of one workhorse's work tree, as the stop tool reports it. */
interface CoordinatorToolStop {
	readonly checkout: string;
	readonly outcome: StopEntry["outcome"];
	readonly remaining: readonly StopEntry["remaining"][number][];
}

/** The workhorse of one checkout, as the coordinator tools reach it. */
interface CoordinatorToolWorkhorse {
	/** The operation binding of this workhorse and the coordinator, or null while they share none. */
	readonly binding: () => WorkhorseOperationBinding | null;
	readonly operations: Pick<
		CodexWorkhorseOperations,
		"inspect" | "delegate" | "manageQueue" | "steer"
	>;
	/** Where its last stop stands, as inspection reports it, or null before any stop. */
	readonly lastStop: () => InspectWorkhorseResult["lastStop"];
}

interface CodexCoordinatorToolsOptions {
	readonly identity: IdentityAuthority;
	/** The host's built-in namespaces: a call is matched to its role by name and manifest digest. */
	readonly tools: VoiceToolset;
	readonly operation: Pick<OperationAuthority, "issuer" | "validator" | "decoder">;
	readonly authority: CoordinatorToolAuthorityPort;
	/**
	 * The workhorse of the checkout a workhorse tool names, or null when the tab session
	 * has none there. The checkout is the one argument that chooses; the binding is the server's.
	 */
	readonly workhorseFor: (checkout: string) => CoordinatorToolWorkhorse | null;
	/**
	 * Stop the work tree of every workhorse of the calling tab session, whichever checkout it works
	 * in, and say what each stop observed, in the order the tab session keeps them. It names no
	 * checkout and no turn. The coordinator turn of the call starts no work after it. A rejection
	 * with no refusal code leaves the outcome unknown.
	 * @param askedBy The coordinator turn whose call asked for the stop.
	 */
	readonly stopWork: (askedBy: TurnId) => Promise<readonly CoordinatorToolStop[]>;
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
	coordinatorDynamicDispatchers,
	type CoordinatorToolCoordinatorAuthority,
	type CoordinatorToolAuthorityPort,
	type CoordinatorToolStop,
	type CoordinatorToolWorkhorse,
	type CodexCoordinatorToolsOptions,
	type CoordinatorToolsServerRequest,
	type DynamicToolResponse,
	type CoordinatorToolValue,
	type CoordinatorToolValueFor,
	type CoordinatorToolDispatchResult,
	COORDINATOR_REPLAY_LIMITS,
	type CoordinatorReplayStateSnapshot,
	type CoordinatorToolCancellation,
	type CoordinatorToolDispatcher,
	CodexCoordinatorToolsError,
};

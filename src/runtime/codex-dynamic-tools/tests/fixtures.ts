import type { EpochExecutionProof, EpochOperationRecord } from "../../codex-epoch/index.js";
import type { ArchboardContext } from "../../codex-instructions/index.js";
import type {
	SessionThread,
	SessionThreadForkResult,
	SessionThreadItem,
	SessionThreadItemPageResult,
	SessionThreadStartResult,
	SessionTurn,
	SessionTurnResult,
} from "../../codex-session/index.js";
import type { DynamicServerRequest } from "../../codex-transport/server-requests.js";
import type {
	IdentityAuthorities,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	type ToolArguments,
} from "../../codex-thread-tools/index.js";
import { contextFixture } from "./context.js";
import type {
	DynamicAuthorityToken,
	DynamicCallerAuthority,
	DynamicTargetAuthority,
	DynamicToolName,
} from "../index.js";
import type { ThreadLinkClassification } from "../../codex-thread-link/index.js";

export const CHECKOUT_ROOT = "/workspace/archboard";
export const CALLER_WIRE_ID = "caller-thread";
export const CALLER_TURN_WIRE_ID = "caller-turn";

export type AuthorityIds = IdentityAuthorities;

export function authorityToken(value: string): DynamicAuthorityToken {
	return value as DynamicAuthorityToken;
}

export function thread(
	authorities: AuthorityIds,
	rawId: string,
	overrides: Partial<
		Pick<SessionThread, "status" | "source" | "canAcceptDirectInput" | "name" | "preview">
	> = {},
): SessionThread {
	return {
		id: authorities.identity.decoder.adoptThreadId(rawId),
		extra: {},
		sessionId: "session-fixture",
		forkedFromId: null,
		parentThreadId: null,
		preview: "fixture preview",
		ephemeral: false,
		section: null,
		sectionEnteredAt: null,
		projectId: null,
		historyMode: "paginated",
		modelProvider: "openai",
		createdAt: 1,
		updatedAt: 2,
		recencyAt: null,
		status: { type: "idle" },
		path: null,
		cwd: CHECKOUT_ROOT,
		cliVersion: "0.151.0",
		source: "appServer",
		canAcceptDirectInput: true,
		threadSource: "archboard",
		agentNickname: null,
		agentRole: null,
		gitInfo: null,
		name: null,
		turns: [],
		...overrides,
	} as SessionThread;
}

export function turn(
	authorities: AuthorityIds,
	rawId: string,
	status: SessionTurn["status"] = "completed",
	userText = "hello from fixture",
): SessionTurn {
	return {
		id: authorities.identity.decoder.adoptTurnId(rawId),
		items: [
			{
				type: "userMessage",
				id: authorities.identity.decoder.adoptItemId(`item-${rawId}`),
				clientId: null,
				content: [{ type: "text", text: userText, text_elements: [] }],
			},
		],
		itemsView: "full",
		status,
		error: null,
		startedAt: 1,
		completedAt: 2,
		durationMs: 1,
	} as SessionTurn;
}

export function commandExecutionItem(
	authorities: AuthorityIds,
	rawId: string,
	output: string | null,
): SessionThreadItem {
	return {
		type: "commandExecution",
		id: authorities.identity.decoder.adoptItemId(rawId),
		pluginId: null,
		scriptPath: null,
		command: "printf fixture",
		cwd: CHECKOUT_ROOT,
		processId: null,
		source: "agent",
		status: "completed",
		commandActions: [],
		aggregatedOutput: output,
		exitCode: 0,
		durationMs: 1,
	} as SessionThreadItem;
}

export function fileChangeItem(
	authorities: AuthorityIds,
	rawId: string,
	diff: string,
): SessionThreadItem {
	return {
		type: "fileChange",
		id: authorities.identity.decoder.adoptItemId(rawId),
		changes: [
			{
				path: "src/fixture.ts",
				kind: { type: "update", move_path: null },
				diff,
			},
		],
		status: "completed",
	} as SessionThreadItem;
}

export function functionCallOutputItem(
	authorities: AuthorityIds,
	rawId: string,
	output: string,
): SessionThreadItem {
	return {
		type: "functionCallOutput",
		id: authorities.identity.decoder.adoptItemId(rawId),
		name: "fixture_tool",
		namespace: null,
		output: [{ type: "input_text", text: output }],
	} as SessionThreadItem;
}

export function mcpToolCallItem(
	authorities: AuthorityIds,
	rawId: string,
	output: string,
): SessionThreadItem {
	return {
		type: "mcpToolCall",
		id: authorities.identity.decoder.adoptItemId(rawId),
		server: "fixture_server",
		tool: "fixture_tool",
		status: "completed",
		arguments: {},
		appContext: null,
		pluginId: null,
		readOnlyHint: null,
		result: {
			content: [{ type: "text", text: output }],
			structuredContent: null,
			_meta: null,
		},
		error: null,
		durationMs: 1,
	} as SessionThreadItem;
}

export function itemPage(
	turnId: TurnId,
	items: readonly SessionThreadItem[],
	nextCursor: string | null = null,
): SessionThreadItemPageResult {
	return {
		data: items.map((item) => ({ turnId, item })),
		nextCursor,
		backwardsCursor: null,
	} as SessionThreadItemPageResult;
}

export function threadStartResult(threadValue: SessionThread): SessionThreadStartResult {
	return {
		thread: threadValue,
		model: "gpt-fixture",
		modelProvider: "openai",
		serviceTier: null,
		cwd: CHECKOUT_ROOT,
		runtimeWorkspaceRoots: [CHECKOUT_ROOT],
		instructionSources: [],
		approvalPolicy: "never",
		approvalsReviewer: "user",
		sandbox: { type: "dangerFullAccess" },
		activePermissionProfile: null,
		reasoningEffort: null,
		multiAgentMode: "explicitRequestOnly",
	};
}

export function threadForkResult(threadValue: SessionThread): SessionThreadForkResult {
	return threadStartResult(threadValue);
}

export function turnResult(turnValue: SessionTurn): SessionTurnResult {
	return { turn: turnValue };
}

function proofFor(
	authorities: AuthorityIds,
	threadId: ThreadId,
	turnId: TurnId | null,
	operationId: string,
): EpochExecutionProof {
	const childId = authorities.identity.validator.childId;
	const epoch = authorities.identity.validator.epoch;
	const record: EpochOperationRecord = {
		correlation: { childId, epoch, operationId },
		operation: { id: operationId, kind: "create_thread", rpc: "thread/start" },
		status: "committed",
		outcome: "delivered",
		provenance: {
			childId,
			epoch,
			threadId,
			turnId,
			threadSource: "appServer",
			workspaceRoot: CHECKOUT_ROOT,
			instructionHash: "1".repeat(64),
			manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
			confirmedAtMs: 2,
		},
		reason: "fixture confirmed",
		createdAtMs: 1,
		updatedAtMs: 2,
	};
	return { record, manifestRevision: 1 };
}

function linkFor(
	authorities: AuthorityIds,
	threadValue: SessionThread,
	turnId: TurnId | null,
	operationId: string,
): ThreadLinkClassification {
	const childId = authorities.identity.validator.childId;
	const epoch = authorities.identity.validator.epoch;
	const proof = proofFor(authorities, threadValue.id, turnId, operationId);
	const linkStatus =
		threadValue.status.type === "notLoaded" || threadValue.status.type === "systemError"
			? "idle"
			: threadValue.status.type;
	return {
		link: {
			kind: "thread_link",
			state: "executable",
			childId,
			epoch,
			threadId: threadValue.id,
			source: "appServer",
			status: linkStatus,
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		thread: threadValue,
		observation: {
			persisted: true,
			persistedRows: 1,
			loaded: true,
			loadedOccurrences: 1,
			source: "appServer",
			status: threadValue.status.type,
			canAcceptDirectInput: threadValue.canAcceptDirectInput,
		},
		currentEpoch: { childId, epoch },
		proof,
	};
}

export function callerAuthority(
	authorities: AuthorityIds,
	overrides: Partial<DynamicCallerAuthority> = {},
): DynamicCallerAuthority {
	const childId = authorities.identity.validator.childId;
	const epoch = authorities.identity.validator.epoch;
	const callerThread = authorities.identity.decoder.adoptThreadId(CALLER_WIRE_ID);
	const callerTurn = authorities.identity.decoder.adoptTurnId(CALLER_TURN_WIRE_ID);
	const callerThreadValue = thread(authorities, CALLER_WIRE_ID, {
		status: { type: "active", activeFlags: [] },
	});
	const proof = linkFor(authorities, callerThreadValue, callerTurn, "caller-proof");
	return Object.freeze({
		authority: authorityToken("caller-authority"),
		threadId: callerThread,
		wireThreadId: CALLER_WIRE_ID,
		childId,
		epoch,
		epochState: "current",
		ownership: "created",
		loaded: true,
		directInput: true,
		status: "active",
		source: "appServer",
		provenance: proof.proof,
		threadLinkTarget: {
			threadId: callerThread,
			childId,
			epoch,
			operationId: "caller-proof",
			provenance: proof.proof,
		},
		linkClassification: proof,
		role: "caller",
		turnId: callerTurn,
		wireTurnId: CALLER_TURN_WIRE_ID,
		executing: true,
		...overrides,
	});
}

export function targetAuthority(
	authorities: AuthorityIds,
	rawId: string,
	caller: DynamicCallerAuthority,
	overrides: Partial<DynamicTargetAuthority> = {},
): DynamicTargetAuthority {
	const targetThread = thread(authorities, rawId, {
		status: { type: "idle" },
	});
	const targetId = targetThread.id;
	const proof = linkFor(authorities, targetThread, null, `proof-${rawId}`);
	const childId = authorities.identity.validator.childId;
	const epoch = authorities.identity.validator.epoch;
	void caller;
	return Object.freeze({
		authority: authorityToken(`target-authority-${rawId}`),
		threadId: targetId,
		wireThreadId: rawId,
		childId,
		epoch,
		epochState: "current",
		ownership: "created",
		loaded: true,
		directInput: true,
		status: "idle",
		source: "appServer",
		provenance: proof.proof,
		threadLinkTarget: {
			threadId: targetId,
			childId,
			epoch,
			operationId: `proof-${rawId}`,
			provenance: proof.proof,
		},
		linkClassification: proof,
		role: "target",
		...overrides,
	});
}

export function contextFor(
	caller: DynamicCallerAuthority,
	operationId: string,
	kind: "create_thread_initial_turn" | "fork_thread_initial_turn" | "send_message_to_thread",
): ArchboardContext {
	return {
		...contextFixture,
		child: { id: String(caller.childId), epoch: String(caller.epoch) },
		workhorse: { threadId: caller.wireThreadId, turnId: caller.wireTurnId },
		threadLink: { state: "executable", reason: null },
		operation: { id: operationId, kind, rpc: "turn/start", outcome: null },
	};
}

export function requestFor(
	authorities: AuthorityIds,
	caller: DynamicCallerAuthority,
	tool: DynamicToolName,
	argumentsValue: ToolArguments[DynamicToolName],
	callSuffix: string = tool,
): DynamicServerRequest {
	const requestId = authorities.identity.issuer.mintJsonRpcRequestId();
	const callId = authorities.identity.decoder.adoptDynamicToolCallId(`call-${callSuffix}`);
	const logicalCall = authorities.identity.decoder.createLogicalToolCallCorrelation({
		threadId: caller.threadId,
		turnId: caller.turnId,
		callId,
		namespace: ARCHBOARD_APP_NAMESPACE.name,
		tool,
		manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
	});
	const correlation = authorities.identity.decoder.createWireRequestCorrelation({ requestId });
	return {
		child: caller.childId,
		epoch: caller.epoch,
		requestId,
		correlation,
		method: "item/tool/call",
		params: {
			threadId: caller.wireThreadId,
			turnId: caller.wireTurnId,
			callId: `call-${callSuffix}`,
			namespace: ARCHBOARD_APP_NAMESPACE.name,
			tool,
			arguments: argumentsValue,
		},
		owner: "codex-dynamic-tools",
		logicalCall,
	};
}

import type {
	ApprovalSnapshot,
	CodexApprovalBroker,
	SpokenApprovalEffectPresentation,
} from "../../codex-approvals/index.js";
import {
	ARCHBOARD_VOICE_MANIFEST_SHA256,
	type DynamicToolRefusalReason,
} from "../../codex-coordinator-tool-contract/index.js";
import { ArchboardContextSchema, type ArchboardContext } from "../../codex-instructions/index.js";
import type { SpokenApprovalArmInput, SpokenApprovalFallbackReason } from "./contract.js";
import type { ActiveSlot } from "./state.js";
import {
	IdentityValidationError,
	type IdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	RealtimeCorrelation,
	RealtimeTranscriptRecord,
} from "../../../shared/codex-realtime-host/index.js";
import type {
	ChildEpoch,
	ChildId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { DynamicServerRequest } from "../../codex-transport/index.js";
import { CODEX_SPOKEN_GATE_EXPIRY_MS } from "../../../shared/timing/timing.js";

export interface CoordinatorIdentity {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
}

export interface ValidationHost {
	readonly approvalBroker: Pick<
		CodexApprovalBroker,
		"get" | "spokenEligibility" | "spokenEffectPresentation"
	>;
	readonly identity: IdentityAuthority;
	readonly currentCoordinator: () => CoordinatorIdentity | null;
	readonly currentRealtime: () => RealtimeCorrelation | null;
	readonly currentTime: () => number | null;
	readonly transcript: () => readonly RealtimeTranscriptRecord[];
}

export type ArmValidationResult =
	| { readonly ok: false; readonly reason: SpokenApprovalFallbackReason }
	| {
			readonly ok: true;
			readonly effectSummary: string;
			readonly operationId: string;
			readonly clientUserMessageId: string;
			readonly approval: ApprovalSnapshot;
			readonly coordinator: CoordinatorIdentity;
			readonly realtime: RealtimeCorrelation;
			readonly context: ArchboardContext;
			readonly baselineRecordKeys: ReadonlySet<string>;
			readonly expiresAtMs: number;
	  };

function invalid(reason: SpokenApprovalFallbackReason): ArmValidationResult {
	return { ok: false, reason };
}

export function sameRealtime(left: RealtimeCorrelation, right: RealtimeCorrelation): boolean {
	return left.sessionId === right.sessionId && left.correlationId === right.correlationId;
}

export function recordKey(record: RealtimeTranscriptRecord): string {
	return `${record.sessionId}\u0000${record.correlationId}\u0000${record.itemId}`;
}

export function sameBinding(
	left: ApprovalSnapshot["binding"],
	right: ApprovalSnapshot["binding"],
): boolean {
	return (
		left.child === right.child &&
		left.epoch === right.epoch &&
		left.link === right.link &&
		left.target === right.target &&
		left.effect === right.effect
	);
}

function sameSpokenEffectPresentation(
	presentation: SpokenApprovalEffectPresentation,
	approval: ApprovalSnapshot,
): boolean {
	return (
		presentation.requestId === approval.requestId &&
		presentation.family === approval.family &&
		presentation.child === approval.child &&
		presentation.epoch === approval.epoch &&
		presentation.threadId === approval.threadId &&
		presentation.turnId === approval.turnId &&
		presentation.itemId === approval.itemId &&
		presentation.approvalId === approval.approvalId &&
		sameBinding(presentation.binding, approval.binding)
	);
}

export function safeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function oneLine(value: unknown, label: string): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.includes("\r") ||
		value.includes("\n")
	) {
		throw new TypeError(`${label} must be a non-empty one-line value.`);
	}
	if (Buffer.byteLength(value, "utf8") > 256) {
		throw new TypeError(`${label} must be at most 256 UTF-8 bytes.`);
	}
	return value;
}

export function validSequence(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export interface CallValidationFailure {
	readonly fallback: SpokenApprovalFallbackReason;
	readonly refusal: DynamicToolRefusalReason;
	readonly message: string;
}

function failure(
	fallback: SpokenApprovalFallbackReason,
	refusal: DynamicToolRefusalReason,
	message: string,
): CallValidationFailure {
	return { fallback, refusal, message };
}

function failureForIdentity(error: unknown): CallValidationFailure {
	if (error instanceof IdentityValidationError) {
		if (error.code === "wrong-child") {
			return failure(
				"stale_realtime_session",
				"stale_child",
				"The spoken approval belongs to another Codex child.",
			);
		}
		if (error.code === "stale-epoch") {
			return failure(
				"stale_state",
				"prior_epoch",
				"The spoken approval belongs to a prior Codex child epoch.",
			);
		}
	}
	return failure(
		"stale_state",
		"unknown_provenance",
		`The spoken approval identity is no longer current: ${safeErrorMessage(error)}`,
	);
}

export function validateArm(
	host: ValidationHost,
	input: SpokenApprovalArmInput,
): ArmValidationResult {
	let effectSummary: string;
	let operationId: string;
	let clientUserMessageId: string;
	try {
		effectSummary = oneLine(input.effectSummary, "effect summary");
		operationId = oneLine(input.classifier.operationId, "classifier operation id");
		clientUserMessageId = oneLine(
			input.classifier.clientUserMessageId,
			"classifier client message id",
		);
	} catch {
		return invalid("invalid_context");
	}
	if (!validSequence(input.effectPrompt.sequence)) {
		return invalid("invalid_effect_prompt");
	}
	const coordinator = host.currentCoordinator();
	if (coordinator === null) {
		return invalid("coordinator_unavailable");
	}
	const realtime = host.currentRealtime();
	if (realtime === null || !sameRealtime(realtime, input.realtime)) {
		return invalid("realtime_unavailable");
	}
	try {
		host.identity.validator.assertCurrentEpoch(coordinator.child, coordinator.epoch);
	} catch {
		return invalid("stale_state");
	}
	let approval: ApprovalSnapshot | undefined;
	let eligibility: ReturnType<ValidationHost["approvalBroker"]["spokenEligibility"]>;
	try {
		approval = host.approvalBroker.get(input.requestId);
		eligibility = host.approvalBroker.spokenEligibility(input.requestId);
	} catch {
		return invalid("approval_unavailable");
	}
	if (approval === undefined) {
		return invalid("approval_unavailable");
	}
	if (!eligibility.eligible || approval.state !== "pending") {
		return invalid(eligibility.reason === "not_pending" ? "approval_unavailable" : "not_eligible");
	}
	if (approval.family !== "command_execution") {
		return invalid("not_eligible");
	}
	if (approval.child !== coordinator.child || approval.epoch !== coordinator.epoch) {
		return invalid("stale_state");
	}
	let presentation: SpokenApprovalEffectPresentation;
	try {
		presentation = host.approvalBroker.spokenEffectPresentation(input.requestId);
	} catch {
		return invalid("invalid_effect_prompt");
	}
	if (
		!sameSpokenEffectPresentation(presentation, approval) ||
		presentation.effectSummary !== effectSummary
	) {
		return invalid("invalid_effect_prompt");
	}
	return validateArmContext(host, input, {
		effectSummary: presentation.effectSummary,
		operationId,
		clientUserMessageId,
		approval,
		coordinator,
		realtime,
	});
}

function validateArmContext(
	host: ValidationHost,
	input: SpokenApprovalArmInput,
	values: {
		readonly effectSummary: string;
		readonly operationId: string;
		readonly clientUserMessageId: string;
		readonly approval: ApprovalSnapshot;
		readonly coordinator: CoordinatorIdentity;
		readonly realtime: RealtimeCorrelation;
	},
): ArmValidationResult {
	const parsedContext = ArchboardContextSchema.safeParse(input.classifier.context);
	if (!parsedContext.success) {
		return invalid("invalid_context");
	}
	const context = parsedContext.data;
	const operation = context.operation;
	if (
		operation.id === null ||
		operation.id !== values.operationId ||
		operation.kind !== "spoken_approval_classifier" ||
		operation.rpc !== "turn/start" ||
		operation.outcome !== null ||
		context.child.id !== values.coordinator.child ||
		context.child.epoch !== values.coordinator.epoch ||
		context.coordinator.threadId !== values.coordinator.threadId ||
		context.coordinator.realtimeSessionId !== values.realtime.sessionId
	) {
		return invalid("invalid_context");
	}
	let records: readonly RealtimeTranscriptRecord[];
	try {
		records = host.transcript();
	} catch {
		return invalid("realtime_unavailable");
	}
	const prompt = records.find(
		(record) =>
			sameRealtime(record, input.realtime) &&
			record.itemId === input.effectPrompt.itemId &&
			record.sequence === input.effectPrompt.sequence,
	);
	if (
		prompt?.role !== "assistant" ||
		prompt?.status !== "final" ||
		prompt?.text.length === 0 ||
		prompt.text !== values.effectSummary
	) {
		return invalid("invalid_effect_prompt");
	}
	const baselineRecordKeys = new Set<string>();
	for (const record of records) {
		if (!sameRealtime(record, input.realtime)) {
			continue;
		}
		if (!validSequence(record.sequence)) {
			return invalid("stale_state");
		}
		baselineRecordKeys.add(recordKey(record));
		if (record.sequence <= prompt.sequence) {
			continue;
		}
		if (record.role === "assistant") {
			return invalid("assistant_only");
		}
		if (record.status !== "interrupted") {
			return invalid("user_already_spoke");
		}
	}
	const time = host.currentTime();
	if (time === null || !Number.isFinite(values.approval.expiresAtMs)) {
		return invalid("stale_state");
	}
	const expiresAtMs = Math.min(values.approval.expiresAtMs, time + CODEX_SPOKEN_GATE_EXPIRY_MS);
	if (time >= expiresAtMs) {
		return invalid("timeout");
	}
	return {
		ok: true,
		effectSummary: values.effectSummary,
		operationId: values.operationId,
		clientUserMessageId: values.clientUserMessageId,
		approval: values.approval,
		coordinator: values.coordinator,
		realtime: values.realtime,
		context,
		baselineRecordKeys,
		expiresAtMs,
	};
}

export function validateResolverCall(
	host: Omit<ValidationHost, "transcript">,
	slot: ActiveSlot,
	request: DynamicServerRequest,
	requireTurn: boolean,
): CallValidationFailure | null {
	if (request.owner !== "codex-coordinator-tools") {
		return failure(
			"ambiguous",
			"invalid_call",
			"Only coordinator-owned voice calls can resolve a spoken approval.",
		);
	}
	try {
		host.identity.decoder.parseJsonRpcRequestId(request.requestId);
		host.identity.decoder.parseWireRequestCorrelation(request.correlation);
		host.identity.decoder.parseLogicalToolCallCorrelation(request.logicalCall);
	} catch (error) {
		return failureForIdentity(error);
	}
	if (
		request.correlation.requestId !== request.requestId ||
		request.logicalCall.child !== request.child ||
		request.logicalCall.epoch !== request.epoch
	) {
		return failure(
			"stale_state",
			"unknown_provenance",
			"The voice call correlation is internally inconsistent.",
		);
	}
	if (request.child !== slot.child || request.correlation.child !== slot.child) {
		return failure(
			"stale_realtime_session",
			"stale_child",
			"The voice call belongs to another Codex child.",
		);
	}
	if (request.epoch !== slot.epoch || request.correlation.epoch !== slot.epoch) {
		return failure(
			"stale_state",
			"prior_epoch",
			"The voice call belongs to a prior Codex child epoch.",
		);
	}
	try {
		host.identity.validator.assertCurrentEpoch(request.child, request.epoch);
	} catch (error) {
		return failureForIdentity(error);
	}
	if (
		request.logicalCall.threadId !== slot.coordinatorThreadId ||
		request.params.threadId !== slot.coordinatorThreadId ||
		request.params.threadId !== request.logicalCall.threadId ||
		request.logicalCall.namespace !== "archboard_voice" ||
		request.params.namespace !== "archboard_voice" ||
		request.logicalCall.tool !== "resolve_spoken_approval" ||
		request.params.tool !== "resolve_spoken_approval" ||
		request.logicalCall.manifestHash !== ARCHBOARD_VOICE_MANIFEST_SHA256 ||
		request.params.turnId !== request.logicalCall.turnId ||
		request.params.callId !== request.logicalCall.callId
	) {
		return failure(
			"ambiguous",
			"invalid_call",
			"The voice call does not match the reviewed resolver contract.",
		);
	}
	const coordinator = host.currentCoordinator();
	if (coordinator === null) {
		return failure(
			"stale_state",
			"not_ready",
			"The coordinator is no longer ready for spoken approval resolution.",
		);
	}
	if (coordinator.child !== slot.child) {
		return failure(
			"stale_realtime_session",
			"stale_child",
			"The coordinator child changed while the spoken approval was pending.",
		);
	}
	if (coordinator.epoch !== slot.epoch) {
		return failure(
			"stale_state",
			"prior_epoch",
			"The coordinator epoch changed while the spoken approval was pending.",
		);
	}
	if (coordinator.threadId !== slot.coordinatorThreadId) {
		return failure(
			"stale_state",
			"unknown_provenance",
			"The coordinator thread changed while the spoken approval was pending.",
		);
	}
	const realtime = host.currentRealtime();
	if (realtime === null || !sameRealtime(realtime, slot.realtime)) {
		return failure(
			"stale_realtime_session",
			"unknown_provenance",
			"The realtime session changed while the spoken approval was pending.",
		);
	}
	const time = host.currentTime();
	if (time === null || time >= slot.expiresAtMs) {
		return failure(
			"timeout",
			"expired",
			"The spoken approval gate has expired; use the visual approval surface.",
		);
	}
	const approval = host.approvalBroker.get(slot.requestId);
	if (approval === undefined) {
		return failure(
			"resolver_lost",
			"not_ready",
			"The pending approval is no longer known to the approval broker.",
		);
	}
	if (approval.state === "expired") {
		return failure(
			"timeout",
			"expired",
			"The visual approval expired before the spoken resolver ran.",
		);
	}
	if (approval.state !== "pending") {
		return failure("stale_state", "not_ready", "The approval is no longer pending.");
	}
	if (
		approval.approvalId !== slot.approvalId ||
		approval.family !== slot.approvalFamily ||
		approval.expiresAtMs !== slot.approvalExpiresAtMs ||
		!sameBinding(approval.binding, slot.approvalBinding)
	) {
		return failure(
			"changed_effect",
			"unknown_provenance",
			"The approval target or effect changed while the spoken gate was pending.",
		);
	}
	let eligibility;
	try {
		eligibility = host.approvalBroker.spokenEligibility(slot.requestId);
	} catch {
		return failure(
			"resolver_lost",
			"not_ready",
			"The approval broker could not revalidate the spoken approval.",
		);
	}
	if (!eligibility.eligible) {
		return failure(
			eligibility.reason === "stale_ownership" ? "changed_effect" : "ambiguous",
			eligibility.reason === "stale_ownership" ? "unknown_provenance" : "unsupported",
			"The pending approval is no longer eligible for spoken resolution.",
		);
	}
	if (requireTurn) {
		const expectedTurn = slot.classifierTurnId ?? slot.startedTurnId;
		if (expectedTurn !== null && request.logicalCall.turnId !== expectedTurn) {
			return failure(
				"ambiguous",
				"invalid_call",
				"The resolver call did not come from the classifier turn.",
			);
		}
	}
	return null;
}

import type {
	ApprovalSnapshot,
	CodexApprovalBroker,
	SpokenApprovalEffectPresentation,
} from "@/runtime/codex-approvals";
import { ArchboardContextSchema, type ArchboardContext } from "@/runtime/codex-instructions";
import type {
	SpokenApprovalArmInput,
	SpokenApprovalFallbackReason,
} from "@/runtime/codex-spoken-approval/lib/contract";
import type { IdentityAuthority } from "@/shared/codex-workbench-identity";
import type { RealtimeCorrelation, RealtimeTranscriptRecord } from "@/shared/codex-realtime-host";
import type { ChildEpoch, ChildId, ThreadId } from "@/shared/codex-workbench-identity";
import { CODEX_SPOKEN_GATE_EXPIRY_MS } from "@/shared/timing/timing";
import {
	failure,
	failureForIdentity,
	oneLine,
	recordKey,
	safeErrorMessage,
	sameBinding,
	sameRealtime,
	sameSpokenEffectPresentation,
	validSequence,
	type CallValidationFailure,
} from "@/runtime/codex-spoken-approval/lib/validation-primitives";

interface CoordinatorIdentity {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
}

interface ValidationHost {
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

type ArmValidationResult =
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

/**
 * A refused arm, naming the fallback reason the caller reports to the person.
 * @param reason - Why the gate cannot be armed.
 * @returns The refusal.
 */
function invalid(reason: SpokenApprovalFallbackReason): ArmValidationResult {
	return { ok: false, reason };
}

/** The one-line fields an arm request carries, once each has been checked. */
interface ArmInputText {
	readonly effectSummary: string;
	readonly operationId: string;
	readonly clientUserMessageId: string;
}

/**
 * The arm request's one-line text fields. Each is bounded and single-line because it is spoken
 * aloud and correlated by exact value; anything else is refused as bad context.
 * @param input - The arm request.
 * @returns The checked fields, or null when any is not a bounded one-line value.
 */
function armInputText(input: SpokenApprovalArmInput): ArmInputText | null {
	try {
		return {
			effectSummary: oneLine(input.effectSummary, "effect summary"),
			operationId: oneLine(input.classifier.operationId, "classifier operation id"),
			clientUserMessageId: oneLine(
				input.classifier.clientUserMessageId,
				"classifier client message id",
			),
		};
	} catch {
		return null;
	}
}

/** The host state an arm runs against, or the refusal that stops it. */
type ArmHostState =
	| {
			readonly ok: true;
			readonly coordinator: CoordinatorIdentity;
			readonly realtime: RealtimeCorrelation;
	  }
	| { readonly ok: false; readonly result: ArmValidationResult };

/**
 * The coordinator and voice session an arm must run against: both must exist, the voice session
 * must be the one the request names, and the coordinator must still be on the current epoch.
 * @param host - The validation host.
 * @param input - The arm request.
 * @returns The host state, or the refusal.
 */
function armHostState(host: ValidationHost, input: SpokenApprovalArmInput): ArmHostState {
	const coordinator = host.currentCoordinator();
	if (coordinator === null) {
		return { ok: false, result: invalid("coordinator_unavailable") };
	}
	const realtime = host.currentRealtime();
	if (realtime === null || !sameRealtime(realtime, input.realtime)) {
		return { ok: false, result: invalid("realtime_unavailable") };
	}
	try {
		host.identity.validator.assertCurrentEpoch(coordinator.child, coordinator.epoch);
	} catch {
		return { ok: false, result: invalid("stale_state") };
	}
	return { ok: true, coordinator, realtime };
}

/** The approval an arm is for, or the refusal that stops it. */
type ArmApproval =
	| { readonly ok: true; readonly approval: ApprovalSnapshot }
	| { readonly ok: false; readonly result: ArmValidationResult };

/**
 * The pending approval an arm is for. Only a pending command-execution approval on the
 * coordinator's own child and epoch may be spoken; everything else falls back to the visual
 * surface rather than being resolved by voice.
 * @param host - The validation host.
 * @param input - The arm request.
 * @param coordinator - The current coordinator.
 * @returns The approval, or the refusal.
 */
function armApproval(
	host: ValidationHost,
	input: SpokenApprovalArmInput,
	coordinator: CoordinatorIdentity,
): ArmApproval {
	let approval: ApprovalSnapshot | undefined;
	let eligibility: ReturnType<ValidationHost["approvalBroker"]["spokenEligibility"]>;
	try {
		approval = host.approvalBroker.get(input.requestId);
		eligibility = host.approvalBroker.spokenEligibility(input.requestId);
	} catch {
		return { ok: false, result: invalid("approval_unavailable") };
	}
	if (approval === undefined) {
		return { ok: false, result: invalid("approval_unavailable") };
	}
	const reason = spokenArmRefusal(approval, eligibility, coordinator);
	return reason === null ? { ok: true, approval } : { ok: false, result: invalid(reason) };
}

/**
 * Whether an approval belongs to the coordinator's own child and epoch.
 * @param approval - The approval.
 * @param coordinator - The current coordinator.
 * @returns True when both match.
 */
function sameCoordinatorEpoch(
	approval: ApprovalSnapshot,
	coordinator: CoordinatorIdentity,
): boolean {
	return approval.child === coordinator.child && approval.epoch === coordinator.epoch;
}

/**
 * Why an approval may not have a spoken gate armed on it: it is not pending, not eligible, not a
 * command execution, or not on the coordinator's own child and epoch. Only a command execution is
 * ever resolved by voice; everything else is answered on the visual surface.
 * @param approval - The approval the arm is for.
 * @param eligibility - What the broker says about spoken resolution.
 * @param coordinator - The current coordinator.
 * @returns The fallback reason, or null when the approval may be armed.
 */
function spokenArmRefusal(
	approval: ApprovalSnapshot,
	eligibility: ReturnType<ValidationHost["approvalBroker"]["spokenEligibility"]>,
	coordinator: CoordinatorIdentity,
): SpokenApprovalFallbackReason | null {
	if (!eligibility.eligible || approval.state !== "pending") {
		return eligibility.reason === "not_pending" ? "approval_unavailable" : "not_eligible";
	}
	if (approval.family !== "command_execution") {
		return "not_eligible";
	}
	return sameCoordinatorEpoch(approval, coordinator) ? null : "stale_state";
}

/**
 * The effect presentation the person was actually read, refused unless it describes exactly this
 * approval and says exactly what the arm request claims was said aloud.
 * @param host - The validation host.
 * @param input - The arm request.
 * @param approval - The pending approval.
 * @param effectSummary - The summary the arm request claims was spoken.
 * @returns The presentation, or null when it does not match.
 */
function armPresentation(
	host: ValidationHost,
	input: SpokenApprovalArmInput,
	approval: ApprovalSnapshot,
	effectSummary: string,
): SpokenApprovalEffectPresentation | null {
	let presentation: SpokenApprovalEffectPresentation;
	try {
		presentation = host.approvalBroker.spokenEffectPresentation(input.requestId);
	} catch {
		return null;
	}
	const matches =
		sameSpokenEffectPresentation(presentation, approval) &&
		presentation.effectSummary === effectSummary;
	return matches ? presentation : null;
}

/**
 * Validate a request to arm the spoken approval gate: the request's own fields, the host state it
 * runs against, the approval it is for, and the effect that was actually read aloud. Every
 * refusal names the fallback reason the caller reports, because a spoken gate that cannot be armed
 * must send the person to the visual surface rather than fail silently.
 * @param host - The validation host.
 * @param input - The arm request.
 * @returns The validated arm, or the refusal.
 */
function validateArm(host: ValidationHost, input: SpokenApprovalArmInput): ArmValidationResult {
	const text = armInputText(input);
	if (text === null) {
		return invalid("invalid_context");
	}
	if (!validSequence(input.effectPrompt.sequence)) {
		return invalid("invalid_effect_prompt");
	}
	const state = armHostState(host, input);
	if (!state.ok) {
		return state.result;
	}
	const approval = armApproval(host, input, state.coordinator);
	if (!approval.ok) {
		return approval.result;
	}
	const presentation = armPresentation(host, input, approval.approval, text.effectSummary);
	if (presentation === null) {
		return invalid("invalid_effect_prompt");
	}
	return validateArmContext(host, input, {
		effectSummary: presentation.effectSummary,
		operationId: text.operationId,
		clientUserMessageId: text.clientUserMessageId,
		approval: approval.approval,
		coordinator: state.coordinator,
		realtime: state.realtime,
	});
}

/** What the arm has already established by the time its context is checked. */
interface ArmContextValues {
	readonly effectSummary: string;
	readonly operationId: string;
	readonly clientUserMessageId: string;
	readonly approval: ApprovalSnapshot;
	readonly coordinator: CoordinatorIdentity;
	readonly realtime: RealtimeCorrelation;
}

/**
 * Whether the classifier context names exactly this operation, child, coordinator thread and
 * voice session. The classifier speaks on the coordinator's behalf, so a context that names
 * anything else would let one conversation's approval be resolved from another.
 * @param context - The decoded classifier context.
 * @param values - What the arm has established.
 * @returns True when every field matches.
 */
function armContextMatches(context: ArchboardContext, values: ArmContextValues): boolean {
	const operation = context.operation;
	const checks = [
		operation.id !== null,
		operation.id === values.operationId,
		operation.kind === "spoken_approval_classifier",
		operation.rpc === "turn/start",
		operation.outcome === null,
		context.child.id === values.coordinator.child,
		context.child.epoch === values.coordinator.epoch,
		context.coordinator.threadId === values.coordinator.threadId,
		context.coordinator.realtimeSessionId === values.realtime.sessionId,
	];
	return checks.every((matched) => matched);
}

/**
 * The transcript record of the effect prompt: the assistant's own final utterance of exactly the
 * effect summary. The gate is armed against that utterance, so anything else means the person was
 * not asked what Archboard thinks they were asked.
 * @param records - The transcript records.
 * @param input - The arm request.
 * @param effectSummary - The summary that must have been spoken.
 * @returns The prompt record, or null when no record matches.
 */
function armPromptRecord(
	records: readonly RealtimeTranscriptRecord[],
	input: SpokenApprovalArmInput,
	effectSummary: string,
): RealtimeTranscriptRecord | null {
	const prompt = records.find(
		(record) =>
			sameRealtime(record, input.realtime) &&
			record.itemId === input.effectPrompt.itemId &&
			record.sequence === input.effectPrompt.sequence,
	);
	if (prompt === undefined) {
		return null;
	}
	const matches =
		prompt.role === "assistant" &&
		prompt.status === "final" &&
		prompt.text.length > 0 &&
		prompt.text === effectSummary;
	return matches ? prompt : null;
}

/**
 * Why one transcript record means the gate must not be armed: it has no usable sequence, or it
 * came after the effect prompt, where another assistant utterance means the person was asked
 * something else and anything the person said means they have already answered. An interrupted
 * record is the exception: it is the person cutting the prompt short, not answering it.
 * @param record - The transcript record.
 * @param prompt - The effect prompt record.
 * @returns The fallback reason, or null when the record is part of the baseline.
 */
function baselineRecordRefusal(
	record: RealtimeTranscriptRecord,
	prompt: RealtimeTranscriptRecord,
): SpokenApprovalFallbackReason | null {
	if (!validSequence(record.sequence)) {
		return "stale_state";
	}
	if (record.sequence <= prompt.sequence) {
		return null;
	}
	if (record.role === "assistant") {
		return "assistant_only";
	}
	return record.status === "interrupted" ? null : "user_already_spoke";
}

/** The transcript baseline an arm is taken against, or the refusal that stops it. */
type ArmBaseline =
	| { readonly ok: true; readonly keys: ReadonlySet<string> }
	| { readonly ok: false; readonly result: ArmValidationResult };

/**
 * The transcript as it stood when the gate was armed. Nothing may have been said after the effect
 * prompt: another assistant utterance would mean the person was asked something else, and anything
 * the person said would mean they have already answered.
 * @param records - The transcript records.
 * @param input - The arm request.
 * @param prompt - The effect prompt record.
 * @returns The baseline record keys, or the refusal.
 */
function armBaseline(
	records: readonly RealtimeTranscriptRecord[],
	input: SpokenApprovalArmInput,
	prompt: RealtimeTranscriptRecord,
): ArmBaseline {
	const keys = new Set<string>();
	for (const record of records) {
		if (!sameRealtime(record, input.realtime)) {
			continue;
		}
		const reason = baselineRecordRefusal(record, prompt);
		if (reason !== null) {
			return { ok: false, result: invalid(reason) };
		}
		keys.add(recordKey(record));
	}
	return { ok: true, keys };
}

/**
 * When the spoken gate expires: the sooner of the approval's own expiry and the gate's fixed
 * window, so voice never holds an approval open longer than the approval itself.
 * @param host - The validation host.
 * @param values - What the arm has established.
 * @returns The expiry, or the refusal when time is unknown or already past it.
 */
function armExpiry(
	host: ValidationHost,
	values: ArmContextValues,
):
	| { readonly ok: true; readonly expiresAtMs: number }
	| { readonly ok: false; readonly result: ArmValidationResult } {
	const time = host.currentTime();
	if (time === null || !Number.isFinite(values.approval.expiresAtMs)) {
		return { ok: false, result: invalid("stale_state") };
	}
	const expiresAtMs = Math.min(values.approval.expiresAtMs, time + CODEX_SPOKEN_GATE_EXPIRY_MS);
	if (time >= expiresAtMs) {
		return { ok: false, result: invalid("timeout") };
	}
	return { ok: true, expiresAtMs };
}

/** The transcript and the effect prompt inside it, or the refusal that stops the arm. */
type ArmTranscript =
	| {
			readonly ok: true;
			readonly records: readonly RealtimeTranscriptRecord[];
			readonly prompt: RealtimeTranscriptRecord;
	  }
	| { readonly ok: false; readonly result: ArmValidationResult };

/**
 * Read the transcript and find the effect prompt in it. Both are needed together: the prompt is
 * what the gate is armed against, and the transcript around it is the baseline.
 * @param host - The validation host.
 * @param input - The arm request.
 * @param effectSummary - The summary that must have been spoken.
 * @returns The transcript and prompt, or the refusal.
 */
function armTranscript(
	host: ValidationHost,
	input: SpokenApprovalArmInput,
	effectSummary: string,
): ArmTranscript {
	let records: readonly RealtimeTranscriptRecord[];
	try {
		records = host.transcript();
	} catch {
		return { ok: false, result: invalid("realtime_unavailable") };
	}
	const prompt = armPromptRecord(records, input, effectSummary);
	return prompt === null
		? { ok: false, result: invalid("invalid_effect_prompt") }
		: { ok: true, records, prompt };
}

/**
 * Validate the classifier context and transcript behind an arm: the context must name this
 * conversation, the effect must have been read aloud, nothing may have been said since, and the
 * gate must still have time to run.
 * @param host - The validation host.
 * @param input - The arm request.
 * @param values - What the arm has already established.
 * @returns The validated arm, or the refusal.
 */
function validateArmContext(
	host: ValidationHost,
	input: SpokenApprovalArmInput,
	values: ArmContextValues,
): ArmValidationResult {
	const parsedContext = ArchboardContextSchema.safeParse(input.classifier.context);
	if (!parsedContext.success || !armContextMatches(parsedContext.data, values)) {
		return invalid("invalid_context");
	}
	const transcript = armTranscript(host, input, values.effectSummary);
	if (!transcript.ok) {
		return transcript.result;
	}
	const baseline = armBaseline(transcript.records, input, transcript.prompt);
	if (!baseline.ok) {
		return baseline.result;
	}
	const expiry = armExpiry(host, values);
	if (!expiry.ok) {
		return expiry.result;
	}
	return {
		ok: true,
		effectSummary: values.effectSummary,
		operationId: values.operationId,
		clientUserMessageId: values.clientUserMessageId,
		approval: values.approval,
		coordinator: values.coordinator,
		realtime: values.realtime,
		context: parsedContext.data,
		baselineRecordKeys: baseline.keys,
		expiresAtMs: expiry.expiresAtMs,
	};
}

export {
	type CoordinatorIdentity,
	type ValidationHost,
	type ArmValidationResult,
	sameRealtime,
	recordKey,
	sameBinding,
	safeErrorMessage,
	oneLine,
	validSequence,
	type CallValidationFailure,
	failure,
	failureForIdentity,
	validateArm,
};
export { validateResolverCall } from "@/runtime/codex-spoken-approval/lib/resolver-validation";

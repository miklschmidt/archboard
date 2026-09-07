import type { BrowserSchemas, BrowserSpokenApproval } from "@/shared/codex-browser-model";
import type { ApprovalOwnerView } from "@/runtime/codex-approvals";
import type {
	SpokenApprovalFallbackReason,
	SpokenApprovalSnapshot,
} from "@/runtime/codex-spoken-approval";
import type {
	CodexCoordinatorProjectionInput,
	CodexVoiceProjectionInput,
} from "@/server/codex-workbench/lib/projection-contract";

type SpokenApprovalModel = Pick<BrowserSchemas, "BrowserSpokenApprovalSchema">;
type SpokenFallbackState = Extract<
	BrowserSpokenApproval["state"],
	"expired" | "visual_fallback" | "outcome_unknown" | "stale_session"
>;

/** The owner facts joined for one spoken approval, before a state is chosen. */
interface SpokenApprovalParts {
	readonly approval: BrowserSpokenApproval["approval"];
	readonly gate: BrowserSpokenApproval["gate"];
	readonly capturedUserFinal: BrowserSpokenApproval["capturedUserFinal"];
	readonly settlement: BrowserSpokenApproval["settlement"];
}

/**
 * Whether an owner's command approval is the one the spoken gate armed for.
 * @param approval The owner's approval snapshot.
 * @param snapshot The spoken gate snapshot.
 * @returns True when identity, generation and effect all match.
 */
function matchesSpokenApproval(
	approval: ApprovalOwnerView["snapshot"],
	snapshot: SpokenApprovalSnapshot,
): boolean {
	return (
		approval.family === "command_execution" &&
		approval.approvalId === snapshot.approvalId &&
		approval.child === snapshot.child &&
		approval.epoch === snapshot.epoch &&
		approval.binding.effect === snapshot.effectFingerprint
	);
}

/**
 * The approval the spoken gate refers to, when exactly one owner approval matches it.
 * @param snapshot The spoken gate snapshot.
 * @param approvals The owner's approvals.
 * @returns The joined approval identity, or null.
 */
function joinedSpokenApproval(
	snapshot: SpokenApprovalSnapshot,
	approvals: readonly ApprovalOwnerView[],
): BrowserSpokenApproval["approval"] {
	if (snapshot.requestId === null) return null;
	const matches = approvals.filter((owner) => owner.snapshot.requestId === snapshot.requestId);
	if (matches.length !== 1) return null;
	const approval = matches[0]!.snapshot;
	if (!matchesSpokenApproval(approval, snapshot)) return null;
	return {
		requestId: approval.requestId,
		approvalId: approval.approvalId,
		threadId: approval.threadId,
		binding: {
			child: approval.binding.child,
			epoch: approval.binding.epoch,
			target: approval.binding.target,
			effect: approval.binding.effect,
		},
	};
}

/**
 * A sequence or timestamp the browser can order by.
 * @param value The owner's number, if any.
 * @returns True for a non-negative safe integer.
 */
function isOrdinal(value: number | null): value is number {
	return value !== null && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Text that says something once trimmed.
 * @param value The owner's text, if any.
 * @returns True for a non-blank string.
 */
function isNonBlank(value: string | null): value is string {
	return value !== null && value.trim().length > 0;
}

/**
 * The effect the gate bound to, when the owner recorded all of it.
 * @param snapshot The spoken gate snapshot.
 * @returns The effect fields of the gate, or null.
 */
function spokenGateEffect(
	snapshot: SpokenApprovalSnapshot,
): Pick<
	NonNullable<BrowserSpokenApproval["gate"]>,
	"effectSummary" | "effectFingerprint" | "effectPrompt"
> | null {
	if (
		!isNonBlank(snapshot.effectSummary) ||
		!isNonBlank(snapshot.effectFingerprint) ||
		snapshot.effectPromptItemId === null ||
		!isOrdinal(snapshot.effectPromptSequence)
	)
		return null;
	return {
		effectSummary: snapshot.effectSummary,
		effectFingerprint: snapshot.effectFingerprint,
		effectPrompt: {
			itemId: snapshot.effectPromptItemId,
			sequence: snapshot.effectPromptSequence,
		},
	};
}

/**
 * The gate a spoken approval is armed behind, when the owner recorded all of it.
 * @param snapshot The spoken gate snapshot.
 * @returns The gate, or null.
 */
function spokenGate(snapshot: SpokenApprovalSnapshot): BrowserSpokenApproval["gate"] {
	const effect = spokenGateEffect(snapshot);
	if (
		effect === null ||
		snapshot.coordinatorThreadId === null ||
		snapshot.realtimeSessionId === null ||
		!isOrdinal(snapshot.expiresAtMs)
	)
		return null;
	return {
		coordinatorThreadId: snapshot.coordinatorThreadId,
		realtimeSessionId: snapshot.realtimeSessionId,
		...effect,
		expiresAtMs: snapshot.expiresAtMs,
	};
}

/**
 * The final user utterance the gate captured, when the owner recorded all of it.
 * @param snapshot The spoken gate snapshot.
 * @returns The captured utterance, or null.
 */
function capturedSpokenUserFinal(
	snapshot: SpokenApprovalSnapshot,
): BrowserSpokenApproval["capturedUserFinal"] {
	if (
		snapshot.finalUserItemId === null ||
		!isOrdinal(snapshot.finalUserSequence) ||
		snapshot.finalUserText === null ||
		snapshot.finalUserText.length === 0
	)
		return null;
	return {
		itemId: snapshot.finalUserItemId,
		sequence: snapshot.finalUserSequence,
		text: snapshot.finalUserText,
	};
}

/**
 * The settlement of the gate's own command approval, when the owner recorded one.
 * @param snapshot The spoken gate snapshot.
 * @returns The settlement, or null.
 */
function spokenSettlement(snapshot: SpokenApprovalSnapshot): BrowserSpokenApproval["settlement"] {
	if (snapshot.settlement === null) return null;
	if (
		snapshot.settlement.requestId !== snapshot.requestId ||
		snapshot.settlement.family !== "command_execution"
	)
		return null;
	return {
		state: snapshot.settlement.state,
		outcome: snapshot.settlement.outcome,
		reason: snapshot.settlement.reason,
	};
}

const FALLBACK_STATE_BY_REASON: Record<
	Exclude<SpokenApprovalFallbackReason, "resolver_lost">,
	SpokenFallbackState
> = {
	timeout: "expired",
	changed_effect: "stale_session",
	stale_realtime_session: "stale_session",
	stale_state: "stale_session",
	approval_unavailable: "visual_fallback",
	not_eligible: "visual_fallback",
	coordinator_unavailable: "visual_fallback",
	realtime_unavailable: "visual_fallback",
	invalid_context: "visual_fallback",
	invalid_effect_prompt: "visual_fallback",
	user_already_spoke: "visual_fallback",
	missing_user_final: "visual_fallback",
	assistant_only: "visual_fallback",
	ambiguous: "visual_fallback",
	classifier_lost: "visual_fallback",
	child_exit: "visual_fallback",
	disposed: "visual_fallback",
};

/**
 * The browser state a fallback reason presents as; a lost resolver is unknown
 * only while no settlement says otherwise.
 * @param reason The owner's fallback reason.
 * @param settlement The settlement, if any.
 * @returns The browser fallback state.
 */
function browserFallbackState(
	reason: SpokenApprovalFallbackReason,
	settlement: BrowserSpokenApproval["settlement"],
): SpokenFallbackState {
	if (reason === "resolver_lost")
		return settlement === null || settlement.outcome === "outcome_unknown"
			? "outcome_unknown"
			: "visual_fallback";
	return FALLBACK_STATE_BY_REASON[reason];
}

/**
 * Validate and freeze one spoken approval presentation.
 * @param model The browser schema owner.
 * @param parts The joined owner facts.
 * @param state The browser state to present.
 * @param reason The fallback reason to present, if any.
 * @returns The validated spoken approval.
 */
function presentSpokenApproval(
	model: SpokenApprovalModel,
	parts: SpokenApprovalParts,
	state: BrowserSpokenApproval["state"],
	reason: SpokenApprovalFallbackReason | null,
): BrowserSpokenApproval {
	const browserReason: BrowserSpokenApproval["reason"] = reason;
	return model.BrowserSpokenApprovalSchema.parse({
		kind: "spoken_approval",
		state,
		approval: parts.approval,
		gate: parts.gate,
		capturedUserFinal: parts.capturedUserFinal,
		settlement: parts.settlement,
		reason: browserReason,
	});
}

/**
 * The presentation for owner state the browser cannot trust as current.
 * @param model The browser schema owner.
 * @param parts The joined owner facts.
 * @returns A stale-session spoken approval.
 */
function staleSpokenApproval(
	model: SpokenApprovalModel,
	parts: SpokenApprovalParts,
): BrowserSpokenApproval {
	return presentSpokenApproval(model, parts, "stale_session", "stale_state");
}

/**
 * The presentation for a gate that reached resolution without a usable user utterance.
 * @param model The browser schema owner.
 * @param parts The joined owner facts.
 * @returns A visual-fallback spoken approval with no captured utterance.
 */
function missingUserFinalSpokenApproval(
	model: SpokenApprovalModel,
	parts: SpokenApprovalParts,
): BrowserSpokenApproval {
	return presentSpokenApproval(
		model,
		{ ...parts, capturedUserFinal: null },
		"visual_fallback",
		"missing_user_final",
	);
}

/**
 * The presentation of no spoken approval at all.
 * @param model The browser schema owner.
 * @returns An idle spoken approval.
 */
function idleSpokenApproval(model: SpokenApprovalModel): BrowserSpokenApproval {
	return model.BrowserSpokenApprovalSchema.parse({
		kind: "spoken_approval",
		state: "idle",
		approval: null,
		gate: null,
		capturedUserFinal: null,
		settlement: null,
		reason: null,
	});
}

/**
 * Join the owner facts a spoken approval is presented from.
 * @param snapshot The spoken gate snapshot.
 * @param approvals The owner's approvals.
 * @returns The joined parts.
 */
function spokenApprovalParts(
	snapshot: SpokenApprovalSnapshot,
	approvals: readonly ApprovalOwnerView[],
): SpokenApprovalParts {
	return {
		approval: joinedSpokenApproval(snapshot, approvals),
		gate: spokenGate(snapshot),
		capturedUserFinal: capturedSpokenUserFinal(snapshot),
		settlement: spokenSettlement(snapshot),
	};
}

/**
 * Whether the owner's settlement, when it has one, projected exactly.
 * @param snapshot The spoken gate snapshot.
 * @param parts The joined owner facts.
 * @returns True when there is no settlement or it projected.
 */
function settlementExact(snapshot: SpokenApprovalSnapshot, parts: SpokenApprovalParts): boolean {
	return snapshot.settlement === null || parts.settlement !== null;
}

/**
 * Whether the joined facts name one approval behind one gate that the current
 * coordinator thread and realtime session still belong to.
 * @param snapshot The spoken gate snapshot.
 * @param parts The joined owner facts.
 * @param coordinator The coordinator projection input.
 * @param voice The voice projection input.
 * @returns True when the spoken core is exact.
 */
function exactSpokenCore(
	snapshot: SpokenApprovalSnapshot,
	parts: SpokenApprovalParts,
	coordinator: CodexCoordinatorProjectionInput,
	voice: CodexVoiceProjectionInput,
): boolean {
	return (
		parts.approval !== null &&
		parts.gate !== null &&
		settlementExact(snapshot, parts) &&
		coordinator.threadId === parts.gate.coordinatorThreadId &&
		voice.generation?.browserSessionId === parts.gate.realtimeSessionId
	);
}

/**
 * Whether the captured user utterance came after the effect prompt it answers.
 * @param parts The joined owner facts.
 * @returns True when a captured utterance follows the gate's effect prompt.
 */
function userFinalAfterPrompt(parts: SpokenApprovalParts): boolean {
	return (
		parts.gate !== null &&
		parts.capturedUserFinal !== null &&
		parts.capturedUserFinal.sequence > parts.gate.effectPrompt.sequence
	);
}

/**
 * Present a gate that is waiting for the person to speak.
 * @param model The browser schema owner.
 * @param parts The joined owner facts.
 * @param snapshot The spoken gate snapshot.
 * @param exact Whether the spoken core is exact.
 * @returns The spoken approval.
 */
function projectSpokenAwaitingUser(
	model: SpokenApprovalModel,
	parts: SpokenApprovalParts,
	snapshot: SpokenApprovalSnapshot,
	exact: boolean,
): BrowserSpokenApproval {
	if (!exact || parts.capturedUserFinal !== null || snapshot.reason !== null)
		return staleSpokenApproval(model, parts);
	return presentSpokenApproval(model, parts, "armed", null);
}

/**
 * Present a gate that heard the person and is classifying or resolving.
 * @param model The browser schema owner.
 * @param parts The joined owner facts.
 * @param snapshot The spoken gate snapshot.
 * @param exact Whether the spoken core is exact.
 * @returns The spoken approval.
 */
function projectSpokenResolving(
	model: SpokenApprovalModel,
	parts: SpokenApprovalParts,
	snapshot: SpokenApprovalSnapshot,
	exact: boolean,
): BrowserSpokenApproval {
	if (!exact || snapshot.reason !== null) return staleSpokenApproval(model, parts);
	if (!userFinalAfterPrompt(parts)) return missingUserFinalSpokenApproval(model, parts);
	return presentSpokenApproval(model, parts, "resolving", null);
}

/**
 * Present a gate whose approval settled from the spoken verdict.
 * @param model The browser schema owner.
 * @param parts The joined owner facts.
 * @param snapshot The spoken gate snapshot.
 * @param exact Whether the spoken core is exact.
 * @returns The spoken approval.
 */
function projectSpokenSettled(
	model: SpokenApprovalModel,
	parts: SpokenApprovalParts,
	snapshot: SpokenApprovalSnapshot,
	exact: boolean,
): BrowserSpokenApproval {
	if (!exact || snapshot.reason !== null || parts.settlement === null)
		return staleSpokenApproval(model, parts);
	if (!userFinalAfterPrompt(parts)) return missingUserFinalSpokenApproval(model, parts);
	return presentSpokenApproval(model, parts, "settled", null);
}

/**
 * Present a gate whose resolver was lost: the verdict may or may not have landed.
 * @param model The browser schema owner.
 * @param parts The joined owner facts.
 * @param state The fallback state chosen for the lost resolver.
 * @param exact Whether the spoken core is exact.
 * @returns The spoken approval.
 */
function projectSpokenResolverLost(
	model: SpokenApprovalModel,
	parts: SpokenApprovalParts,
	state: SpokenFallbackState,
	exact: boolean,
): BrowserSpokenApproval {
	if (!exact) return staleSpokenApproval(model, parts);
	if (!userFinalAfterPrompt(parts)) return missingUserFinalSpokenApproval(model, parts);
	return presentSpokenApproval(model, parts, state, "resolver_lost");
}

/**
 * Present a gate the owner handed back to the visual card.
 * @param model The browser schema owner.
 * @param parts The joined owner facts.
 * @param snapshot The spoken gate snapshot.
 * @param exact Whether the spoken core is exact.
 * @returns The spoken approval.
 */
function projectSpokenFallback(
	model: SpokenApprovalModel,
	parts: SpokenApprovalParts,
	snapshot: SpokenApprovalSnapshot,
	exact: boolean,
): BrowserSpokenApproval {
	if (snapshot.reason === null) return staleSpokenApproval(model, parts);
	const state = browserFallbackState(snapshot.reason, parts.settlement);
	if (state === "expired" && !exact) return staleSpokenApproval(model, parts);
	if (snapshot.reason === "resolver_lost")
		return projectSpokenResolverLost(model, parts, state, exact);
	return presentSpokenApproval(model, parts, state, snapshot.reason);
}

/**
 * Project the spoken-approval gate for the browser, presenting owner state the
 * browser cannot trust as stale rather than guessing.
 * @param model The browser schema owner.
 * @param snapshot The spoken gate snapshot.
 * @param approvals The owner's approvals.
 * @param coordinator The coordinator projection input.
 * @param voice The voice projection input.
 * @returns The validated spoken approval.
 */
export function projectSpokenApproval(
	model: SpokenApprovalModel,
	snapshot: SpokenApprovalSnapshot,
	approvals: readonly ApprovalOwnerView[],
	coordinator: CodexCoordinatorProjectionInput,
	voice: CodexVoiceProjectionInput,
): BrowserSpokenApproval {
	const parts = spokenApprovalParts(snapshot, approvals);
	const exact = exactSpokenCore(snapshot, parts, coordinator, voice);
	switch (snapshot.state) {
		case "idle":
			return idleSpokenApproval(model);
		case "awaiting_user":
			return projectSpokenAwaitingUser(model, parts, snapshot, exact);
		case "settled":
			return projectSpokenSettled(model, parts, snapshot, exact);
		case "visual_fallback":
			return projectSpokenFallback(model, parts, snapshot, exact);
		default:
			return projectSpokenResolving(model, parts, snapshot, exact);
	}
}

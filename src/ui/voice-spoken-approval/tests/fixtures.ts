// Fixtures for the spoken approval tests: a command execution approval, its
// ordinary card, and the spoken owner's states, every identity minted through
// the real authorities.

import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import { createCodexBrowserModel } from "@/shared/codex-browser-model";
import type { BrowserApproval, BrowserSpokenApproval } from "@/shared/codex-browser-model";
import { parseRealtimeItemId, parseRealtimeSessionId } from "@/shared/codex-realtime-host";
import type { VoiceSpokenApprovalInput } from "@/ui/voice-spoken-approval";
import type {
	WorkbenchApprovalStatus,
	WorkbenchOrdinaryApprovalCard,
} from "@/ui/workbench-approvals/contracts";

const NOW = 1_799_000_000_000;

type CommandApproval = Extract<BrowserApproval, { readonly approvalKind: "command_execution" }>;
type SpokenIdentity = NonNullable<BrowserSpokenApproval["approval"]>;
type SpokenGate = NonNullable<BrowserSpokenApproval["gate"]>;
type CapturedUserFinal = NonNullable<BrowserSpokenApproval["capturedUserFinal"]>;

const authorities = createIdentityAuthorities();
const model = createCodexBrowserModel(authorities);
const { decoder, issuer, validator } = authorities.identity;

const REQUEST_ID = model.JsonRpcRequestIdSchema.parse(issuer.mintJsonRpcRequestId());
const SECOND_REQUEST_ID = model.JsonRpcRequestIdSchema.parse(issuer.mintJsonRpcRequestId());
const APPROVAL_ID = model.ApprovalIdSchema.parse(decoder.adoptApprovalId("approval-spoken-1"));
const STALE_APPROVAL_ID = model.ApprovalIdSchema.parse(decoder.adoptApprovalId("approval-stale"));
const THREAD_ID = model.ThreadIdSchema.parse(decoder.adoptThreadId("thread-workhorse-1"));
const STALE_THREAD_ID = model.ThreadIdSchema.parse(decoder.adoptThreadId("thread-stale"));
const COORDINATOR_THREAD_ID = model.ThreadIdSchema.parse(
	decoder.adoptThreadId("thread-coordinator-1"),
);
const CHILD = model.ChildIdSchema.parse(validator.childId);
const EPOCH = model.ChildEpochSchema.parse(validator.epoch);
const ITEM_ID = parseRealtimeItemId("item-user-1");
const PROMPT_ID = parseRealtimeItemId("item-effect-prompt");
const SESSION_ID = parseRealtimeSessionId("realtime-session-1");

const PENDING_STATUS: WorkbenchApprovalStatus = Object.freeze({
	phase: "pending",
	label: "Waiting for your decision",
	detail: "The host is waiting for a response.",
	recovery: null,
	decision: null,
	delivery: null,
	terminal: false,
	authority: "live",
	authorityReason: null,
	resumable: false,
});

/**
 * A pending command execution approval, with overrides.
 * @param overrides Fields to change.
 * @returns The approval.
 */
function commandApproval(overrides: Partial<CommandApproval> = {}): CommandApproval {
	const base: CommandApproval = {
		kind: "approval",
		approvalKind: "command_execution",
		requestId: REQUEST_ID,
		threadId: THREAD_ID,
		turnId: null,
		itemId: null,
		approvalId: APPROVAL_ID,
		expiresAtMs: NOW + 60_000,
		lifecycle: { state: "pending", decision: null, outcome: null, reason: null },
		binding: {
			child: CHILD,
			epoch: EPOCH,
			link: "pane primary to workhorse one",
			target: "workhorse command execution",
			effect: "run bun test for the selected module",
		},
		spoken: { eligible: true, reason: "eligible" },
		reason: "The command needs approval.",
		command: "bun test src/ui/voice-spoken-approval/tests",
		availableDecisions: ["accept", "decline"],
	};
	return Object.freeze({ ...base, ...overrides });
}

/** What the card fixture may vary. */
interface CardOptions {
	readonly request?: BrowserApproval;
	readonly status?: WorkbenchApprovalStatus;
	readonly spokenDetail?: string;
	readonly spokenEligible?: boolean;
}

/**
 * The card's spoken presentation for one approval.
 * @param request The approval.
 * @param options Fields to vary.
 * @returns The spoken presentation.
 */
function cardSpoken(
	request: BrowserApproval,
	options: CardOptions,
): WorkbenchOrdinaryApprovalCard["spoken"] {
	return Object.freeze({
		eligible: options.spokenEligible ?? request.spoken.eligible,
		label: request.spoken.eligible ? "Spoken approval available" : "Visual only",
		detail: options.spokenDetail ?? `Host reason: ${request.spoken.reason}`,
	});
}

/**
 * The ordinary card for one approval.
 * @param options Fields to vary.
 * @returns The card.
 */
function ordinaryCard(options: CardOptions = {}): WorkbenchOrdinaryApprovalCard {
	const request = options.request ?? commandApproval();
	return Object.freeze({
		kind: "ordinary",
		key: `ordinary:${String(request.requestId)}`,
		family: request.approvalKind,
		title: "Command execution approval",
		summary: "Run the focused module test.",
		request,
		identity: Object.freeze([
			{ label: "Request", value: String(request.requestId), technical: true },
			{ label: "Thread", value: String(request.threadId), technical: true },
		]),
		broker: Object.freeze([
			{ label: "Broker child", value: String(request.binding.child), technical: true },
			{ label: "Broker epoch", value: String(request.binding.epoch), technical: true },
		]),
		effect: Object.freeze([
			{ label: "Target", value: request.binding.target, technical: false },
			{ label: "Effect", value: request.binding.effect, technical: false },
		]),
		fields: Object.freeze([]),
		links: Object.freeze([]),
		offers: Object.freeze([]),
		spoken: cardSpoken(request, options),
		status: options.status ?? PENDING_STATUS,
		expiresAtMs: request.expiresAtMs,
		notices: Object.freeze([]),
	});
}

/**
 * The spoken owner's identity for the fixture approval, with overrides.
 * @param overrides Fields to change.
 * @returns The identity.
 */
function spokenIdentity(overrides: Partial<SpokenIdentity> = {}): SpokenIdentity {
	return Object.freeze({
		requestId: REQUEST_ID,
		approvalId: APPROVAL_ID,
		threadId: THREAD_ID,
		binding: {
			child: CHILD,
			epoch: EPOCH,
			target: "workhorse command execution",
			effect: "run bun test for the selected module",
		},
		...overrides,
	});
}

/**
 * The spoken gate for the fixture approval, with overrides.
 * @param overrides Fields to change.
 * @returns The gate.
 */
function spokenGate(overrides: Partial<SpokenGate> = {}): SpokenGate {
	return Object.freeze({
		coordinatorThreadId: COORDINATOR_THREAD_ID,
		realtimeSessionId: SESSION_ID,
		effectSummary: "Run the focused module test.",
		effectFingerprint: "run bun test for the selected module",
		effectPrompt: { itemId: PROMPT_ID, sequence: 10 },
		expiresAtMs: NOW + 30_000,
		...overrides,
	});
}

/**
 * The captured final user utterance, with overrides.
 * @param overrides Fields to change.
 * @returns The utterance.
 */
function capturedUserFinal(overrides: Partial<CapturedUserFinal> = {}): CapturedUserFinal {
	return Object.freeze({
		itemId: ITEM_ID,
		sequence: 12,
		text: "Approve that command.",
		...overrides,
	});
}

const REASONS_BY_STATE: Partial<
	Record<BrowserSpokenApproval["state"], BrowserSpokenApproval["reason"]>
> = {
	expired: "timeout",
	visual_fallback: "classifier_lost",
	outcome_unknown: "resolver_lost",
	stale_session: "stale_state",
};

const CAPTURING_STATES: ReadonlySet<BrowserSpokenApproval["state"]> = new Set([
	"resolving",
	"settled",
	"outcome_unknown",
]);

/**
 * The settlement one state carries.
 * @param state The state.
 * @returns The settlement, or null.
 */
function settlementFor(state: BrowserSpokenApproval["state"]): BrowserSpokenApproval["settlement"] {
	if (state !== "settled") {
		return null;
	}
	return {
		state: "settled",
		outcome: "delivered",
		reason: "The ordinary approval decision was delivered.",
	};
}

/**
 * The owner's identity and gate while a request is active.
 * @param active Whether the owner holds a request.
 * @returns The identity and gate, or nulls.
 */
function ownerHold(active: boolean): Pick<BrowserSpokenApproval, "approval" | "gate"> {
	return active
		? { approval: spokenIdentity(), gate: spokenGate() }
		: { approval: null, gate: null };
}

/**
 * The spoken owner in one state, with overrides.
 * @param state The state.
 * @param overrides Fields to change.
 * @returns The spoken approval.
 */
function spokenApproval(
	state: BrowserSpokenApproval["state"] = "idle",
	overrides: Partial<BrowserSpokenApproval> = {},
): BrowserSpokenApproval {
	return Object.freeze({
		kind: "spoken_approval",
		state,
		...ownerHold(state !== "idle"),
		capturedUserFinal: CAPTURING_STATES.has(state) ? capturedUserFinal() : null,
		settlement: settlementFor(state),
		reason: REASONS_BY_STATE[state] ?? null,
		...overrides,
	});
}

/**
 * A projection input, with overrides.
 * @param overrides Fields to change.
 * @returns The input.
 */
function input(overrides: Partial<VoiceSpokenApprovalInput> = {}): VoiceSpokenApprovalInput {
	return { card: ordinaryCard(), spokenApproval: spokenApproval(), ...overrides };
}

const spokenIdentities = Object.freeze({
	REQUEST_ID,
	SECOND_REQUEST_ID,
	APPROVAL_ID,
	STALE_APPROVAL_ID,
	THREAD_ID,
	STALE_THREAD_ID,
	CHILD,
	EPOCH,
	ITEM_ID,
	PROMPT_ID,
	SESSION_ID,
	COORDINATOR_THREAD_ID,
});

export {
	PENDING_STATUS,
	capturedUserFinal,
	commandApproval,
	input,
	ordinaryCard,
	spokenApproval,
	spokenGate,
	spokenIdentities,
	spokenIdentity,
};

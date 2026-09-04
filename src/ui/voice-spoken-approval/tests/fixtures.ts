import type {
	BrowserApproval,
	BrowserSpokenApproval,
} from "../../../shared/codex-browser-model/index.js";
import type {
	WorkbenchApprovalStatus,
	WorkbenchOrdinaryApprovalCard,
} from "../../workbench-approvals/index.js";
import type { VoiceSpokenApprovalInput } from "../index.js";

export const NOW = 1_799_000_000_000;

type CommandApproval = Extract<BrowserApproval, { readonly approvalKind: "command_execution" }>;
type SpokenIdentity = NonNullable<BrowserSpokenApproval["approval"]>;
type SpokenGate = NonNullable<BrowserSpokenApproval["gate"]>;
type CapturedUserFinal = NonNullable<BrowserSpokenApproval["capturedUserFinal"]>;

const REQUEST_ID = "request-spoken-1" as CommandApproval["requestId"];
const APPROVAL_ID = "approval-spoken-1" as NonNullable<CommandApproval["approvalId"]>;
const THREAD_ID = "thread-workhorse-1" as CommandApproval["threadId"];
const CHILD = "child-codex-1" as CommandApproval["binding"]["child"];
const EPOCH = "epoch-codex-1" as CommandApproval["binding"]["epoch"];
const ITEM_ID = "item-user-1" as CapturedUserFinal["itemId"];
const PROMPT_ID = "item-effect-prompt" as SpokenGate["effectPrompt"]["itemId"];
const SESSION_ID = "realtime-session-1" as SpokenGate["realtimeSessionId"];
const COORDINATOR_THREAD_ID = "thread-coordinator-1" as SpokenGate["coordinatorThreadId"];

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

export function commandApproval(overrides: Partial<CommandApproval> = {}): CommandApproval {
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

export function ordinaryCard(
	options: {
		readonly request?: BrowserApproval;
		readonly status?: WorkbenchApprovalStatus;
		readonly spokenDetail?: string;
		readonly spokenEligible?: boolean;
	} = {},
): WorkbenchOrdinaryApprovalCard {
	const request = options.request ?? commandApproval();
	return Object.freeze({
		kind: "ordinary",
		key: `ordinary:${request.requestId}`,
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
		spoken: Object.freeze({
			eligible: options.spokenEligible ?? request.spoken.eligible,
			label: request.spoken.eligible ? "Spoken approval available" : "Visual only",
			detail: options.spokenDetail ?? `Host reason: ${request.spoken.reason}`,
		}),
		status: options.status ?? PENDING_STATUS,
		expiresAtMs: request.expiresAtMs,
		notices: Object.freeze([]),
	});
}

export function spokenIdentity(overrides: Partial<SpokenIdentity> = {}): SpokenIdentity {
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

export function spokenGate(overrides: Partial<SpokenGate> = {}): SpokenGate {
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

export function capturedUserFinal(overrides: Partial<CapturedUserFinal> = {}): CapturedUserFinal {
	return Object.freeze({
		itemId: ITEM_ID,
		sequence: 12,
		text: "Approve that command.",
		...overrides,
	});
}

export function spokenApproval(
	state: BrowserSpokenApproval["state"] = "idle",
	overrides: Partial<BrowserSpokenApproval> = {},
): BrowserSpokenApproval {
	const active = state !== "idle";
	const captured =
		state === "resolving" || state === "settled" || state === "outcome_unknown"
			? capturedUserFinal()
			: null;
	const reasons: Partial<Record<BrowserSpokenApproval["state"], BrowserSpokenApproval["reason"]>> =
		{
			expired: "timeout",
			visual_fallback: "classifier_lost",
			outcome_unknown: "resolver_lost",
			stale_session: "stale_state",
		};
	const settlement: BrowserSpokenApproval["settlement"] =
		state === "settled"
			? {
					state: "settled",
					outcome: "delivered",
					reason: "The ordinary approval decision was delivered.",
				}
			: null;
	return Object.freeze({
		kind: "spoken_approval",
		state,
		approval: active ? spokenIdentity() : null,
		gate: active ? spokenGate() : null,
		capturedUserFinal: captured,
		settlement,
		reason: reasons[state] ?? null,
		...overrides,
	});
}

export function input(overrides: Partial<VoiceSpokenApprovalInput> = {}): VoiceSpokenApprovalInput {
	return {
		card: ordinaryCard(),
		spokenApproval: spokenApproval(),
		...overrides,
	};
}

export const spokenIdentities = {
	REQUEST_ID,
	APPROVAL_ID,
	THREAD_ID,
	CHILD,
	EPOCH,
	ITEM_ID,
	PROMPT_ID,
	SESSION_ID,
	COORDINATOR_THREAD_ID,
} as const;

export const pendingStatus = PENDING_STATUS;

import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserVoice,
} from "../../../shared/codex-browser-model/index.js";
import type {
	WorkbenchApprovalStatus,
	WorkbenchDynamicApprovalCard,
	WorkbenchOrdinaryApprovalCard,
} from "../../workbench-approvals/index.js";
import type {
	VoiceSpokenApprovalCapturedItem,
	VoiceSpokenApprovalGatePresentation,
	VoiceSpokenApprovalInput,
} from "../index.js";

export const NOW = 1_799_000_000_000;

type CommandApproval = Extract<BrowserApproval, { readonly approvalKind: "command_execution" }>;

const REQUEST_ID = "request-spoken-1" as CommandApproval["requestId"];
const APPROVAL_ID = "approval-spoken-1" as NonNullable<CommandApproval["approvalId"]>;
const THREAD_ID = "thread-workhorse-1" as CommandApproval["threadId"];
const CHILD = "child-codex-1" as CommandApproval["binding"]["child"];
const EPOCH = "epoch-codex-1" as CommandApproval["binding"]["epoch"];
const ITEM_ID = "item-user-1" as BrowserVoice["transcript"][number]["itemId"];
const PROMPT_ID = "item-effect-prompt" as BrowserVoice["transcript"][number]["itemId"];
const SESSION_ID = "realtime-session-1" as NonNullable<BrowserVoice["realtimeSessionId"]>;

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

export function dynamicCard(): WorkbenchDynamicApprovalCard {
	return {
		kind: "dynamic",
		key: "dynamic:one",
		tool: "send_message_to_thread",
		title: "Dynamic coordination approval",
		summary: "Send a message.",
		request: {} as BrowserDynamicApproval,
		identity: Object.freeze([{ label: "Call", value: "dynamic-call-1", technical: true }]),
		effect: Object.freeze([{ label: "Effect", value: "send one message", technical: false }]),
		offers: Object.freeze([]),
		spoken: Object.freeze({
			eligible: false,
			label: "Visual only",
			detail: "Dynamic coordination approvals are never spoken-eligible.",
		}),
		status: PENDING_STATUS,
		effectHash: `sha256:${"a".repeat(64)}`,
		toolResult: null,
		expiresAtMs: NOW + 60_000,
		notices: Object.freeze([]),
	};
}

export function capturedItem(
	overrides: Partial<VoiceSpokenApprovalCapturedItem> = {},
): VoiceSpokenApprovalCapturedItem {
	return Object.freeze({
		itemId: ITEM_ID,
		realtimeSessionId: SESSION_ID,
		sequence: 12,
		speaker: "user",
		text: "Approve that command.",
		final: true,
		...overrides,
	});
}

export function gate(
	state: VoiceSpokenApprovalGatePresentation["state"] = "armed",
	options: {
		readonly capturedItem?: VoiceSpokenApprovalCapturedItem | null;
		readonly reason?: VoiceSpokenApprovalGatePresentation["reason"];
		readonly expiresAtMs?: number;
		readonly identity?: Partial<
			Pick<VoiceSpokenApprovalGatePresentation, "requestId" | "approvalId" | "threadId">
		>;
		readonly sessionId?: NonNullable<BrowserVoice["realtimeSessionId"]>;
	} = {},
): VoiceSpokenApprovalGatePresentation {
	const reasons: Record<VoiceSpokenApprovalGatePresentation["state"], string | null> = {
		armed: null,
		expired: "expiry",
		resolving: null,
		visual_fallback: "ambiguous",
		outcome_unknown: "lost_result",
		stale_session: "stale_session",
	};
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
		coordinatorThreadId: "thread-coordinator-1",
		realtimeSessionId: options.sessionId ?? SESSION_ID,
		effectPrompt: { itemId: PROMPT_ID, sequence: 10 },
		capturedItem: options.capturedItem === undefined ? null : options.capturedItem,
		expiresAtMs: options.expiresAtMs ?? NOW + 30_000,
		state,
		reason: options.reason === undefined ? reasons[state] : options.reason,
		...options.identity,
	} as VoiceSpokenApprovalGatePresentation);
}

export function voice(
	items: readonly VoiceSpokenApprovalCapturedItem[] = [capturedItem()],
	overrides: Partial<BrowserVoice> = {},
): BrowserVoice {
	return Object.freeze({
		kind: "voice",
		state: "active",
		realtimeSessionId: SESSION_ID,
		transcript: items.map(({ realtimeSessionId: _session, ...item }) => Object.freeze(item)),
		delivery: null,
		reason: null,
		...overrides,
	});
}

export function input(overrides: Partial<VoiceSpokenApprovalInput> = {}): VoiceSpokenApprovalInput {
	return {
		card: ordinaryCard(),
		gate: null,
		voice: voice(),
		nowMs: NOW,
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
} as const;

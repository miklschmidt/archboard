// The agent's state in one line, for the agent dock: what it is doing or
// waiting on, since when, how far through its plan, what is queued behind it,
// and the one thing the person can do about it. Only the first rule that
// applies speaks, so the line never says two things at once. Pure.

import { AGENT_QUIET_MS } from "@archboard/timing";
import type { BrowserApproval } from "@archboard/agent-workbench/contract";
import type { BrowserDynamicApproval } from "@archboard/agent-workbench/contract";
import type { AgentPhase } from "#ui/rules/agent-setup/phase.ts";
import type { AgentView } from "#ui/state/surfaces/contracts.ts";
import { activityLabel, runSummary } from "#ui/rules/thread/activity-words.ts";
import type { ActivityItem } from "#ui/rules/runtime/messages.ts";
import type { ConversationItem, ConversationTurn } from "#ui/state/timeline/contract.ts";

/** How the line is lit. */
type StatusTone = "quiet" | "working" | "attention" | "failed";

/** The one control the line offers. */
type StatusAction = "stop" | "review" | "sign_in" | "cancel_sign_in" | "show" | null;

/** The agent's state in one line. */
interface AgentStatus {
	readonly tone: StatusTone;
	/** The first word or two: Working, Needs you, Done, Failed, Ready. */
	readonly headline: string;
	/** What it is on, or what it wants, or why not; null when the headline says it all. */
	readonly detail: string | null;
	/** When the running turn started, for the elapsed clock. */
	readonly sinceMs: number | null;
	/** When the last turn ended, for "4m ago". */
	readonly endedAtMs: number | null;
	/** How far through its plan. */
	readonly progress: { readonly done: number; readonly total: number } | null;
	readonly queued: number;
	/** A running turn has reported nothing new for a while. */
	readonly quiet: boolean;
	readonly action: StatusAction;
	/** The provider's sign-in page, while a sign-in waits on it. */
	readonly signInUrl: string | null;
}

/** What the agent says when it has nothing to say: it is there, and not on anything. */
const READY_HEADLINE = "Ready";

/**
 * Whether the agent has nothing to say. A dock shows no line for it: the
 * controls already say it can be talked to.
 * @param status The status.
 * @returns True when it is ready and on nothing.
 */
function isReady(status: AgentStatus): boolean {
	return status.tone === "quiet" && status.headline === READY_HEADLINE;
}

const BLANK: Omit<AgentStatus, "tone" | "headline"> = {
	detail: null,
	sinceMs: null,
	endedAtMs: null,
	progress: null,
	queued: 0,
	quiet: false,
	action: null,
	signInUrl: null,
};

/**
 * The approvals waiting on the person.
 * @param view The agent view.
 * @returns The pending ordinary and coordination approvals.
 */
function waitingApprovals(view: AgentView): (BrowserApproval | BrowserDynamicApproval)[] {
	const snapshot = view.snapshot;
	if (snapshot === null) return [];
	return [
		...snapshot.approvals.filter((approval) => approval.lifecycle.state === "pending"),
		...snapshot.dynamicApprovals.filter((approval) => approval.state === "pending"),
	];
}

/**
 * The approvals the person still has to know about: those waiting on a
 * decision, and those whose decision may not have taken effect — an unknown
 * outcome or a decision that was not delivered.
 * @param view The agent view.
 * @returns The approvals, ordinary first.
 */
function unsettledApprovals(view: AgentView): (BrowserApproval | BrowserDynamicApproval)[] {
	const snapshot = view.snapshot;
	if (snapshot === null) return [];
	return [
		...snapshot.approvals.filter(unsettled),
		...snapshot.dynamicApprovals.filter((approval) =>
			["pending", "outcome_unknown"].includes(approval.state),
		),
	];
}

/**
 * Whether an ordinary approval is still the person's concern.
 * @param approval The approval.
 * @returns True while it waits or its effect is in doubt.
 */
function unsettled(approval: BrowserApproval): boolean {
	const { lifecycle } = approval;
	if (lifecycle.state === "settled") return lifecycle.outcome === "not_delivered";
	return (
		lifecycle.state === "staged" ||
		lifecycle.state === "pending" ||
		lifecycle.state === "outcome_unknown"
	);
}

/** What each kind of approval asks, in a few words. */
const ASKS: Readonly<Record<BrowserApproval["approvalKind"], string>> = {
	command_execution: "Run a command",
	exec_command: "Run a command",
	file_change: "Change files",
	apply_patch: "Change files",
	user_input: "Answer a question",
	elicitation: "Provide information",
	permissions: "Grant permissions",
};

/**
 * What an approval asks, with its key detail.
 * @param approval The approval.
 * @returns The words.
 */
function askOf(approval: BrowserApproval | BrowserDynamicApproval): string {
	if (approval.kind === "dynamic_approval") return approval.effect.visualSummary;
	if (approval.approvalKind === "command_execution" && approval.command !== null) {
		return `${ASKS.command_execution}: ${approval.command}`;
	}
	return ASKS[approval.approvalKind];
}

/** What a running turn is doing when its latest item is not a row of work. */
const PHASE_WORDS: Readonly<
	Record<Exclude<ConversationItem["media"], ActivityItem["media"]> | "reasoning", string>
> = {
	prompt: "Reading your message",
	text: "Writing a reply",
	approval: "Planning",
	plan: "Planning",
	reasoning: "Thinking",
};

/** The items that are rows of work. */
const WORK_MEDIA: ReadonlySet<ConversationItem["media"]> = new Set([
	"reasoning",
	"command",
	"fileChange",
	"tool",
	"search",
	"compaction",
]);

/**
 * Whether an item is a row of work.
 * @param item The item.
 * @returns Whether it is.
 */
function isWork(item: ConversationItem): item is ActivityItem {
	return WORK_MEDIA.has(item.media);
}

/**
 * What a running turn is on now: its plan's current step, else its latest item.
 * @param turn The running turn.
 * @returns The words.
 */
function currentStep(turn: ConversationTurn): string {
	const planned = turn.plan?.steps.find((step) => step.status === "inProgress");
	if (planned !== undefined) return planned.step;
	const last = turn.items.at(-1);
	if (last === undefined) return PHASE_WORDS.prompt;
	return isWork(last) && last.media !== "reasoning" ? activityLabel(last) : PHASE_WORDS[last.media];
}

/**
 * How far through its plan a turn is.
 * @param turn The turn.
 * @returns Steps done and planned, or null without a plan.
 */
function progressOf(turn: ConversationTurn): AgentStatus["progress"] {
	const steps = turn.plan?.steps ?? [];
	if (steps.length === 0) return null;
	return { done: steps.filter((step) => step.status === "completed").length, total: steps.length };
}

/**
 * The line while a turn runs.
 * @param view The agent view.
 * @param turn The running turn.
 * @param now The clock.
 * @returns The status.
 */
function working(view: AgentView, turn: ConversationTurn, now: number): AgentStatus {
	const quietSince = view.lastProgressAtMs;
	return {
		...BLANK,
		tone: "working",
		headline: "Working",
		detail: currentStep(turn),
		sinceMs: turn.startedAtMs,
		progress: progressOf(turn),
		queued: view.snapshot?.queue.entries.length ?? 0,
		quiet: quietSince !== null && now - quietSince > AGENT_QUIET_MS,
		action: "stop",
	};
}

/**
 * The line once the last turn has ended.
 * @param turn The last turn.
 * @returns The status.
 */
function ended(turn: ConversationTurn): AgentStatus {
	const endedAtMs = turn.completedAtMs;
	if (turn.outcome === "failed") {
		return {
			...BLANK,
			tone: "failed",
			headline: "Failed",
			detail: turn.error?.message ?? null,
			endedAtMs,
			action: "show",
		};
	}
	const work = turn.items.filter(isWork);
	return {
		...BLANK,
		tone: "quiet",
		headline: turn.outcome === "interrupted" ? "Stopped" : "Done",
		detail: work.length === 0 ? null : runSummary(work),
		endedAtMs,
	};
}

/**
 * The line while the account stands between the person and the agent.
 * @param phase The phase.
 * @returns The status.
 */
function accountStatus(
	phase: Extract<AgentPhase, { readonly kind: "unavailable" | "signed_out" | "signing_in" }>,
): AgentStatus {
	switch (phase.kind) {
		case "unavailable":
			return { ...BLANK, tone: "failed", headline: "Codex is unavailable", detail: phase.reason };
		case "signed_out":
			return {
				...BLANK,
				tone: "quiet",
				headline: "Sign in to use the agent",
				detail: phase.failure,
				action: "sign_in",
			};
		default:
			return {
				...BLANK,
				tone: "attention",
				headline: "Finish signing in",
				detail: "on the ChatGPT page",
				action: "cancel_sign_in",
				signInUrl: phase.authUrl,
			};
	}
}

/**
 * The line while something stands between the person and the agent.
 * @param view The agent view.
 * @returns The status, or null when the agent is ready.
 */
function setupStatus(view: AgentView): AgentStatus | null {
	const { phase, step } = view.setup;
	switch (phase.kind) {
		case "connecting":
			return { ...BLANK, tone: "quiet", headline: "Connecting" };
		case "starting":
			return { ...BLANK, tone: "quiet", headline: "Starting Codex" };
		case "ready":
			return step === "link"
				? { ...BLANK, tone: "working", headline: "Starting a conversation" }
				: null;
		default:
			return accountStatus(phase);
	}
}

/**
 * The agent's state in one line.
 * @param view The agent view.
 * @param now The clock.
 * @returns The status.
 */
function agentStatus(view: AgentView, now: number): AgentStatus {
	const setup = setupStatus(view);
	if (setup !== null) return setup;
	const running = view.conversation.turns.findLast((turn) => turn.outcome === "running");
	const asked = askedStatus(view, running === undefined ? null : working(view, running, now));
	return asked ?? heldStatus(view) ?? conversationStatus(view, running, now);
}

/**
 * The line while the agent waits on a decision: what it asks, keeping the
 * running turn's clock, plan and queue, since the turn goes on around it.
 * @param view The agent view.
 * @param turn The running turn's line, or null.
 * @returns The status, or null when nothing waits on the person.
 */
function askedStatus(view: AgentView, turn: AgentStatus | null): AgentStatus | null {
	const [asked, ...more] = waitingApprovals(view);
	if (asked === undefined) return null;
	const others = more.length > 0 ? ` · ${more.length + 1} waiting` : "";
	return {
		...(turn ?? BLANK),
		tone: "attention",
		headline: "Needs you",
		detail: `${askOf(asked)}${others}`,
		action: "review",
	};
}

/**
 * The line while something the person sent did not arrive, or the last thing
 * they asked for could not be done: that outranks the conversation, which
 * does not hold it.
 * @param view The agent view.
 * @returns The status, or null when nothing went wrong.
 */
function heldStatus(view: AgentView): AgentStatus | null {
	const { held, failure } = view.setup;
	const stuck = held.find((message) => message.state === "failed" || message.state === "unknown");
	if (stuck !== undefined) {
		return {
			...BLANK,
			tone: "failed",
			headline: "Not sent",
			detail: stuck.reason ?? stuck.text,
			action: "show",
		};
	}
	if (failure === null) return null;
	return { ...BLANK, tone: "failed", headline: "Could not start", detail: failure, action: "show" };
}

/**
 * The line the conversation itself gives: why it cannot be read, the turn
 * running now, a message on its way, or how the last turn ended.
 * @param view The agent view.
 * @param running The turn running now — the newest, should Codex still hold an older one open.
 * @param now The clock.
 * @returns The status.
 */
function conversationStatus(
	view: AgentView,
	running: ConversationTurn | undefined,
	now: number,
): AgentStatus {
	const { turns, failure } = view.conversation;
	if (failure !== null) {
		return {
			...BLANK,
			tone: "failed",
			headline: "Can't read the conversation",
			detail: failure,
			action: "show",
		};
	}
	if (running !== undefined) return working(view, running, now);
	if (view.setup.held.some((message) => message.state === "sending")) {
		return { ...BLANK, tone: "working", headline: "Sending" };
	}
	const last = turns.at(-1);
	return last === undefined ? { ...BLANK, tone: "quiet", headline: READY_HEADLINE } : ended(last);
}

export {
	isReady,
	agentStatus,
	unsettledApprovals,
	waitingApprovals,
	type AgentStatus,
	type StatusAction,
	type StatusTone,
};

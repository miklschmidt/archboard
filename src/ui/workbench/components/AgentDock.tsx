// The agent, at the foot of the navigator column: its voice and its state.
// While voice is off the dock is calm: what the agent is on, when it is on
// anything, with its plan under it, and at the foot a key to talk and a key to
// the conversation, where the composer is. Nothing says that it is ready and
// that voice is off: the keys do. While voice is on the circle is its head,
// beside the state, what it is on and the voice's own line with mute and
// subtitles, and the plan under them.

import { RiChat3Line, RiMicLine, RiMicOffLine } from "@remixicon/react";
import type { JSX } from "react";

import { AGENT_ELAPSED_TICK_MS, SHELL_AGE_TICK_MS } from "@/shared/timing/timing";
import { cn } from "@/ui/components/class-names";
import { useClock } from "@/ui/components/use-clock";
import { SubtitlesToggle } from "@/ui/voice-subtitles";
import { IconAction } from "@/ui/workbench/components/IconAction";
import { PlanSteps } from "@/ui/workbench/components/PlanSteps";
import { StatusAction, StatusLamp, Timing } from "@/ui/workbench/components/StatusParts";
import { useAudible } from "@/ui/workbench/components/TalkControl";
import {
	VOICE_WORDS,
	TalkKey,
	VoiceCircle,
	circleState,
} from "@/ui/workbench/components/VoiceCircle";
import type { AgentActions, AgentView, AgentVoiceView } from "@/ui/workbench/contracts";
import { agentStatus, isReady, type AgentStatus } from "@/ui/workbench/lib/agent-status";
import {
	DEMO_DOING,
	DEMO_SINCE_MS,
	DEMO_STEPS,
	DEMO_VOICE,
	VOICE_DEMO,
	shownSteps,
	stepsOf,
	type CardStep,
} from "@/ui/workbench/lib/plan-steps";

/** Where the words saying why voice cannot start are. */
const VOICE_PROBLEM_ID = "voice-problem";

/** Inputs for the dock. */
interface AgentDockProps {
	readonly view: AgentView;
	readonly actions: AgentActions;
	readonly panelOpen: boolean;
	/** Agent words arrived while the conversation was closed. */
	readonly unread: boolean;
	readonly onTogglePanel: () => void;
	readonly reducedMotion: boolean;
}

/**
 * The agent's state as the dock says it: the real one, or the demonstration's.
 * @param view The agent view.
 * @param now The clock.
 * @returns The state.
 */
function dockStatus(view: AgentView, now: number): AgentStatus {
	const status = agentStatus(view, now);
	// DEMONSTRATION: `?voiceDemo` shows an invented turn (lib/plan-steps.ts).
	return VOICE_DEMO
		? {
				...status,
				tone: "working",
				headline: "Working",
				detail: DEMO_DOING,
				sinceMs: DEMO_SINCE_MS,
			}
		: status;
}

/**
 * The steps the dock lists: the running turn's plan, none once it has ended.
 * @param view The agent view.
 * @returns The steps.
 */
function dockSteps(view: AgentView): readonly CardStep[] {
	if (VOICE_DEMO) return shownSteps(DEMO_STEPS);
	const running = view.conversation.turns.findLast((turn) => turn.outcome === "running");
	return running === undefined ? [] : shownSteps(stepsOf(running));
}

/**
 * The agent dock.
 * @param props The view, the actions and the conversation's state.
 * @returns The dock.
 */
function AgentDock(props: AgentDockProps): JSX.Element {
	const { view, actions } = props;
	const running = view.conversation.turns.some((turn) => turn.outcome === "running");
	const now = useClock(running || VOICE_DEMO ? AGENT_ELAPSED_TICK_MS : SHELL_AGE_TICK_MS, true);
	const status = dockStatus(view, now);
	const voice = VOICE_DEMO ? DEMO_VOICE : view.voice;
	const live = circleState(voice, useAudible(voice)) !== "off";
	const parts: DockParts = {
		status,
		now,
		actions,
		voice,
		steps: dockSteps(view),
		conversation: { open: props.panelOpen, unread: props.unread, onToggle: props.onTogglePanel },
	};
	return (
		<section
			data-slot="agent-dock"
			data-agent-tone={status.tone}
			aria-label="Agent"
			className="border-border bg-raised shadow-edge-up relative flex shrink-0 flex-col gap-3 border-t px-4 py-3"
		>
			{live ? <LiveDock {...parts} /> : <CalmDock {...parts} />}
		</section>
	);
}

/** What both layouts of the dock are made of. */
interface DockParts {
	readonly status: AgentStatus;
	readonly now: number;
	readonly actions: AgentActions;
	readonly voice: AgentVoiceView;
	readonly steps: readonly CardStep[];
	/** The way to the conversation. */
	readonly conversation: ConversationState;
}

/** Whether the conversation is open, whether words wait in it unread, and the toggle. */
interface ConversationState {
	readonly open: boolean;
	readonly unread: boolean;
	readonly onToggle: () => void;
}

/**
 * The dock while voice is off: what the agent is on, when it is on anything,
 * and at the foot the keys to talk and to type.
 * @param props What the dock is made of.
 * @returns The rows.
 */
function CalmDock(props: DockParts): JSX.Element {
	const { status, actions, voice } = props;
	return (
		<>
			<Activity status={status} now={props.now} actions={actions} />
			{props.steps.length > 0 && (
				<PlanSteps steps={props.steps} sinceMs={status.sinceMs} now={props.now} />
			)}
			<WideAction status={status} actions={actions} />
			{voice.problem !== null && <VoiceProblem problem={voice.problem} />}
			<div className="flex items-center gap-2">
				<TalkKey voice={voice} actions={actions} problemId={VOICE_PROBLEM_ID} />
				<ConversationToggle {...props.conversation} />
			</div>
		</>
	);
}

/**
 * The dock while voice is on: the circle at its head, beside the state, what
 * the agent is on and the voice's own line, with the plan under them.
 * @param props What the dock is made of.
 * @returns The rows.
 */
function LiveDock(props: DockParts): JSX.Element {
	const { status, actions, voice } = props;
	return (
		<>
			<div className="flex items-center gap-3">
				<VoiceCircle voice={voice} actions={actions} problemId={VOICE_PROBLEM_ID} />
				<div className="flex min-w-0 flex-1 flex-col">
					<Activity status={status} now={props.now} actions={actions} />
					<VoiceLine voice={voice} actions={actions} conversation={props.conversation} />
				</div>
			</div>
			{props.steps.length > 0 && (
				<PlanSteps
					steps={props.steps}
					sinceMs={status.sinceMs}
					now={props.now}
					className="pl-[76px]"
				/>
			)}
			<WideAction status={status} actions={actions} />
		</>
	);
}

/**
 * What the agent is on: its state and how long, and what it is doing. Nothing
 * while it is ready and on nothing.
 * @param props The status, the clock and the actions.
 * @param props.status The status.
 * @param props.now The clock.
 * @param props.actions The actions.
 * @returns The lines, or nothing.
 */
function Activity(props: {
	readonly status: AgentStatus;
	readonly now: number;
	readonly actions: AgentActions;
}): JSX.Element | null {
	const { status } = props;
	if (isReady(status)) return null;
	return (
		<div className="flex min-w-0 flex-col">
			<AgentLine status={status} now={props.now} actions={props.actions} />
			{status.detail !== null && (
				<p
					data-slot="agent-doing"
					className="text-control truncate font-normal"
					title={status.detail}
				>
					{status.detail}
				</p>
			)}
		</div>
	);
}

/**
 * Why voice cannot start.
 * @param props The problem.
 * @param props.problem The words.
 * @returns The line.
 */
function VoiceProblem(props: { readonly problem: string }): JSX.Element {
	return (
		<p
			id={VOICE_PROBLEM_ID}
			title={props.problem}
			className="text-body text-destructive flex h-6 items-center truncate"
		>
			{props.problem}
		</p>
	);
}

/**
 * The agent's state in a word with how long, and the control that state needs
 * when it is a small one.
 * @param props The status, the clock and the actions.
 * @param props.status The status.
 * @param props.now The clock.
 * @param props.actions The actions.
 * @returns The line.
 */
function AgentLine(props: {
	readonly status: AgentStatus;
	readonly now: number;
	readonly actions: AgentActions;
}): JSX.Element {
	const { status } = props;
	const small = status.action === "stop" || status.action === "review" || status.action === "show";
	return (
		<div data-slot="agent-status" data-tone={status.tone} className="flex h-6 items-center gap-2">
			<StatusLamp tone={status.tone} />
			<span className="text-control text-muted-foreground min-w-0 truncate font-medium">
				{status.headline}
			</span>
			<Timing status={status} now={props.now} />
			{status.queued > 0 && (
				<span className="text-body text-muted-foreground shrink-0 font-mono">+{status.queued}</span>
			)}
			<span className="flex-1" />
			{small && <StatusAction status={status} actions={props.actions} />}
		</div>
	);
}

/**
 * The control the state needs when it is a wide one: signing in.
 * @param props The status and the actions.
 * @param props.status The status.
 * @param props.actions The actions.
 * @returns The row, or nothing.
 */
function WideAction(props: {
	readonly status: AgentStatus;
	readonly actions: AgentActions;
}): JSX.Element | null {
	const { status } = props;
	if (status.action !== "sign_in" && status.action !== "cancel_sign_in") return null;
	return (
		<div className="flex justify-end">
			<StatusAction status={status} actions={props.actions} />
		</div>
	);
}

/**
 * The voice in a word, why it cannot start when it cannot, and mute and
 * subtitles while it is on, with the way to the conversation beside them.
 * @param props The voice, the actions and the conversation.
 * @param props.voice The voice.
 * @param props.actions The actions.
 * @param props.conversation The way to the conversation.
 * @returns The line.
 */
function VoiceLine(props: {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	readonly conversation: ConversationState;
}): JSX.Element {
	const { voice } = props;
	const state = circleState(voice, useAudible(voice));
	if (voice.problem !== null && state === "off") return <VoiceProblem problem={voice.problem} />;
	const on = state !== "off" && state !== "ending";
	return (
		<div className="flex h-6 items-center gap-1">
			<output
				aria-live="polite"
				className={cn(
					"text-control min-w-0 flex-1 truncate font-medium",
					on ? "text-primary-text" : "text-muted-foreground",
				)}
			>
				{VOICE_WORDS[state]}
			</output>
			{on && <LiveControls voice={voice} actions={props.actions} />}
			<ConversationToggle {...props.conversation} compact />
		</div>
	);
}

/**
 * Mute and subtitles, while voice is on.
 * @param props The voice and the actions.
 * @param props.voice The voice.
 * @param props.actions The actions.
 * @returns The controls.
 */
function LiveControls(props: {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
}): JSX.Element {
	const { voice, actions } = props;
	const muted = voice.stage === "muted";
	return (
		<>
			<IconAction
				label={muted ? "Unmute" : "Mute"}
				onClick={muted ? actions.unmute : actions.mute}
				disabled={voice.busy}
			>
				{muted ? <RiMicOffLine /> : <RiMicLine />}
			</IconAction>
			<SubtitlesToggle />
		</>
	);
}

/** The conversation's key beside Talk, shut, and pressed in with a gold mark under it. */
const KEY = "size-8 shrink-0 rounded-control! [&_svg]:size-4";
const KEY_OPEN =
	"bg-muted text-foreground shadow-pressed before:bg-primary-mark before:absolute before:inset-x-2 before:bottom-[3px] before:h-0.5 before:rounded-full";
/** The conversation's icon in the voice line, lit while it is open. */
const ICON_OPEN = "bg-sidebar-accent text-foreground";
const SHUT = "text-muted-foreground";
/** The dot for words waiting unread, on the key and on the icon. */
const DOT = "bg-primary pointer-events-none absolute size-1.5 rounded-full";

/**
 * How the conversation's control looks, by whether it is open and which form it takes.
 * @param open Whether the conversation is open.
 * @param compact Whether it is an icon in the voice line, not a key.
 * @returns The classes.
 */
function toggleClass(open: boolean, compact: boolean): string {
	if (compact) return open ? ICON_OPEN : SHUT;
	return cn(KEY, open ? KEY_OPEN : SHUT);
}

/**
 * The way to the conversation beside the navigator, which is where the composer
 * is, with a gold dot while words wait in it unread. Beside Talk it is a raised
 * key, pressed in with a gold mark under it while the conversation is open; in
 * the voice line it is a quiet icon like mute and subtitles, lit while it is open.
 * @param props Whether it is open, whether words wait, the toggle and its form.
 * @param props.open Whether it is open.
 * @param props.unread Whether words wait unread.
 * @param props.onToggle Open or close it.
 * @param props.compact Whether it is an icon in the voice line, not a key.
 * @returns The control.
 */
function ConversationToggle(
	props: ConversationState & { readonly compact?: boolean },
): JSX.Element {
	const { open } = props;
	const compact = props.compact === true;
	return (
		<IconAction
			variant={compact ? "ghost" : "outline"}
			label={open ? "Close the conversation" : "Open the conversation"}
			onClick={props.onToggle}
			className={toggleClass(open, compact)}
		>
			<RiChat3Line />
			{props.unread && !open && (
				<span
					aria-hidden="true"
					className={cn(DOT, compact ? "top-0.5 right-0.5" : "ring-card top-1 right-1 ring-2")}
				/>
			)}
		</IconAction>
	);
}

export { AgentDock, type AgentDockProps };

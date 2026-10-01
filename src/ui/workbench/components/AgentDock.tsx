// The agent, at the foot of the navigator column: one place for talking and
// typing to it. The voice circle is its head — press it to talk, press it
// again to end — and beside it the agent's name with its state, what it is on,
// and the voice's own line with mute and subtitles while voice is on. Under it
// the steps of its plan, and at the foot the composer, which opens the
// conversation right beside this column.

import { RiChat3Line, RiMicLine, RiMicOffLine } from "@remixicon/react";
import type { JSX } from "react";

import { AGENT_ELAPSED_TICK_MS, SHELL_AGE_TICK_MS } from "@/shared/timing/timing";
import { cn } from "@/ui/components/class-names";
import { useClock } from "@/ui/components/use-clock";
import { SubtitlesToggle } from "@/ui/voice-subtitles";
import { AgentComposer } from "@/ui/workbench/components/AgentComposer";
import { IconAction } from "@/ui/workbench/components/IconAction";
import { PlanSteps } from "@/ui/workbench/components/PlanSteps";
import { StatusAction, StatusLamp, Timing } from "@/ui/workbench/components/StatusParts";
import { useAudible } from "@/ui/workbench/components/TalkControl";
import { VOICE_WORDS, VoiceCircle, circleState } from "@/ui/workbench/components/VoiceCircle";
import type { AgentActions, AgentView, AgentVoiceView } from "@/ui/workbench/contracts";
import { agentStatus, type AgentStatus } from "@/ui/workbench/lib/agent-status";
import type { DraftStore } from "@/ui/workbench/lib/draft-store";
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
	readonly draft: DraftStore;
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
 * @param props The view, the actions, the draft and the conversation's state.
 * @returns The dock.
 */
function AgentDock(props: AgentDockProps): JSX.Element {
	const { view, actions } = props;
	const running = view.conversation.turns.some((turn) => turn.outcome === "running");
	const now = useClock(running || VOICE_DEMO ? AGENT_ELAPSED_TICK_MS : SHELL_AGE_TICK_MS, true);
	const status = dockStatus(view, now);
	const voice = VOICE_DEMO ? DEMO_VOICE : view.voice;
	const steps = dockSteps(view);
	return (
		<section
			data-slot="agent-dock"
			aria-label="Agent"
			className="border-border flex shrink-0 flex-col gap-3 border-t px-4 pt-4 pb-3"
		>
			<div className="flex items-center gap-3">
				<VoiceCircle voice={voice} actions={actions} problemId={VOICE_PROBLEM_ID} />
				<div className="flex min-w-0 flex-1 flex-col">
					<AgentLine status={status} now={now} actions={actions} />
					{status.detail !== null && (
						<p
							data-slot="agent-doing"
							className="text-control truncate font-normal"
							title={status.detail}
						>
							{status.detail}
						</p>
					)}
					<VoiceLine voice={voice} actions={actions} />
				</div>
			</div>
			{steps.length > 0 && (
				<PlanSteps steps={steps} sinceMs={status.sinceMs} now={now} className="pl-[76px]" />
			)}
			<WideAction status={status} actions={actions} />
			<div className="flex items-end gap-1">
				<AgentComposer
					draft={props.draft}
					context={view.context}
					running={running}
					onSend={actions.send}
				/>
				<ConversationToggle
					open={props.panelOpen}
					unread={props.unread}
					onToggle={props.onTogglePanel}
				/>
			</div>
		</section>
	);
}

/**
 * The agent's name, its state in a word with how long, and the control that
 * state needs when it is a small one.
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
			<h2 className="text-title shrink-0">Codex</h2>
			<StatusLamp tone={status.tone} />
			<span className="text-body text-muted-foreground min-w-0 truncate font-medium">
				{status.headline}
			</span>
			<Timing status={status} now={props.now} />
			{status.queued > 0 && (
				<span className="text-technical text-muted-foreground shrink-0 font-mono">
					+{status.queued}
				</span>
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
 * subtitles while it is on.
 * @param props The voice and the actions.
 * @param props.voice The voice.
 * @param props.actions The actions.
 * @returns The line.
 */
function VoiceLine(props: {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
}): JSX.Element {
	const { voice } = props;
	const state = circleState(voice, useAudible(voice));
	if (voice.problem !== null && state === "off") {
		return (
			<p
				id={VOICE_PROBLEM_ID}
				title={voice.problem}
				className="text-body text-destructive flex h-6 items-center truncate"
			>
				{voice.problem}
			</p>
		);
	}
	const on = state !== "off" && state !== "ending";
	return (
		<div className="flex h-6 items-center gap-1">
			<output
				aria-live="polite"
				className={cn(
					"text-body min-w-0 flex-1 truncate font-medium",
					on ? "text-primary-text" : "text-muted-foreground",
				)}
			>
				{VOICE_WORDS[state]}
			</output>
			{on && <LiveControls voice={voice} actions={props.actions} />}
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

/**
 * Open or close the conversation beside the navigator, with a dot while words
 * wait in it unread.
 * @param props Whether it is open, whether words wait, and the toggle.
 * @param props.open Whether it is open.
 * @param props.unread Whether words wait unread.
 * @param props.onToggle Open or close it.
 * @returns The control.
 */
function ConversationToggle(props: {
	readonly open: boolean;
	readonly unread: boolean;
	readonly onToggle: () => void;
}): JSX.Element {
	return (
		<span className="relative flex h-9 items-center">
			<IconAction
				label={props.open ? "Close the conversation" : "Open the conversation"}
				onClick={props.onToggle}
				className={cn(
					"size-7",
					props.open ? "text-foreground bg-sidebar-accent" : "text-muted-foreground",
				)}
			>
				<RiChat3Line />
			</IconAction>
			{props.unread && !props.open && (
				<span
					aria-hidden="true"
					className="bg-primary pointer-events-none absolute top-1.5 right-0.5 size-1.5 rounded-full"
				/>
			)}
		</span>
	);
}

export { AgentDock, type AgentDockProps };

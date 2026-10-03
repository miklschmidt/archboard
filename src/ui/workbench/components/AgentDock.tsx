// The agent, at the foot of the navigator column: its voice and its state.
// The dock is one grid in two layouts. While voice is off it is calm: what the
// agent is on, when it is on anything, with its plan under it, and at the foot a
// key to talk and a key to the conversation, where the composer is. Nothing says
// that it is ready and that voice is off: the keys do. While voice is on the
// circle is the head of the dock, beside the state, what the agent is on and the
// voice's own line with mute and subtitles, and the plan under them.
//
// Both layouts hold the same parts, which the grid places (app.css, [data-part]).
// So the Talk key turns into the circle, and the dock's motion plays every part
// from its old place to its new one (hooks/use-dock-motion.ts).

import { RiChat3Line, RiMicLine, RiMicOffLine } from "@remixicon/react";
import { useRef, type CSSProperties, type JSX } from "react";

import { AGENT_ELAPSED_TICK_MS, SHELL_AGE_TICK_MS } from "@/shared/timing/timing";
import { VOICE_MORPH_MS } from "@/shared/timing/voice";
import { cn } from "@/ui/components/class-names";
import { useClock } from "@/ui/components/use-clock";
import { SubtitlesToggle } from "@/ui/voice-subtitles";
import { useDockMotion } from "@/ui/workbench/hooks/use-dock-motion";
import { IconAction } from "@/ui/workbench/components/IconAction";
import { PlanSteps } from "@/ui/workbench/components/PlanSteps";
import { StatusAction, StatusLamp, Timing } from "@/ui/workbench/components/StatusParts";
import { useAudible } from "@/ui/workbench/components/TalkControl";
import { VOICE_WORDS, VoiceControl, circleState } from "@/ui/workbench/components/VoiceControl";
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
import { VOICE_DEMO_CYCLE, demoVoiceAt } from "@/ui/workbench/lib/voice-demo";

/** Where the words saying why voice cannot start are. */
const VOICE_PROBLEM_ID = "voice-problem";

/** How long the dock takes to turn between its layouts, for the stylesheet that eases them. */
const DOCK_STYLE: CSSProperties = { "--voice-morph-ms": `${VOICE_MORPH_MS}ms` };

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
 * The voice the dock shows: the real one, or the demonstration's.
 * @param view The agent view.
 * @param now The clock.
 * @returns The voice.
 */
function dockVoice(view: AgentView, now: number): AgentVoiceView {
	// DEMONSTRATION: `?voiceDemo` holds the voice speaking, `=cycle` walks its stages (lib/voice-demo.ts).
	if (VOICE_DEMO_CYCLE) return demoVoiceAt(now);
	return VOICE_DEMO ? DEMO_VOICE : view.voice;
}

/**
 * The dock's clock: it counts seconds while a turn runs or a demonstration moves,
 * and ticks slowly otherwise.
 * @param view The agent view.
 * @returns The time in milliseconds.
 */
function useDockClock(view: AgentView): number {
	const running = view.conversation.turns.some((turn) => turn.outcome === "running");
	const ticking = running || VOICE_DEMO || VOICE_DEMO_CYCLE;
	return useClock(ticking ? AGENT_ELAPSED_TICK_MS : SHELL_AGE_TICK_MS, true);
}

/**
 * The agent dock.
 * @param props The view, the actions and the conversation's state.
 * @returns The dock.
 */
function AgentDock(props: AgentDockProps): JSX.Element {
	const { view, actions } = props;
	const now = useDockClock(view);
	const status = dockStatus(view, now);
	const voice = dockVoice(view, now);
	const live = circleState(voice, useAudible(voice)) !== "off";
	const steps = dockSteps(view);
	const dock = useRef<HTMLElement>(null);
	useDockMotion(dock, live, props.reducedMotion);
	return (
		<section
			ref={dock}
			data-slot="agent-dock"
			data-live={live}
			data-agent-tone={status.tone}
			aria-label="Agent"
			style={DOCK_STYLE}
			className="border-border bg-raised shadow-edge-up relative shrink-0 border-t px-4 py-3"
		>
			<VoiceControl
				voice={voice}
				actions={actions}
				problemId={VOICE_PROBLEM_ID}
				reducedMotion={props.reducedMotion}
			/>
			<Activity status={status} now={now} actions={actions} />
			<VoiceRow live={live} voice={voice} actions={actions} />
			<DockPlan steps={steps} sinceMs={status.sinceMs} now={now} />
			<WideAction status={status} actions={actions} />
			<ConversationToggle
				open={props.panelOpen}
				unread={props.unread}
				onToggle={props.onTogglePanel}
				compact={live}
			/>
		</section>
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
		<div data-part="status" className="flex min-w-0 flex-col">
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
 * What the dock says about the voice: its line while it is on, and why it cannot
 * start when it is off and cannot.
 * @param props Whether voice is on, the voice and the actions.
 * @param props.live Whether voice is on.
 * @param props.voice The voice.
 * @param props.actions The actions.
 * @returns The line, or nothing.
 */
function VoiceRow(props: {
	readonly live: boolean;
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
}): JSX.Element | null {
	const { voice } = props;
	if (props.live) return <VoiceLine voice={voice} actions={props.actions} />;
	return voice.problem === null ? null : <VoiceProblem problem={voice.problem} />;
}

/**
 * The agent's plan, under what it is on. Nothing while it has none.
 * @param props The steps, when the turn began and the clock.
 * @param props.steps The steps.
 * @param props.sinceMs When the turn began, or null.
 * @param props.now The clock.
 * @returns The plan, or nothing.
 */
function DockPlan(props: {
	readonly steps: readonly CardStep[];
	readonly sinceMs: number | null;
	readonly now: number;
}): JSX.Element | null {
	if (props.steps.length === 0) return null;
	return (
		<div data-part="plan">
			<PlanSteps steps={props.steps} sinceMs={props.sinceMs} now={props.now} />
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
			data-part="problem"
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
		<div data-part="wide" className="flex justify-end">
			<StatusAction status={status} actions={props.actions} />
		</div>
	);
}

/**
 * The voice in a word, with mute and subtitles, while it is on.
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
	const on = state !== "off" && state !== "ending";
	const lit = on && state !== "muted";
	return (
		<div data-part="words" className="flex h-6 items-center gap-1">
			<output
				aria-live="polite"
				className={cn(
					"text-control min-w-0 flex-1 truncate font-medium",
					lit ? "text-primary-text" : "text-muted-foreground",
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
 * It is one control in both, and the dock's grid moves it between them.
 * @param props Whether it is open, whether words wait, the toggle and its form.
 * @param props.open Whether it is open.
 * @param props.unread Whether words wait unread.
 * @param props.onToggle Open or close it.
 * @param props.compact Whether it is an icon in the voice line, not a key.
 * @returns The control.
 */
function ConversationToggle(props: {
	readonly open: boolean;
	readonly unread: boolean;
	readonly onToggle: () => void;
	readonly compact: boolean;
}): JSX.Element {
	const { open, compact } = props;
	return (
		<div data-part="chat" className="flex items-center justify-center">
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
		</div>
	);
}

export { AgentDock, type AgentDockProps };

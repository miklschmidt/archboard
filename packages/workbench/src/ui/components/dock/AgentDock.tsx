// The agent, at the foot of the navigator column: its voice and its state.
// The dock is one grid in two layouts. While voice is off it is calm: what the
// agent is on, when it is on anything, with its plan under it, and at the foot a
// key to talk and a key to the conversation, where the composer is. Nothing says
// that it is ready and that voice is off: the keys do. While voice is on the
// circle is the head of the dock, beside the state, what the agent is on and the
// voice's own line with mute and subtitles, and the plan under them.
//
// While the person wants subtitles and a voice box is on the page, the voice is not in the
// dock at all: the box over the pane's picture carries the orb, the voice's word, mute and
// the subtitles control, and the dock is calm again, with the Talk key turned into a key
// that ends voice. Turning subtitles off flies the orb back and the key becomes the circle.
// The dock asks the orb's stage whether the box is there, so it never gives the voice up
// to a box that no pane draws. While the dock is off screen, as in a fullscreen presentation,
// the box carries the voice whatever the person wants of subtitles.
//
// Both layouts hold the same parts, which the grid places (app.css, [data-part]).
// The page lists them in the order the eye reads them in each layout, so the
// keyboard follows the eye. The voice control and the conversation's control keep
// their places in the page in both, so the Talk key turns into the circle and keeps
// the keyboard on it. The parts around them are drawn again on their side of the
// circle. The dock's motion plays every part from its old place to its new one
// (hooks/dock/use-dock-motion.ts).

import { RiChat3Line } from "@remixicon/react";
import { useRef, type CSSProperties, type JSX } from "react";

import { AGENT_ELAPSED_TICK_MS, SHELL_AGE_TICK_MS } from "@archboard/timing";
import { DOCK_WASH_MS, VOICE_MORPH_MS, VOICE_SEAT_OUT_MS } from "@archboard/timing/voice";
import { cn } from "@archboard/ui-kit/components";
import { useClock } from "@archboard/ui-kit/time";
import { useOrbOffered, useOrbPlacement } from "#ui/hooks/orb/use-orb-stage.ts";
import { SubtitlesToggle } from "#ui/components/subtitles/SubtitlesToggle.tsx";
import { useVoiceBoxed } from "#ui/hooks/subtitles/use-voice-boxed.ts";
import { useDockMotion } from "#ui/hooks/dock/use-dock-motion.ts";
import { ConversationList } from "#ui/components/panel/ConversationList.tsx";
import { IconAction } from "#ui/components/dock/IconAction.tsx";
import { MuteAction } from "#ui/components/voice/MuteAction.tsx";
import { PlanSteps } from "#ui/components/dock/PlanSteps.tsx";
import { StatusAction, StatusLamp, Timing } from "#ui/components/dock/StatusParts.tsx";
import { VoiceControl } from "#ui/components/voice/VoiceControl.tsx";
import type { AgentActions, AgentView, AgentVoiceView } from "#ui/state/surfaces/contracts.ts";
import { useCircleState } from "#ui/hooks/dock/use-circle-state.ts";
import { agentStatus, isReady, type AgentStatus } from "#ui/rules/dock/agent-status.ts";
import { VOICE_WORDS } from "#ui/rules/dock/circle-state.ts";
import { shownSteps, stepsOf, type CardStep } from "#ui/rules/dock/plan-steps.ts";

/** Where the words saying why voice cannot start are. */
const VOICE_PROBLEM_ID = "voice-problem";

/**
 * How long the dock takes to turn between its layouts, to let go of an empty seat and to light up
 * while the agent works, for the stylesheet that eases them.
 */
const DOCK_STYLE: CSSProperties = {
	"--voice-morph-ms": `${VOICE_MORPH_MS}ms`,
	"--voice-seat-out-ms": `${VOICE_SEAT_OUT_MS}ms`,
	"--dock-wash-ms": `${DOCK_WASH_MS}ms`,
};

/** Inputs for the dock. */
interface AgentDockProps {
	readonly view: AgentView;
	readonly actions: AgentActions;
	readonly panelOpen: boolean;
	/** Agent words arrived while the conversation was closed. */
	readonly unread: boolean;
	readonly onTogglePanel: () => void;
	readonly reducedMotion: boolean;
	/** Whether the dock is off screen, as while a pane is presented fullscreen: the voice box then carries the voice. */
	readonly dockless: boolean;
}

/**
 * The steps the dock lists: the running turn's plan, none once it has ended.
 * @param view The agent view.
 * @returns The steps.
 */
function dockSteps(view: AgentView): readonly CardStep[] {
	const running = view.conversation.turns.findLast((turn) => turn.outcome === "running");
	return running === undefined ? [] : shownSteps(stepsOf(running));
}

/**
 * The dock's clock: every second while a turn runs, and slowly otherwise.
 * @param view The agent view.
 * @returns The time in milliseconds.
 */
function useDockClock(view: AgentView): number {
	const running = view.conversation.turns.some((turn) => turn.outcome === "running");
	return useClock(running ? AGENT_ELAPSED_TICK_MS : SHELL_AGE_TICK_MS, true);
}

/**
 * The agent dock.
 * @param props The view, the actions and the conversation's state.
 * @returns The dock.
 */
function AgentDock(props: AgentDockProps): JSX.Element {
	const { view, actions } = props;
	const { voice } = view;
	const now = useDockClock(view);
	const status = agentStatus(view, now);
	const on = useCircleState(voice) !== "off";
	// The voice is in the box over the picture, or at the head of the dock: the dock's layout is live in the second.
	const boxed = useVoiceBoxed(on, useOrbOffered("box"), props.dockless);
	const live = on && !boxed;
	const steps = dockSteps(view);
	const dock = useRef<HTMLElement>(null);
	useDockMotion(dock, live, props.reducedMotion);
	// After the dock's motion, not before: the orb leaves from where it was seen, and the motion
	// has just put the dock's circle back under it, where the layout it turned to has not.
	useOrbPlacement({
		home: boxed ? "box" : "dock",
		shown: on,
		reducedMotion: props.reducedMotion,
	});
	const slots = slotsOf(live, {
		activity: <Activity status={status} now={now} actions={actions} />,
		plan: <DockPlan steps={steps} sinceMs={status.sinceMs} now={now} />,
		wide: <WideAction status={status} actions={actions} />,
		problem: <VoiceProblem problem={voice.problem} />,
		line: <VoiceLine voice={voice} actions={actions} />,
	});
	return (
		<section
			ref={dock}
			data-slot="agent-dock"
			data-lit-by-orb=""
			data-live={live}
			data-boxed={boxed ? "" : undefined}
			data-agent-tone={status.tone}
			aria-label="Agent"
			style={DOCK_STYLE}
			className="border-border bg-raised shadow-edge-up relative shrink-0 border-t px-4 py-3"
		>
			{slots.head}
			<VoiceControl
				voice={voice}
				actions={actions}
				problemId={VOICE_PROBLEM_ID}
				reducedMotion={props.reducedMotion}
				boxed={boxed}
			/>
			{slots.beside}
			<ConversationToggle
				open={props.panelOpen}
				unread={props.unread}
				onToggle={props.onTogglePanel}
				compact={live}
			/>
			{slots.under}
			<ConversationList workhorses={view.snapshot?.workhorses} onPick={actions.showConversation} />
		</section>
	);
}

/** The dock's parts other than its two controls. */
interface DockParts {
	readonly activity: JSX.Element;
	readonly plan: JSX.Element;
	readonly wide: JSX.Element;
	readonly problem: JSX.Element;
	readonly line: JSX.Element;
}

/**
 * The parts before the voice control in the page, between it and the conversation's control, and
 * after that. Each slot keeps its place in the page whichever layout fills it.
 */
interface DockSlots {
	readonly head: JSX.Element | null;
	readonly beside: JSX.Element | null;
	readonly under: JSX.Element | null;
}

/**
 * Where each part goes in the page, so the page reads in the order the eye does. Calm: what the
 * agent is on, its plan and why voice cannot start, then the keys. Live: the circle, what the agent
 * is on, the voice's line with the conversation's icon at its end, then the plan.
 * @param live Whether the dock is in its live layout.
 * @param parts The parts.
 * @returns The slots.
 */
function slotsOf(live: boolean, parts: DockParts): DockSlots {
	if (!live) {
		const head = (
			<>
				{parts.activity}
				{parts.plan}
				{parts.wide}
				{parts.problem}
			</>
		);
		return { head, beside: null, under: null };
	}
	const beside = (
		<>
			{parts.activity}
			{parts.line}
		</>
	);
	const under = (
		<>
			{parts.plan}
			{parts.wide}
		</>
	);
	return { head: null, beside, under };
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
 * Why voice cannot start. Nothing while it can.
 * @param props The problem.
 * @param props.problem The words, or null.
 * @returns The line, or nothing.
 */
function VoiceProblem(props: { readonly problem: string | null }): JSX.Element | null {
	if (props.problem === null) return null;
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
	const state = useCircleState(voice);
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
	return (
		<>
			<MuteAction voice={voice} actions={actions} />
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
 * How the conversation's control looks, by whether it is open and which form it takes. Its colours
 * ease and its size does not: the dock measures where its parts settle the moment its layout turns,
 * so a part that was still shrinking then would leave the dock a few pixels short of that.
 * @param open Whether the conversation is open.
 * @param compact Whether it is an icon in the voice line, not a key.
 * @returns The classes.
 */
function toggleClass(open: boolean, compact: boolean): string {
	if (compact) return cn("transition-colors", open ? ICON_OPEN : SHUT);
	return cn("transition-colors", KEY, open ? KEY_OPEN : SHUT);
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

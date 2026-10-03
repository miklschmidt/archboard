// The voice, seen and controlled in one place: a circle at the agent dock's
// head. Pressing it starts voice — setting up whatever is missing first — and
// pressing it again ends it. While voice is off the circle holds a microphone;
// on its way, a turning ring; while it is on, a gold ring around the waveform,
// whose lines nearly fill the circle: each line is as tall as the circle is
// where it stands, under a round mask a little inside the ring, so at its peak
// a line ends on the circle's own curve.
//
// The waveform follows the model's measured output level while it speaks and
// breathes slowly while it listens. Nothing here listens to the microphone.

import { RiErrorWarningLine, RiMicLine } from "@remixicon/react";
import { useEffect, useRef, type CSSProperties, type JSX } from "react";

import { cn } from "@/ui/components/class-names";
import { useAudible } from "@/ui/workbench/components/TalkControl";
import type { AgentActions, AgentVoiceView } from "@/ui/workbench/contracts";

/** What the circle shows, from the voice's stage. */
type CircleState = "off" | "starting" | "listening" | "speaking" | "muted" | "ending";

/** The circle's diameter, its ring, and the gap between the ring and the lines' mask. */
const SIZE = 64;
const RING = 2;
const GAP = 3;
/** A line's width and the step from one line to the next. */
const LINE = 1.75;
const PITCH = 3.25;
/** How far past the circle a line reaches at its full height, for the mask to shape. */
const OVERSHOOT = 1.18;

/** The radius the lines are masked to. */
const RADIUS = SIZE / 2 - RING - GAP;
/** As many lines as fit across that circle. */
const COUNT = Math.floor((2 * RADIUS + PITCH - LINE) / PITCH);

/**
 * Each line, by its place across the circle: its full height, the circle's
 * chord where it stands and the overshoot, and where in its clock it starts.
 */
const LINES: readonly { readonly id: string; readonly style: CSSProperties }[] = Array.from(
	{ length: COUNT },
	(_, index) => {
		const offset = (index - (COUNT - 1) / 2) * PITCH;
		const chord = 2 * Math.sqrt(Math.max(RADIUS * RADIUS - offset * offset, 0));
		return {
			id: `line-${index}`,
			style: {
				width: LINE,
				height: chord * OVERSHOOT,
				animationDelay: `${((index * 37) % 17) * -0.083}s`,
			},
		};
	},
);

/** The lines' box: the masked circle. */
const LINES_STYLE: CSSProperties = { width: 2 * RADIUS, height: 2 * RADIUS, gap: PITCH - LINE };

/** What the circle shows for each stage of the voice, where the stage alone decides it. */
const STAGE_STATES: Partial<Readonly<Record<AgentVoiceView["stage"], CircleState>>> = {
	idle: "off",
	preparing: "starting",
	connecting: "starting",
	stopping: "ending",
	muted: "muted",
	speaking: "speaking",
};

/**
 * What the circle shows for a voice: its stage, else whether the model is
 * audible by its measured output, which is how a listening voice is heard to speak.
 * @param voice The voice.
 * @param audible Whether the model is audible now.
 * @returns The state.
 */
function circleState(voice: AgentVoiceView, audible: boolean): CircleState {
	return STAGE_STATES[voice.stage] ?? (audible ? "speaking" : "listening");
}

/** What pressing the circle does, said as its name. */
const CIRCLE_NAMES: Readonly<Record<CircleState, string>> = {
	off: "Talk",
	starting: "End voice",
	listening: "End voice",
	speaking: "End voice",
	muted: "End voice",
	ending: "Ending voice",
};

/** What the voice is doing, in a word, for the dock's voice line. */
const VOICE_WORDS: Readonly<Record<CircleState, string>> = {
	off: "Voice is off",
	starting: "Starting",
	listening: "Listening",
	speaking: "Speaking",
	muted: "Muted",
	ending: "Ending",
};

/**
 * The waveform: one line per step across the circle, each on its own clock.
 * @returns The lines.
 */
function Lines(): JSX.Element {
	return (
		<span aria-hidden="true" style={LINES_STYLE} className="voice-lines flex items-center">
			{LINES.map((line) => (
				<i key={line.id} className="voice-line block shrink-0 rounded-full" style={line.style} />
			))}
		</span>
	);
}

/** Inputs for the circle. */
interface VoiceCircleProps {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	/** Where the words saying why voice cannot start are, for the circle they describe. */
	readonly problemId: string;
}

/** The circle's box, which carries the output level its lines rise with. */
const CIRCLE_SIZE: CSSProperties = { width: SIZE, height: SIZE };

/**
 * The voice circle.
 * @param props The voice, the actions and where its problem is said.
 * @returns The circle, as a button.
 */
function VoiceCircle(props: VoiceCircleProps): JSX.Element {
	const { voice, actions } = props;
	const state = circleState(voice, useAudible(voice));
	const off = state === "off";
	const circle = useRef<HTMLButtonElement>(null);
	// The level moves on every frame while the model speaks, so it is written
	// to the circle's style here rather than drawn through React.
	useEffect(() => {
		const { level } = voice;
		const draw = (): void => circle.current?.style.setProperty("--level", String(level.read()));
		draw();
		return level.subscribe(draw);
	}, [voice]);
	return (
		<button
			ref={circle}
			type="button"
			data-slot="voice-circle"
			data-voice-state={state}
			aria-label={CIRCLE_NAMES[state]}
			aria-describedby={voice.problem === null ? undefined : props.problemId}
			disabled={state === "ending" || voice.busy}
			onClick={off ? actions.talk : actions.endVoice}
			style={CIRCLE_SIZE}
			className={cn(
				"group/voice relative flex shrink-0 items-center justify-center rounded-full outline-none",
				"focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-(--sidebar)",
				off &&
					"border-border hover:border-primary-text bg-card shadow-raised active:shadow-pressed dark:bg-input/30 border-[1.5px] transition-colors",
			)}
		>
			<CircleFace state={state} problem={voice.problem !== null} />
		</button>
	);
}

/**
 * What the circle holds: the microphone while voice is off, else the ring and the lines.
 * @param props The state and whether voice could not start.
 * @param props.state What the circle shows.
 * @param props.problem Whether voice cannot start or failed.
 * @returns The face.
 */
function CircleFace(props: {
	readonly state: CircleState;
	readonly problem: boolean;
}): JSX.Element {
	if (props.state === "off") {
		return <OffMark problem={props.problem} />;
	}
	return (
		<>
			<i
				aria-hidden="true"
				className={cn(
					"voice-ring absolute inset-0 rounded-full",
					props.state === "starting" && "[animation-duration:1.6s]",
				)}
			/>
			<Lines />
		</>
	);
}

/**
 * What the circle holds while voice is off: the microphone, or a warning when
 * voice could not start.
 * @param props Whether something is wrong.
 * @param props.problem Whether voice cannot start or failed.
 * @returns The mark.
 */
function OffMark(props: { readonly problem: boolean }): JSX.Element {
	return props.problem ? (
		<RiErrorWarningLine aria-hidden="true" className="text-destructive size-5" />
	) : (
		<RiMicLine
			aria-hidden="true"
			className="text-muted-foreground group-hover/voice:text-primary-text size-5 transition-colors"
		/>
	);
}

export { VOICE_WORDS, VoiceCircle, circleState, type CircleState, type VoiceCircleProps };

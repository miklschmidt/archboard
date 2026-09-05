// The voice output wave: the official LiveKit Agents UI wave renderer driven
// by Archboard's typed voice state and the measured model output level, with
// accessible state text and static fallbacks for reduced motion and no WebGL.

import { cn } from "cn";
import { useState } from "react";

import { AgentAudioVisualizerWave } from "@/ui/voice-wave/agent-audio-visualizer-wave";
import {
	statusAccentColor,
	usePrefersReducedMotion,
	webGlAvailable,
} from "@/ui/voice-wave/lib/environment";
import { waveStateText } from "@/ui/voice-wave/wave-state";
import type { VoiceWaveState } from "@/ui/voice-wave/wave-state";

/** The renderer's height presets that fit a dock. */
type VoiceOutputWaveSize = "icon" | "sm" | "md";

/** Inputs for the wave. Every value is typed state; nothing here reads audio. */
interface VoiceOutputWaveProps {
	state: VoiceWaveState;
	/** Measured model output level, 0..1. */
	level: number;
	/** False stops the animation loop and shows the flat line. */
	active: boolean;
	/** Forces the static presentation; the media query is honoured either way. */
	reducedMotion?: boolean;
	size?: VoiceOutputWaveSize;
	/** Show the state text beside the wave rather than only to assistive tech. */
	showText?: boolean;
	className?: string;
}

/** Inputs for the static presentations. */
interface StaticWaveProps {
	state: VoiceWaveState;
	active: boolean;
	className: string | undefined;
}

/**
 * The static presentation: one status-coloured rule and the state text,
 * for reduced motion and for browsers without WebGL.
 * @param props The state and whether the session is live.
 * @returns A rule and the state text.
 */
function StaticWave(props: StaticWaveProps): React.JSX.Element {
	const live = props.active && props.state !== "inactive";
	return (
		<div
			data-voice-wave="static"
			className={cn("flex min-w-0 items-center gap-2", props.className)}
		>
			<span
				aria-hidden="true"
				className={cn("h-0.5 w-10 shrink-0 rounded-full", live ? "bg-status" : "bg-border")}
			/>
			<output aria-live="polite" className="text-muted-foreground truncate text-xs">
				{waveStateText(props.state)}
			</output>
		</div>
	);
}

/**
 * The voice output wave with its accessible state text.
 * @param props The typed voice output state.
 * @returns The animated wave, or a static fallback.
 */
function VoiceOutputWave(props: VoiceOutputWaveProps): React.JSX.Element {
	const prefersReducedMotion = usePrefersReducedMotion();
	const [webGl] = useState(webGlAvailable);
	const [color] = useState(statusAccentColor);
	const reducedMotion = props.reducedMotion === true || prefersReducedMotion;
	if (reducedMotion || !webGl) {
		return <StaticWave state={props.state} active={props.active} className={props.className} />;
	}
	const text = waveStateText(props.state);
	return (
		<div
			data-voice-wave="animated"
			className={cn("flex min-w-0 items-center gap-2", props.className)}
		>
			<AgentAudioVisualizerWave
				aria-hidden="true"
				size={props.size ?? "sm"}
				state={props.state}
				level={props.level}
				active={props.active}
				reducedMotion={false}
				color={color}
				colorShift={0}
			/>
			<output
				aria-live="polite"
				className={cn(
					"text-muted-foreground truncate text-xs",
					props.showText === true ? undefined : "sr-only",
				)}
			>
				{text}
			</output>
		</div>
	);
}

export {
	VoiceOutputWave,
	type VoiceOutputWaveProps,
	type VoiceOutputWaveSize,
	type VoiceWaveState,
};

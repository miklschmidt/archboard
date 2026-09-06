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
	size: VoiceOutputWaveSize;
	showText: boolean;
	className: string | undefined;
}

/**
 * The dock wave is a 120 by 24 strip, not the renderer's square; larger presets
 * keep the official square geometry.
 */
const WAVE_CLASS: Record<VoiceOutputWaveSize, string> = {
	icon: "aspect-auto h-6 w-[120px]",
	sm: "",
	md: "",
};

/** The static rule's width per size, matching the animated wave's box. */
const RULE_CLASS: Record<VoiceOutputWaveSize, string> = {
	icon: "w-[120px]",
	sm: "w-14",
	md: "w-28",
};

/**
 * Whether the session carries audio, which is when the wave is lime and moving.
 * @param state The voice output state.
 * @param active Whether the session is live.
 * @returns True while there is audio to follow.
 */
function isLive(state: VoiceWaveState, active: boolean): boolean {
	return active && state !== "inactive";
}

/**
 * The static presentation: one rule in the muted neutral, lime only while
 * live, and the state text. Shown before and after a session, under reduced
 * motion, and in browsers without WebGL.
 * @param props The state and whether the session is live.
 * @returns A rule and the state text.
 */
function StaticWave(props: StaticWaveProps): React.JSX.Element {
	const live = isLive(props.state, props.active);
	return (
		<div
			data-voice-wave="static"
			className={cn("flex min-w-0 items-center gap-2", props.className)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"flex h-6 shrink-0 items-center [mask-image:linear-gradient(90deg,transparent_0%,black_20%,black_80%,transparent_100%)]",
					RULE_CLASS[props.size],
				)}
			>
				<span className={cn("h-0.5 w-full", live ? "bg-status" : "bg-muted-foreground/40")} />
			</span>
			<output
				aria-live="polite"
				className={`text-body text-muted-foreground truncate ${props.showText ? "" : "sr-only"}`}
			>
				{waveStateText(props.state)}
			</output>
		</div>
	);
}

/**
 * Whether the wave must be the static rule: reduced motion, no WebGL, or no
 * audio to follow.
 * @param props The wave inputs.
 * @param reducedMotion Whether motion is reduced by preference or prop.
 * @param webGl Whether a WebGL context is available.
 * @returns True when the static presentation is shown.
 */
function usesStaticWave(
	props: VoiceOutputWaveProps,
	reducedMotion: boolean,
	webGl: boolean,
): boolean {
	return reducedMotion || !webGl || !isLive(props.state, props.active);
}

/**
 * The voice output wave with its accessible state text. The lime shader
 * runs only while the session carries audio; before and after, and under
 * reduced motion or without WebGL, the wave is the muted static rule.
 * @param props The typed voice output state.
 * @returns The animated wave, or a static fallback.
 */
function VoiceOutputWave(props: VoiceOutputWaveProps): React.JSX.Element {
	const prefersReducedMotion = usePrefersReducedMotion();
	const [webGl] = useState(webGlAvailable);
	const [color] = useState(statusAccentColor);
	const reducedMotion = props.reducedMotion === true || prefersReducedMotion;
	const size = props.size ?? "sm";
	const showText = props.showText === true;
	if (usesStaticWave(props, reducedMotion, webGl)) {
		return (
			<StaticWave
				state={props.state}
				active={props.active}
				size={size}
				showText={showText}
				className={props.className}
			/>
		);
	}
	return (
		<div
			data-voice-wave="animated"
			className={cn("flex min-w-0 items-center gap-2", props.className)}
		>
			<AgentAudioVisualizerWave
				aria-hidden="true"
				size={size}
				state={props.state}
				level={props.level}
				active={props.active}
				reducedMotion={false}
				color={color}
				colorShift={0}
				className={WAVE_CLASS[size]}
			/>
			<output
				aria-live="polite"
				className={`text-body text-muted-foreground truncate ${showText ? "" : "sr-only"}`}
			>
				{waveStateText(props.state)}
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

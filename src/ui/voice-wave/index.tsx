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
 * The dock wave is a 120×24 strip, not the renderer's square; larger presets
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
 * The voice output wave with its accessible state text.
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
	if (reducedMotion || !webGl) {
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

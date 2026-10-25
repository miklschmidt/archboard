// The voice, drawn: a gold ring round a lens of ruled lines that heave as the
// model speaks. It is only a picture. The control that holds it names the
// state in words, so the canvas is hidden from a screen reader.

import { useEffect, useRef, type CSSProperties, type JSX } from "react";

import { cn } from "@archboard/ui-kit/components";
import type { OrbMode } from "#ui/rules/orb/orb-dynamics.ts";
import { runOrb, type OrbRunner } from "#ui/clients/orb/orb-runner.ts";
import { SIZE } from "#ui/clients/orb/orb-painter.ts";

/** Inputs for the orb. */
interface VoiceOrbProps {
	readonly mode: OrbMode;
	/** The model's measured output level, 0..1, read on every frame. */
	readonly level: () => number;
	/** Whether the person asked for no motion: the orb is then drawn at rest. */
	readonly reducedMotion: boolean;
	readonly className?: string | undefined;
}

/** The canvas's size, which is fixed: the orb draws to it. */
const CANVAS_STYLE: CSSProperties = { width: SIZE, height: SIZE };

/**
 * The voice orb.
 * @param props The mode, the level, the motion preference and where it sits.
 * @returns The canvas it is drawn on.
 */
function VoiceOrb(props: VoiceOrbProps): JSX.Element {
	const canvas = useRef<HTMLCanvasElement>(null);
	const runner = useRef<OrbRunner | null>(null);
	const mode = useRef(props.mode);
	const level = useRef(props.level);
	const { reducedMotion } = props;
	useEffect(() => {
		const element = canvas.current;
		if (element === null) return undefined;
		const running = runOrb(element, { mode, level }, reducedMotion);
		runner.current = running;
		running.wake();
		return () => {
			running.stop();
			runner.current = null;
		};
	}, [reducedMotion]);
	useEffect(() => {
		mode.current = props.mode;
		level.current = props.level;
		runner.current?.wake();
	}, [props.mode, props.level]);
	return (
		<canvas
			ref={canvas}
			data-slot="voice-orb"
			aria-hidden="true"
			style={CANVAS_STYLE}
			className={cn("pointer-events-none block", props.className)}
		/>
	);
}

export { VoiceOrb, type VoiceOrbProps };

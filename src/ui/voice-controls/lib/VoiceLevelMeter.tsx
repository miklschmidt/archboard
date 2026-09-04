import type React from "react";

import { cn } from "@/ui/ui-classnames";

import { useVoiceLevel, type VoiceSession } from "../../voice-session/index.js";

/**
 * Eight segments, so the meter moves in steps rather than continuously. The
 * count is the whole visual vocabulary: a lit segment is structure, not colour,
 * and the reader is never asked to compare two hues to know how loud the room
 * is.
 */
const SEGMENTS = 8;
const SEGMENT_KEYS = Object.freeze(
	Array.from({ length: SEGMENTS }, (_value, index) => `segment-${index}`),
);

export interface VoiceLevelMeterProps {
	readonly session: VoiceSession;
	readonly className?: string;
}

/**
 * The microphone level, drawn only while a live run allows it.
 *
 * This component is mounted exactly when a meter is permitted, so its
 * subscription — which the realtime meter publishes on every animation frame —
 * exists for no longer than the run does. Nothing here is announced: the level
 * is supplemental to the named status the control always renders, so the whole
 * meter is `aria-hidden`.
 */
export function VoiceLevelMeter({ session, className }: VoiceLevelMeterProps): React.JSX.Element {
	const level = useVoiceLevel(session);
	const lit = Math.round(Math.min(1, Math.max(0, level)) * SEGMENTS);
	return (
		<span
			aria-hidden="true"
			className={cn("inline-flex items-center gap-rule", className)}
			data-voice-meter=""
			data-voice-meter-lit={lit}
		>
			{SEGMENT_KEYS.map((key, index) => (
				<span
					className="h-control-inline w-compact rounded-hairline bg-border transition-colors duration-control ease-control data-lit:bg-status"
					data-lit={index < lit ? "" : undefined}
					data-voice-meter-segment=""
					key={key}
				/>
			))}
		</span>
	);
}

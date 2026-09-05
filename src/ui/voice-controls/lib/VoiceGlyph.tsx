import {
	RiAlertLine,
	RiMicLine,
	RiMicOffLine,
	RiStopCircleLine,
	RiVoiceprintLine,
	RiVolumeUpLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import type React from "react";

import type { VoiceControlGlyph } from "../contract.js";

/** Decorative marks supplement the state labels and never carry status alone. */
const ICONS = {
	microphone: RiMicLine,
	"microphone-muted": RiMicOffLine,
	"microphone-off": RiMicOffLine,
	waveform: RiVoiceprintLine,
	speaker: RiVolumeUpLine,
	stopped: RiStopCircleLine,
	warning: RiAlertLine,
} as const satisfies Record<VoiceControlGlyph, RemixiconComponentType>;

export interface VoiceGlyphProps {
	readonly name: VoiceControlGlyph;
	readonly size?: number;
	readonly className?: string;
}

export function VoiceGlyph({ name, size = 16, className }: VoiceGlyphProps): React.JSX.Element {
	const Component = ICONS[name];
	return (
		<Component
			aria-hidden="true"
			className={className}
			data-voice-glyph={name}
			focusable="false"
			size={size}
		/>
	);
}

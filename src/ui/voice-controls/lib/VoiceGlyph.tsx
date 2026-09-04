import type React from "react";

import type { VoiceControlGlyph } from "../contract.js";

/**
 * A module-local mark per voice state. The shell's typed icon set has no
 * microphone, muted-microphone, or speaker mark, and `src/ui/shell` is not this
 * task's to change, so the seven voice glyphs live here — one place, one typed
 * map, exhaustive over the glyph union.
 *
 * The mark is decorative: every state renders its name as text beside it. The
 * glyph exists so the state is also distinguishable without reading, never so
 * that colour alone carries it.
 */
const PATHS = {
	microphone: (
		<>
			<rect x="9" y="3" width="6" height="11" rx="3" />
			<path d="M5 11a7 7 0 0 0 14 0" />
			<path d="M12 18v3" />
		</>
	),
	"microphone-muted": (
		<>
			<rect x="9" y="3" width="6" height="11" rx="3" />
			<path d="M5 11a7 7 0 0 0 14 0" />
			<path d="M12 18v3" />
			<path d="M4 4l16 16" />
		</>
	),
	"microphone-off": (
		<>
			<path d="M9 6a3 3 0 0 1 6 0v5" />
			<path d="M5 11a7 7 0 0 0 11 5.5" />
			<path d="M4 4l16 16" />
		</>
	),
	waveform: (
		<>
			<path d="M4 12v0" />
			<path d="M7 8v8" />
			<path d="M11 5v14" />
			<path d="M15 8v8" />
			<path d="M19 10v4" />
		</>
	),
	speaker: (
		<>
			<path d="M5 9h3l4-4v14l-4-4H5z" />
			<path d="M16 9a4 4 0 0 1 0 6" />
			<path d="M19 6a8 8 0 0 1 0 12" />
		</>
	),
	stopped: (
		<>
			<circle cx="12" cy="12" r="8" />
			<rect x="9" y="9" width="6" height="6" rx="1" />
		</>
	),
	warning: (
		<>
			<path d="M12 4l8 15H4z" />
			<path d="M12 10v4" />
			<path d="M12 16.5v.5" />
		</>
	),
} as const satisfies Record<VoiceControlGlyph, React.ReactNode>;

export interface VoiceGlyphProps {
	readonly name: VoiceControlGlyph;
	readonly size?: number;
	readonly className?: string;
}

export function VoiceGlyph({ name, size = 16, className }: VoiceGlyphProps): React.JSX.Element {
	return (
		<svg
			aria-hidden="true"
			className={className}
			data-voice-glyph={name}
			fill="none"
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.8}
			viewBox="0 0 24 24"
			width={size}
		>
			{PATHS[name]}
		</svg>
	);
}

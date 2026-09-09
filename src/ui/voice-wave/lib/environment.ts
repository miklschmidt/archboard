// What the browser can do for the wave: WebGL and the status accent colour.
// Each is read once and cached, never polled.

import { FALLBACK_STATUS_COLOR } from "@/ui/voice-wave/wave-state";

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

let webGlProbe: boolean | null = null;

/**
 * Whether this browser can hand out a WebGL context. Probed once on a
 * throwaway canvas; the shader host draws nothing and reports nothing when the
 * context is missing, so the caller needs to know beforehand.
 * @returns True when a WebGL context was obtained.
 */
function webGlAvailable(): boolean {
	if (webGlProbe !== null) {
		return webGlProbe;
	}
	try {
		const canvas = document.createElement("canvas");
		webGlProbe = canvas.getContext("webgl") !== null;
	} catch {
		webGlProbe = false;
	}
	return webGlProbe;
}

/**
 * The lime status accent as the theme defines `--status`, in the hex form the
 * wave shader takes. Both themes define the same value; the fallback is that
 * value for a document whose styles have not applied yet.
 * @returns A `#rrggbb` colour.
 */
function statusAccentColor(): `#${string}` {
	const value = getComputedStyle(document.documentElement).getPropertyValue("--status").trim();
	return isHexColor(value) ? value : FALLBACK_STATUS_COLOR;
}

/**
 * Whether a computed style value is a six-digit hex colour.
 * @param value The trimmed custom property value.
 * @returns True for `#rrggbb`.
 */
function isHexColor(value: string): value is `#${string}` {
	return HEX_COLOR.test(value);
}

export { statusAccentColor, webGlAvailable };

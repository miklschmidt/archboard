// Whether a part the pointer rests on dims the rest of the picture.
//
// The choice is presentation, owned by this browser like the theme, remembered
// in its storage and never written anywhere else (ADR 0023). A pick, a trace and
// a row of the sidebar light the picture either way.

/** Whether the pointer lights what it rests on. */
type HoverLight = "on" | "off";

/** Where the choice is remembered. */
const HOVER_LIGHT_KEY = "archboard.hover-light";

/** What the switch offers. */
const HOVER_LIGHTS: readonly { readonly value: HoverLight; readonly label: string }[] = [
	{ value: "on", label: "On" },
	{ value: "off", label: "Off" },
];

/**
 * The choice this browser remembers, or the default.
 * @returns The choice.
 */
function remembered(): HoverLight {
	try {
		return globalThis.localStorage.getItem(HOVER_LIGHT_KEY) === "off" ? "off" : "on";
	} catch {
		return "on";
	}
}

let current: HoverLight | undefined;
const listeners = new Set<() => void>();

/**
 * The choice now.
 * @returns The choice.
 */
function hoverLightNow(): HoverLight {
	current ??= remembered();
	return current;
}

/**
 * Change the choice from now on, and remember it.
 * @param light The choice.
 */
function chooseHoverLight(light: HoverLight): void {
	if (light === hoverLightNow()) return;
	current = light;
	try {
		globalThis.localStorage.setItem(HOVER_LIGHT_KEY, light);
	} catch {
		// Storage can be unavailable; the choice still holds for this page.
	}
	for (const listener of listeners) listener();
}

/**
 * Be told when the choice changes.
 * @param listener Called after each change.
 * @returns Stops telling.
 */
function onHoverLightChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export { HOVER_LIGHTS, chooseHoverLight, hoverLightNow, onHoverLightChange, type HoverLight };

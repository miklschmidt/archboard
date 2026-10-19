// Presenting one pane fullscreen: one owned root, the pane wanted on it, and a browser that may
// refuse, lose or answer late.
export { createFullscreenPresentation } from "#ui/state/fullscreen-presentation.ts";
export type {
	FullscreenPresentation,
	FullscreenPresentationSnapshot,
} from "#ui/state/fullscreen-presentation.ts";

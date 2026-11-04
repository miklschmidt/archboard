// The voice orb of the product's agent dock, drawn by the product's own runner, dynamics and
// painter (packages/workbench/src/ui/clients/orb). It is a lens in a gold ring, and eleven ruled
// lines on the lens record the voice's level: a syllable swells in the middle of the front line
// and rolls back through the sheet as it ages. In the product the level is the Codex voice's
// measured output. Here the subtitles' words stand in for it. The orb runs only while it is on
// screen, and with reduced motion it rests in its mode.

import { runOrb } from "../../../packages/workbench/src/ui/clients/orb/orb-runner.ts";
import type { OrbMode } from "../../../packages/workbench/src/ui/rules/orb/orb-dynamics.ts";
import { prefersReducedMotion, whileVisible } from "./reveal";

export type { OrbMode };

/** What the page tells the orb, read again on every frame. */
export interface OrbFeed {
	/** The voice's stage: starting while it connects, speaking while it talks. */
	mode: () => OrbMode;
	/** The voice's output level now, 0..1. Speech sits under 0.2, as the product measures it. */
	level: () => number;
}

/**
 * Run the voice orb on its canvas.
 * @param canvas The orb's canvas, 84 CSS pixels square with the ring 64 pixels across.
 * @param feed The mode and the level.
 * @returns Draw again now: call it when the mode changes, so a resting orb shows the new mode.
 */
export function mountVoiceOrb(canvas: HTMLCanvasElement, feed: OrbFeed): () => void {
	const orbFeed = {
		mode: {
			get current() {
				return feed.mode();
			},
		},
		level: { current: feed.level },
	};
	let still = prefersReducedMotion();
	let runner = runOrb(canvas, orbFeed, still);
	let visible = false;
	whileVisible(canvas, (next) => {
		visible = next;
		if (visible) runner.wake();
		else runner.stop();
	});
	window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
		still = event.matches;
		runner.stop();
		runner = runOrb(canvas, orbFeed, still);
		if (visible) runner.wake();
	});
	return () => {
		if (visible) runner.wake();
	};
}

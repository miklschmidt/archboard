// The voice orb of the product's agent dock, drawn by the product's own runner, dynamics and
// painter (packages/workbench/src/ui/workbench-client/orb/clients). It is a lens in a gold ring, and eleven ruled
// lines on the lens record the voice's level: a syllable swells in the middle of the front line
// and rolls back through the sheet as it ages. In the product the level is the Codex voice's
// measured output. Here the subtitles' words stand in for it. The orb runs only while it is on
// screen, and with reduced motion it rests in its mode.

import { runOrb } from "../../../packages/workbench/src/ui/workbench-client/orb/clients/orb-runner.ts";
import type { OrbMode } from "../../../packages/workbench/src/ui/workbench-client/orb/rules/orb-dynamics.ts";
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

/** A word being said: when it started, how long it sounds, its syllables and how loud it is. */
export interface SpokenWord {
	at: number;
	ms: number;
	syllables: number;
	peak: number;
}

/**
 * Say a word at the pace of normal speech.
 * @param text The word.
 * @param at When it starts, in milliseconds.
 * @returns The word, and how long it takes before the next word starts.
 */
export function sayWord(text: string, at: number): { word: SpokenWord; ms: number } {
	const ms = 150 + text.length * 38;
	return {
		word: {
			at,
			ms: ms * 0.8,
			syllables: Math.max(1, Math.round(text.length / 3)),
			peak: 0.025 + Math.min(0.045, text.length * 0.006),
		},
		ms,
	};
}

/**
 * The voice's level as it says a word: one swell for each syllable, the first the loudest.
 * @param word The word being said, if any.
 * @param now The time now, in milliseconds.
 * @returns The level, 0..1.
 */
export function wordLevel(word: SpokenWord | null, now: number): number {
	if (!word) return 0;
	const t = now - word.at;
	if (t < 0 || t >= word.ms) return 0;
	const step = word.ms / word.syllables;
	const loudness = Math.floor(t / step) === 0 ? 1 : 0.75;
	return word.peak * loudness * Math.sin((Math.PI * (t % step)) / step);
}

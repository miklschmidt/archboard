// How the orb moves, stepped by hand a frame at a time. The orb is a few numbers
// that ease toward where the voice is, and what a person sees is those numbers.
// A canvas draws them and is not tested here.

import { expect, test } from "bun:test";

import {
	createOrbDynamics,
	levelAgo,
	orbMoves,
	restOrb,
	stepOrb,
	type OrbDynamics,
	type OrbMode,
} from "#ui/rules/orb/orb-dynamics.ts";

/** One frame at 60 Hz. */
const FRAME_MS = 16.7;

/**
 * Run the orb in a mode, at a level, for a while.
 * @param dyn The state.
 * @param mode The mode.
 * @param level The measured level, or a function of the frame for a level that moves.
 * @param ms How long.
 */
function run(
	dyn: OrbDynamics,
	mode: OrbMode,
	level: number | ((frame: number) => number),
	ms: number,
): void {
	for (let frame = 0; frame * FRAME_MS < ms; frame += 1) {
		stepOrb(dyn, { mode, level: typeof level === "number" ? level : level(frame) }, FRAME_MS);
	}
}

test("the orb lights while the model speaks and goes dark, and still, once voice ends", () => {
	const dyn = createOrbDynamics();
	run(dyn, "speaking", 0.15, 2500);
	expect(dyn.presence.x).toBeGreaterThan(0.99);
	expect(dyn.voice).toBeGreaterThan(0.5);
	expect(orbMoves(dyn, "speaking")).toBe(true);
	run(dyn, "ending", 0, 1500);
	run(dyn, "off", 0, 1500);
	expect(dyn.presence.x).toBeLessThan(0.002);
	expect(orbMoves(dyn, "off")).toBe(false);
});

test("a ragged loud level sends rings one at a time, never a ring a frame", () => {
	const dyn = createOrbDynamics();
	run(dyn, "listening", 0, 1500);
	let sent = 0;
	let most = 0;
	for (let frame = 0; frame * FRAME_MS < 3000; frame += 1) {
		const before = dyn.pulses.length;
		stepOrb(dyn, { mode: "speaking", level: frame % 2 === 0 ? 0.28 : 0.02 }, FRAME_MS);
		sent += Math.max(0, dyn.pulses.length - before);
		most = Math.max(most, dyn.pulses.length);
	}
	expect(sent).toBeGreaterThan(0);
	expect(sent).toBeLessThan(12);
	expect(most).toBeLessThanOrEqual(3);
	run(dyn, "speaking", 0, 1500);
	expect(dyn.pulses).toHaveLength(0);
});

test("a line records what the model's level was: a burst shows where it was, then ages out", () => {
	const dyn = createOrbDynamics();
	run(dyn, "speaking", 0.2, 240);
	run(dyn, "speaking", 0, 600);
	expect(levelAgo(dyn, 700)).toBeGreaterThan(0.5);
	expect(levelAgo(dyn, 0)).toBeLessThan(0.05);
	run(dyn, "speaking", 0, 1800);
	expect(levelAgo(dyn, 700)).toBeLessThan(0.05);
});

test("a mute hushes the orb: the lines go flat and it gives the room no light", () => {
	const dyn = createOrbDynamics();
	run(dyn, "speaking", 0.2, 2000);
	run(dyn, "muted", 0.2, 1500);
	expect(dyn.hush.x).toBeGreaterThan(0.95);
	expect(dyn.voice).toBeLessThan(0.01);
});

test("a tab that was hidden comes back to the same orb, not a jump", () => {
	const away = createOrbDynamics();
	const near = createOrbDynamics();
	stepOrb(away, { mode: "listening", level: 0 }, 60_000);
	stepOrb(near, { mode: "listening", level: 0 }, 50);
	expect(away.presence.x).toBeCloseTo(near.presence.x, 6);
	expect(Number.isFinite(away.presence.v)).toBe(true);
});

test("a person who asked for no motion gets each mode at rest", () => {
	const dyn = createOrbDynamics();
	restOrb(dyn, "speaking");
	expect(dyn.presence.x).toBe(1);
	expect(dyn.pulses).toHaveLength(0);
	restOrb(dyn, "off");
	expect(orbMoves(dyn, "off")).toBe(false);
});
